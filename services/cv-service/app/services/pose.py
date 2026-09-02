"""Batting measurements from pose estimation on a video.

Uses MediaPipe's Tasks API (PoseLandmarker) against pose_world_landmarks —
real-world metric coordinates centered at the hip midpoint. That's what lets
head_stability come out in real centimeters, and weight_transfer be expressed
as a percentage of the player's own base width, without needing camera
calibration; the default normalized image-space landmarks alone can't give
you that.

NOTE: mediapipe's legacy `mp.solutions.pose` API has been removed in current
releases, and the newest release (1.0.1) requires a native library built for
macOS 14+. This module is written against and pinned to mediapipe==0.10.21,
the last version confirmed to run in this project's dev environment — see
requirements.txt for the exact pins (opencv/numpy included, since they
conflict with each other above certain versions).
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions

from app.core.config import settings

# BlazePose 33-point topology (Tasks API), same indices as MediaPipe's docs.
# Landmark left/right is the *subject's own anatomical* left/right (inferred
# by the pose model from body structure), not which side of the frame it
# appears on — so front/back-foot assignment below depends only on batting
# hand, not camera placement.
NOSE = 0
LEFT_HIP = 23
RIGHT_HIP = 24
LEFT_ANKLE = 27
RIGHT_ANKLE = 28

MIN_VALID_FRAMES = 5
TARGET_SAMPLE_FPS = 5
MAX_SAMPLED_FRAMES = 90
BASELINE_FRACTION = 0.1  # first 10% of valid frames define the stance baseline
LANDMARK_MIN_SCORE = 0.5


class InsufficientDetectionError(Exception):
    """Raised when too few sampled frames produce a usable pose detection."""

    def __init__(self, frames_with_detection: int, frame_count: int):
        self.frames_with_detection = frames_with_detection
        self.frame_count = frame_count
        super().__init__(
            f"Only {frames_with_detection}/{frame_count} sampled frames had a usable "
            f"pose detection (need at least {MIN_VALID_FRAMES})."
        )


@dataclass
class FrameSample:
    """One sampled frame's relevant landmark x-coordinates (world-space
    meters) and per-landmark visibility, independent of which measurement
    ends up using them — each compute_* function does its own filtering."""

    nose_x: float
    nose_visibility: float
    left_hip_x: float
    left_hip_visibility: float
    right_hip_x: float
    right_hip_visibility: float
    left_ankle_x: float
    left_ankle_visibility: float
    right_ankle_x: float
    right_ankle_visibility: float

    @property
    def hip_mid_x(self) -> float:
        return (self.left_hip_x + self.right_hip_x) / 2

    @property
    def hips_ok(self) -> bool:
        return (
            self.left_hip_visibility > LANDMARK_MIN_SCORE
            and self.right_hip_visibility > LANDMARK_MIN_SCORE
        )


@dataclass
class HeadStabilityResult:
    value_cm: float
    confidence: float
    frame_count: int
    frames_with_detection: int


@dataclass
class WeightTransferResult:
    value_percent: float
    confidence: float
    frame_count: int
    frames_with_detection: int


@dataclass
class BattingAnalysisResult:
    head_stability: HeadStabilityResult
    weight_transfer: WeightTransferResult | None
    weight_transfer_skip_reason: str | None


def _sample_frame_indices(total_frames: int, source_fps: float) -> list[int]:
    if source_fps <= 0:
        source_fps = 30.0
    step = max(1, round(source_fps / TARGET_SAMPLE_FPS))
    return list(range(0, total_frames, step))[:MAX_SAMPLED_FRAMES]


def _landmark_ok(landmark) -> bool:
    return landmark.visibility > LANDMARK_MIN_SCORE and landmark.presence > LANDMARK_MIN_SCORE


def _run_pose_detection(video_path: str) -> tuple[list[FrameSample], int]:
    """Runs pose estimation once on sampled frames of `video_path`, extracting
    every landmark any measurement in this module needs. Shared across
    head_stability and weight_transfer so a single analysis call only pays
    for pose estimation once, not once per marker.

    Raises FileNotFoundError if the pose model isn't present, ValueError if
    the video can't be opened.
    """
    model_path = settings.pose_model_path
    if not os.path.isfile(model_path):
        raise FileNotFoundError(
            f"Pose model not found at {model_path} — run scripts/download_model.sh."
        )

    options = vision.PoseLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=1,
    )

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")

    samples: list[FrameSample] = []
    frame_count = 0

    try:
        source_fps = cap.get(cv2.CAP_PROP_FPS)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        sample_indices = set(_sample_frame_indices(total_frames, source_fps))

        with vision.PoseLandmarker.create_from_options(options) as landmarker:
            index = 0
            while True:
                ok, frame_bgr = cap.read()
                if not ok:
                    break
                if index in sample_indices:
                    frame_count += 1
                    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
                    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
                    timestamp_ms = int((index / (source_fps or 30.0)) * 1000)
                    result = landmarker.detect_for_video(mp_image, timestamp_ms)

                    if result.pose_world_landmarks:
                        lm = result.pose_world_landmarks[0]
                        samples.append(
                            FrameSample(
                                nose_x=lm[NOSE].x,
                                nose_visibility=(
                                    lm[NOSE].visibility if _landmark_ok(lm[NOSE]) else 0.0
                                ),
                                left_hip_x=lm[LEFT_HIP].x,
                                left_hip_visibility=(
                                    lm[LEFT_HIP].visibility if _landmark_ok(lm[LEFT_HIP]) else 0.0
                                ),
                                right_hip_x=lm[RIGHT_HIP].x,
                                right_hip_visibility=(
                                    lm[RIGHT_HIP].visibility
                                    if _landmark_ok(lm[RIGHT_HIP])
                                    else 0.0
                                ),
                                left_ankle_x=lm[LEFT_ANKLE].x,
                                left_ankle_visibility=(
                                    lm[LEFT_ANKLE].visibility
                                    if _landmark_ok(lm[LEFT_ANKLE])
                                    else 0.0
                                ),
                                right_ankle_x=lm[RIGHT_ANKLE].x,
                                right_ankle_visibility=(
                                    lm[RIGHT_ANKLE].visibility
                                    if _landmark_ok(lm[RIGHT_ANKLE])
                                    else 0.0
                                ),
                            )
                        )
                index += 1
    finally:
        cap.release()

    return samples, frame_count


def _compute_head_stability_from_samples(
    samples: list[FrameSample], frame_count: int
) -> HeadStabilityResult:
    valid = [s for s in samples if s.nose_visibility > LANDMARK_MIN_SCORE and s.hips_ok]

    if len(valid) < MIN_VALID_FRAMES:
        raise InsufficientDetectionError(len(valid), frame_count)

    baseline_count = max(1, round(len(valid) * BASELINE_FRACTION))
    baseline = sum(s.nose_x - s.hip_mid_x for s in valid[:baseline_count]) / baseline_count

    peak_drift_m = max(abs((s.nose_x - s.hip_mid_x) - baseline) for s in valid)
    mean_confidence = sum(
        (s.nose_visibility + s.left_hip_visibility + s.right_hip_visibility) / 3 for s in valid
    ) / len(valid)

    return HeadStabilityResult(
        value_cm=round(peak_drift_m * 100, 2),
        confidence=round(mean_confidence, 3),
        frame_count=frame_count,
        frames_with_detection=len(valid),
    )


def compute_head_stability(video_path: str) -> HeadStabilityResult:
    """Runs pose estimation on `video_path` and returns the peak
    head-drift-from-stance-baseline measurement, in centimeters. Thin wrapper
    around the shared extraction pass, kept for direct testability and
    backward compatibility with existing callers/tests."""
    samples, frame_count = _run_pose_detection(video_path)
    return _compute_head_stability_from_samples(samples, frame_count)


def _front_back_attrs(batting_hand: str) -> tuple[str, str]:
    """Returns (front_prefix, back_prefix), each "left" or "right", used to
    read the matching *_x / *_visibility attributes off a FrameSample.
    Standard cricket stance: front side faces the bowler. Right-hand batter
    -> front foot is their own left foot; left-hand batter -> mirrored."""
    if batting_hand == "right":
        return "left", "right"
    if batting_hand == "left":
        return "right", "left"
    raise ValueError(f"batting_hand must be 'left' or 'right', got {batting_hand!r}")


def compute_weight_transfer_from_samples(
    samples: list[FrameSample], batting_hand: str
) -> WeightTransferResult | None:
    """Pure landmark-driven computation — no video/MediaPipe involved, so
    this is directly unit-testable with hand-built FrameSample sequences.

    Peak forward hip displacement toward the front foot, expressed as a
    percentage of the player's own stance base width (ankle-to-ankle
    distance): 0% = hip center at the back ankle's line, 100% = hip center
    at the front ankle's line, >100% = hip center has passed the front
    ankle ("overbalanced" — not a separately stored flag, just this value
    being over 100).

    This ratio form is camera-orientation-agnostic by construction: it
    doesn't matter which side of the frame is which, only which named
    landmark (front vs back, from batting_hand) is on which side.

    Returns None if too few frames have both hips and the relevant ankle
    pair visible — a valid "not enough evidence for this marker" outcome,
    not an error, since head_stability may still have succeeded from the
    same video.
    """
    front, back = _front_back_attrs(batting_hand)

    def ankle_x(s: FrameSample, side: str) -> float:
        return s.left_ankle_x if side == "left" else s.right_ankle_x

    def ankle_visibility(s: FrameSample, side: str) -> float:
        return s.left_ankle_visibility if side == "left" else s.right_ankle_visibility

    valid = [
        s
        for s in samples
        if s.hips_ok
        and ankle_visibility(s, front) > LANDMARK_MIN_SCORE
        and ankle_visibility(s, back) > LANDMARK_MIN_SCORE
    ]

    if len(valid) < MIN_VALID_FRAMES:
        return None

    baseline_count = max(1, round(len(valid) * BASELINE_FRACTION))
    baseline_base_width = (
        sum(abs(ankle_x(s, front) - ankle_x(s, back)) for s in valid[:baseline_count])
        / baseline_count
    )

    if baseline_base_width <= 0:
        return None

    def percent_of_base(s: FrameSample) -> float:
        return (s.hip_mid_x - ankle_x(s, back)) / (ankle_x(s, front) - ankle_x(s, back)) * 100

    peak_percent = max(percent_of_base(s) for s in valid)
    mean_confidence = sum(
        (
            s.left_hip_visibility
            + s.right_hip_visibility
            + ankle_visibility(s, front)
            + ankle_visibility(s, back)
        )
        / 4
        for s in valid
    ) / len(valid)

    return WeightTransferResult(
        value_percent=round(peak_percent, 2),
        confidence=round(mean_confidence, 3),
        frame_count=len(samples),
        frames_with_detection=len(valid),
    )


def compute_weight_transfer(video_path: str, batting_hand: str) -> WeightTransferResult | None:
    """Video-driving wrapper mirroring compute_head_stability's shape."""
    samples, _frame_count = _run_pose_detection(video_path)
    return compute_weight_transfer_from_samples(samples, batting_hand)


def analyze_batting_video(
    video_path: str, batting_hand: str | None
) -> BattingAnalysisResult:
    """The real entry point the API route calls: runs pose detection once,
    computes head_stability (always — failure here raises, same as before),
    and weight_transfer (only if batting_hand is known and ankles were
    detected confidently enough — absence is a valid outcome, not a raised
    error, so one marker's limitation never blocks the other)."""
    samples, frame_count = _run_pose_detection(video_path)

    head_stability = _compute_head_stability_from_samples(samples, frame_count)

    if batting_hand is None:
        return BattingAnalysisResult(
            head_stability=head_stability,
            weight_transfer=None,
            weight_transfer_skip_reason="batting_hand not provided",
        )

    weight_transfer = compute_weight_transfer_from_samples(samples, batting_hand)
    return BattingAnalysisResult(
        head_stability=head_stability,
        weight_transfer=weight_transfer,
        weight_transfer_skip_reason=(
            None if weight_transfer is not None else "insufficient ankle detection"
        ),
    )
