"""Head-stability measurement: pose estimation on a batting-motion video.

Uses MediaPipe's Tasks API (PoseLandmarker) against pose_world_landmarks —
real-world metric coordinates centered at the hip midpoint. That's what lets
this come out in real centimeters without needing camera calibration; the
default normalized image-space landmarks alone can't give you that.

NOTE: mediapipe's legacy `mp.solutions.pose` API has been removed in current
releases, and the newest release (1.0.1) requires a native library built for
macOS 14+. This module is written against and pinned to mediapipe==0.10.21,
the last version confirmed to run in this project's dev environment — see
requirements.txt for the exact pins (opencv/numpy included, since they
conflict with each other above certain versions).
"""

import os
from dataclasses import dataclass

import cv2
import mediapipe as mp
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core.base_options import BaseOptions

from app.core.config import settings

# BlazePose 33-point topology (Tasks API), same indices as MediaPipe's docs.
NOSE = 0
LEFT_HIP = 23
RIGHT_HIP = 24

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
class HeadStabilityResult:
    value_cm: float
    confidence: float
    frame_count: int
    frames_with_detection: int


def _sample_frame_indices(total_frames: int, source_fps: float) -> list[int]:
    if source_fps <= 0:
        source_fps = 30.0
    step = max(1, round(source_fps / TARGET_SAMPLE_FPS))
    return list(range(0, total_frames, step))[:MAX_SAMPLED_FRAMES]


def _landmark_ok(landmark) -> bool:
    return landmark.visibility > LANDMARK_MIN_SCORE and landmark.presence > LANDMARK_MIN_SCORE


def compute_head_stability(video_path: str) -> HeadStabilityResult:
    """Runs pose estimation on sampled frames of `video_path` and returns the
    peak head-drift-from-stance-baseline measurement, in centimeters.

    Raises FileNotFoundError if the pose model isn't present, ValueError if
    the video can't be opened, InsufficientDetectionError if too few sampled
    frames produce a usable pose.
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

    head_offsets: list[float] = []
    confidences: list[float] = []
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
                        landmarks = result.pose_world_landmarks[0]
                        nose = landmarks[NOSE]
                        left_hip = landmarks[LEFT_HIP]
                        right_hip = landmarks[RIGHT_HIP]
                        all_visible = all(
                            _landmark_ok(lm) for lm in (nose, left_hip, right_hip)
                        )
                        if all_visible:
                            hip_mid_x = (left_hip.x + right_hip.x) / 2
                            head_offsets.append(nose.x - hip_mid_x)
                            confidences.append(
                                (nose.visibility + left_hip.visibility + right_hip.visibility) / 3
                            )
                index += 1
    finally:
        cap.release()

    frames_with_detection = len(head_offsets)
    if frames_with_detection < MIN_VALID_FRAMES:
        raise InsufficientDetectionError(frames_with_detection, frame_count)

    baseline_count = max(1, round(frames_with_detection * BASELINE_FRACTION))
    baseline = sum(head_offsets[:baseline_count]) / baseline_count

    peak_drift_m = max(abs(offset - baseline) for offset in head_offsets)

    return HeadStabilityResult(
        value_cm=round(peak_drift_m * 100, 2),
        confidence=round(sum(confidences) / len(confidences), 3),
        frame_count=frame_count,
        frames_with_detection=frames_with_detection,
    )
