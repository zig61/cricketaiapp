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

# Part 3 (confidence gating plan, 2026-09-06): if nothing at all has been
# detected after this many attempted samples, neither marker is going to
# work from this video — bail out of the remaining ~75 frames rather than
# running the full detection pass for a doomed result. Deliberately does
# NOT try to bail early just because weight_transfer specifically looks
# doomed (ankles bad, hips fine) — head_stability still needs every
# remaining frame from the same shared pass, so that case can't be
# skipped without giving up a marker that's still viable.
EARLY_BAILOUT_CHECKPOINT = 15

# Confidence classification thresholds — first estimate, sized to get the
# known real cases right (see pose.py tests), not validated against real
# coaching data or more than a handful of real videos. Expect to retune.
CONFIDENCE_HIGH_THRESHOLD = 0.75
CONFIDENCE_MEDIUM_THRESHOLD = 0.4


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
class ConfidenceBreakdown:
    """The three components `confidence` is now built from (see
    docs referenced in the 2026-09-06 confidence-gating plan): landmark
    visibility alone was the *entire* confidence signal until now, which is
    exactly what let a geometrically-nonsensical measurement (0.27cm base
    width, ~97% visibility) look fully trustworthy. overall_score is
    min(visibility, consistency, geometry) — deliberately the minimum, not
    a weighted average, so one bad component can't be diluted by two good
    ones."""

    visibility_score: float
    consistency_score: float
    geometry_score: float
    overall_score: float


def classify_confidence(score: float) -> str:
    """"high" / "medium" / "low" — thresholds are a first estimate, see the
    module-level constants' comment. Deliberately set so "low" (< 0.4)
    falls entirely below the pipeline's existing candidate-confidence floor
    (0.5, in coordinator-api's diagnose.ts) -- a low-confidence measurement
    is excluded from ever becoming a diagnosable issue by that pre-existing
    mechanism once this score feeds it, with no separate gate needed here."""
    if score >= CONFIDENCE_HIGH_THRESHOLD:
        return "high"
    if score >= CONFIDENCE_MEDIUM_THRESHOLD:
        return "medium"
    return "low"


@dataclass
class HeadStabilityResult:
    value_cm: float
    confidence: float
    confidence_breakdown: ConfidenceBreakdown
    frame_count: int
    frames_with_detection: int
    # Real bug found live (2026-09-06): head_stability and weight_transfer
    # both read the same world-space x axis. In a correctly side-on video
    # that axis is the front-foot/back-foot line, so a batter driving
    # through the ball moves their head forward along the *same* axis
    # weight_transfer measures as (correct) forward press -- the old
    # formula (raw drift from a pre-shot baseline) couldn't tell that
    # apart from the head genuinely falling away. True when there were
    # enough frames with reliable ankle detection to isolate the residual
    # not explained by weight-transfer progress (see
    # _compute_head_stability_from_samples); False means it fell back to
    # the old raw-drift formula, which still conflates the two.
    isolated_from_weight_transfer: bool


@dataclass
class WeightTransferResult:
    value_percent: float
    confidence: float
    confidence_breakdown: ConfidenceBreakdown
    frame_count: int
    frames_with_detection: int


@dataclass
class WeightTransferDiagnostics:
    """Always computed, regardless of whether weight_transfer succeeds —
    lets a null result be debugged (is it "ankles almost never detected"
    or "detected but just below the confidence bar"?) without re-running
    anything, instead of a single opaque skip reason."""

    total_sampled_frames: int
    frames_with_hips_ok: int
    frames_with_front_ankle_ok: int
    frames_with_back_ankle_ok: int
    frames_with_both_ankles_ok: int
    mean_front_ankle_visibility: float
    mean_back_ankle_visibility: float
    baseline_base_width_m: float | None


@dataclass
class BattingAnalysisResult:
    head_stability: HeadStabilityResult
    weight_transfer: WeightTransferResult | None
    weight_transfer_skip_reason: str | None
    weight_transfer_diagnostics: WeightTransferDiagnostics | None


def _linear_residuals(x: list[float], y: list[float]) -> list[float]:
    """Least-squares residuals of y against a best-fit line through x --
    how much each y deviates from what x alone would predict. Falls back to
    y's deviation from its own mean when x has no spread (e.g. weight never
    shifted during the clip), since no line is fittable through a single x
    value. Plain-python, not numpy: two-variable OLS is a handful of sums,
    and this keeps the regression trivially unit-testable in isolation."""
    n = len(x)
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    var_x = sum((xi - mean_x) ** 2 for xi in x)
    if var_x == 0:
        return [yi - mean_y for yi in y]
    cov_xy = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(x, y))
    slope = cov_xy / var_x
    intercept = mean_y - slope * mean_x
    return [yi - (intercept + slope * xi) for xi, yi in zip(x, y)]


def _sample_step(source_fps: float) -> int:
    if source_fps <= 0:
        source_fps = 30.0
    return max(1, round(source_fps / TARGET_SAMPLE_FPS))


def _landmark_ok(landmark) -> bool:
    return landmark.visibility > LANDMARK_MIN_SCORE and landmark.presence > LANDMARK_MIN_SCORE


def _ramp(value: float, low: float, high: float) -> float:
    """Linear ramp from 0 at `low` to 1 at `high` (or the reverse if
    low > high), clamped to [0, 1]. Shared shape for every geometry-score
    band below."""
    if low == high:
        return 1.0 if value == low else 0.0
    t = (value - low) / (high - low)
    return max(0.0, min(1.0, t))


def _weight_transfer_geometry_score(base_width_m: float) -> float:
    """How plausible `base_width_m` is as a real human ankle-to-ankle
    stance width, scored continuously instead of the binary hard floor
    below. Bands are a first estimate (2026-09-06 confidence-gating plan),
    not validated against real coaching data:

      < 0.05m           : never reaches this function -- MIN_RELIABLE_BASE_WIDTH_M
                           already returns None entirely (unchanged).
      0.05m -- 0.20m     : ramps 0 -> 1 -- the new borderline band. A camera
                           angle that compresses stance width to e.g. 10cm
                           (passes the hard floor, still clearly wrong) now
                           scores ~0.33 here instead of passing silently.
      0.20m -- 0.45m     : plausible human stance range, score = 1.0.
      0.45m -- 0.70m     : ramps 1 -> 0 -- implausibly *wide* is equally
                           suspect (could mean a mistracked landmark).
      > 0.70m            : score = 0.
    """
    if base_width_m < 0.20:
        return _ramp(base_width_m, 0.05, 0.20)
    if base_width_m <= 0.45:
        return 1.0
    return _ramp(base_width_m, 0.70, 0.45)


def _head_stability_geometry_score(peak_drift_m: float, hip_width_m: float) -> float:
    """head_stability has no denominator, so no collapse-to-near-zero
    failure mode the way weight_transfer does -- it degrades gracefully
    with a bad angle rather than catastrophically. The available geometry
    signal instead: cross-check the peak drift against the player's own
    hip width (already extracted, no new landmarks needed). A head moving
    multiple times its own hip width is implausible and suggests a
    tracking glitch, not real technique. Bands are a first estimate, sized
    to keep the one real validated case (17.14cm drift, ~HIGH) comfortably
    inside the plausible band -- not validated beyond that.
    """
    if hip_width_m <= 0:
        return 0.0
    ratio = peak_drift_m / hip_width_m
    if ratio <= 1.0:
        return 1.0
    if ratio >= 2.5:
        return 0.0
    return _ramp(ratio, 2.5, 1.0)


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
        # Deliberately not using CAP_PROP_FRAME_COUNT to decide which frames
        # to sample: browser-recorded webm blobs (MediaRecorder) routinely
        # report it as 0 -- the container has no finalized index -- which
        # made the old range(0, total_frames, step) sampling silently
        # produce an empty index set and skip pose detection on every frame,
        # even though cap.read() could step through the file frame-by-frame
        # just fine. Sampling by index-modulo-step as frames are actually
        # read has no such dependency and needs its own explicit frame cap
        # instead (previously implicit in the precomputed list's length).
        step = _sample_step(source_fps)

        with vision.PoseLandmarker.create_from_options(options) as landmarker:
            index = 0
            while True:
                ok, frame_bgr = cap.read()
                if not ok:
                    break
                if index % step == 0:
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
                    # Part 3 (confidence gating, 2026-09-06): if pose has
                    # never been detected at all after a reasonable number
                    # of attempts, neither marker is going to work from
                    # this video -- stop rather than running the full
                    # ~90-frame pass for a doomed result. Does NOT try to
                    # bail early for "weight_transfer only" cases (hips
                    # fine, ankles/geometry bad) -- head_stability still
                    # needs every remaining frame from this same pass, so
                    # that case can't be cheaply abandoned early.
                    if frame_count >= EARLY_BAILOUT_CHECKPOINT and len(samples) == 0:
                        break
                    if frame_count >= MAX_SAMPLED_FRAMES:
                        break
                index += 1
    finally:
        cap.release()

    return samples, frame_count


def _compute_head_stability_from_samples(
    samples: list[FrameSample], frame_count: int, batting_hand: str | None = None
) -> HeadStabilityResult:
    valid = [s for s in samples if s.nose_visibility > LANDMARK_MIN_SCORE and s.hips_ok]

    if len(valid) < MIN_VALID_FRAMES:
        raise InsufficientDetectionError(len(valid), frame_count)

    baseline_count = max(1, round(len(valid) * BASELINE_FRACTION))
    baseline_hip_width = (
        sum(abs(s.left_hip_x - s.right_hip_x) for s in valid[:baseline_count]) / baseline_count
    )

    combined: list[FrameSample] = []
    if batting_hand is not None:
        front, back = _front_back_attrs(batting_hand)

        def ankle_visibility(s: FrameSample, side: str) -> float:
            return s.left_ankle_visibility if side == "left" else s.right_ankle_visibility

        combined = [
            s
            for s in valid
            if ankle_visibility(s, front) > LANDMARK_MIN_SCORE
            and ankle_visibility(s, back) > LANDMARK_MIN_SCORE
        ]

    isolated_from_weight_transfer = len(combined) >= MIN_VALID_FRAMES
    scoring_frames = valid

    if isolated_from_weight_transfer:
        # Isolate the part of head movement NOT explained by the same
        # forward weight shift that drives a correct front-foot shot (see
        # HeadStabilityResult.isolated_from_weight_transfer). Regressing
        # head-relative-to-hip position against weight-transfer progress
        # and taking the residual keeps a controlled lean into the ball
        # from registering as "drift", while a head that moves
        # independently of the weight shift -- wobbling, or genuinely
        # falling away -- still shows up as a large residual.
        def ankle_x(s: FrameSample, side: str) -> float:
            return s.left_ankle_x if side == "left" else s.right_ankle_x

        combined_baseline_count = max(1, round(len(combined) * BASELINE_FRACTION))
        baseline_front_x = (
            sum(ankle_x(s, front) for s in combined[:combined_baseline_count]) / combined_baseline_count
        )
        baseline_back_x = (
            sum(ankle_x(s, back) for s in combined[:combined_baseline_count]) / combined_baseline_count
        )
        base_width = baseline_front_x - baseline_back_x

        def weight_ratio(s: FrameSample) -> float:
            return (s.hip_mid_x - baseline_back_x) / base_width if base_width else 0.0

        head_relative = [s.nose_x - s.hip_mid_x for s in combined]
        ratios = [weight_ratio(s) for s in combined]
        residuals = _linear_residuals(ratios, head_relative)
        peak_drift_m = max(abs(r) for r in residuals)
        scoring_frames = combined
    else:
        # Not enough frames with reliable ankle detection (or no
        # batting_hand at all) to isolate the weight-transfer-driven
        # component -- fall back to the older raw-drift-from-baseline
        # measure. Known to conflate forward press with real instability;
        # reported anyway with reduced confidence rather than failing the
        # whole marker, since some signal beats none when ankles
        # specifically are the weak link.
        baseline = sum(s.nose_x - s.hip_mid_x for s in valid[:baseline_count]) / baseline_count
        peak_drift_m = max(abs((s.nose_x - s.hip_mid_x) - baseline) for s in valid)

    visibility_score = sum(
        (s.nose_visibility + s.left_hip_visibility + s.right_hip_visibility) / 3 for s in scoring_frames
    ) / len(scoring_frames)
    consistency_score = len(valid) / frame_count if frame_count else 0.0
    geometry_score = _head_stability_geometry_score(peak_drift_m, baseline_hip_width)
    # A fallback result can't rule out that some of its "drift" is really
    # just correct forward press -- capped below HIGH so it always reads
    # as at most a caveated result, never a confident diagnosis.
    if not isolated_from_weight_transfer:
        geometry_score = min(geometry_score, CONFIDENCE_MEDIUM_THRESHOLD)
    overall_score = min(visibility_score, consistency_score, geometry_score)

    return HeadStabilityResult(
        value_cm=round(peak_drift_m * 100, 2),
        confidence=round(overall_score, 3),
        confidence_breakdown=ConfidenceBreakdown(
            visibility_score=round(visibility_score, 3),
            consistency_score=round(consistency_score, 3),
            geometry_score=round(geometry_score, 3),
            overall_score=round(overall_score, 3),
        ),
        frame_count=frame_count,
        frames_with_detection=len(valid),
        isolated_from_weight_transfer=isolated_from_weight_transfer,
    )


def compute_head_stability(video_path: str, batting_hand: str | None = None) -> HeadStabilityResult:
    """Runs pose estimation on `video_path` and returns the peak
    head-instability measurement, in centimeters. Thin wrapper around the
    shared extraction pass, kept for direct testability and backward
    compatibility with existing callers/tests."""
    samples, frame_count = _run_pose_detection(video_path)
    return _compute_head_stability_from_samples(samples, frame_count, batting_hand)


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
    samples: list[FrameSample], batting_hand: str, frame_count: int | None = None
) -> tuple[WeightTransferResult | None, WeightTransferDiagnostics]:
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

    Returns (None, diagnostics) if too few frames have both hips and the
    relevant ankle pair visible — a valid "not enough evidence for this
    marker" outcome, not an error, since head_stability may still have
    succeeded from the same video. diagnostics is always populated (even
    on success) so a null result can be debugged without re-running
    anything — e.g. distinguishing "ankles almost never detected" from
    "detected, but just below the confidence bar."
    """
    front, back = _front_back_attrs(batting_hand)

    def ankle_x(s: FrameSample, side: str) -> float:
        return s.left_ankle_x if side == "left" else s.right_ankle_x

    def ankle_visibility(s: FrameSample, side: str) -> float:
        return s.left_ankle_visibility if side == "left" else s.right_ankle_visibility

    frames_with_hips_ok = sum(1 for s in samples if s.hips_ok)
    frames_with_front_ankle_ok = sum(1 for s in samples if ankle_visibility(s, front) > LANDMARK_MIN_SCORE)
    frames_with_back_ankle_ok = sum(1 for s in samples if ankle_visibility(s, back) > LANDMARK_MIN_SCORE)
    mean_front_ankle_visibility = (
        sum(ankle_visibility(s, front) for s in samples) / len(samples) if samples else 0.0
    )
    mean_back_ankle_visibility = (
        sum(ankle_visibility(s, back) for s in samples) / len(samples) if samples else 0.0
    )

    valid = [
        s
        for s in samples
        if s.hips_ok
        and ankle_visibility(s, front) > LANDMARK_MIN_SCORE
        and ankle_visibility(s, back) > LANDMARK_MIN_SCORE
    ]

    if len(valid) < MIN_VALID_FRAMES:
        return None, WeightTransferDiagnostics(
            total_sampled_frames=len(samples),
            frames_with_hips_ok=frames_with_hips_ok,
            frames_with_front_ankle_ok=frames_with_front_ankle_ok,
            frames_with_back_ankle_ok=frames_with_back_ankle_ok,
            frames_with_both_ankles_ok=len(valid),
            mean_front_ankle_visibility=round(mean_front_ankle_visibility, 3),
            mean_back_ankle_visibility=round(mean_back_ankle_visibility, 3),
            baseline_base_width_m=None,
        )

    # The base of support is established once, in stance, and held fixed —
    # NOT recomputed per frame. Using each frame's own live ankle positions
    # as the denominator (the first version of this function did) is
    # unstable: real per-frame landmark noise can put the front/back ankle
    # only millimeters apart in a single frame, and dividing by that
    # near-zero denominator produces wildly inflated percentages (this was
    # caught by a real live run returning 12836% — physically impossible —
    # before this fix).
    baseline_count = max(1, round(len(valid) * BASELINE_FRACTION))
    baseline_front_x = sum(ankle_x(s, front) for s in valid[:baseline_count]) / baseline_count
    baseline_back_x = sum(ankle_x(s, back) for s in valid[:baseline_count]) / baseline_count
    baseline_base_width = abs(baseline_front_x - baseline_back_x)

    diagnostics = WeightTransferDiagnostics(
        total_sampled_frames=len(samples),
        frames_with_hips_ok=frames_with_hips_ok,
        frames_with_front_ankle_ok=frames_with_front_ankle_ok,
        frames_with_back_ankle_ok=frames_with_back_ankle_ok,
        frames_with_both_ankles_ok=len(valid),
        mean_front_ankle_visibility=round(mean_front_ankle_visibility, 3),
        mean_back_ankle_visibility=round(mean_back_ankle_visibility, 3),
        baseline_base_width_m=round(baseline_base_width, 4),
    )

    # A real cricket stance is normally tens of centimeters wide at the
    # ankles; anything under 5cm indicates an unreliable stance detection
    # (motion blur, occlusion, or a camera angle too close to face-on for
    # this measurement), not a real narrow stance.
    MIN_RELIABLE_BASE_WIDTH_M = 0.05
    if baseline_base_width < MIN_RELIABLE_BASE_WIDTH_M:
        return None, diagnostics

    def percent_of_base(s: FrameSample) -> float:
        return (s.hip_mid_x - baseline_back_x) / (baseline_front_x - baseline_back_x) * 100

    peak_percent = max(percent_of_base(s) for s in valid)
    visibility_score = sum(
        (
            s.left_hip_visibility
            + s.right_hip_visibility
            + ankle_visibility(s, front)
            + ankle_visibility(s, back)
        )
        / 4
        for s in valid
    ) / len(valid)
    effective_frame_count = frame_count if frame_count is not None else len(samples)
    consistency_score = len(valid) / effective_frame_count if effective_frame_count else 0.0
    geometry_score = _weight_transfer_geometry_score(baseline_base_width)
    overall_score = min(visibility_score, consistency_score, geometry_score)

    return (
        WeightTransferResult(
            value_percent=round(peak_percent, 2),
            confidence=round(overall_score, 3),
            confidence_breakdown=ConfidenceBreakdown(
                visibility_score=round(visibility_score, 3),
                consistency_score=round(consistency_score, 3),
                geometry_score=round(geometry_score, 3),
                overall_score=round(overall_score, 3),
            ),
            frame_count=effective_frame_count,
            frames_with_detection=len(valid),
        ),
        diagnostics,
    )


def compute_weight_transfer(
    video_path: str, batting_hand: str
) -> tuple[WeightTransferResult | None, WeightTransferDiagnostics]:
    """Video-driving wrapper mirroring compute_head_stability's shape."""
    samples, frame_count = _run_pose_detection(video_path)
    return compute_weight_transfer_from_samples(samples, batting_hand, frame_count)


def analyze_batting_video(
    video_path: str, batting_hand: str | None
) -> BattingAnalysisResult:
    """The real entry point the API route calls: runs pose detection once,
    computes head_stability (always — failure here raises, same as before),
    and weight_transfer (only if batting_hand is known and ankles were
    detected confidently enough — absence is a valid outcome, not a raised
    error, so one marker's limitation never blocks the other)."""
    samples, frame_count = _run_pose_detection(video_path)

    head_stability = _compute_head_stability_from_samples(samples, frame_count, batting_hand)

    if batting_hand is None:
        return BattingAnalysisResult(
            head_stability=head_stability,
            weight_transfer=None,
            weight_transfer_skip_reason="batting_hand not provided",
            weight_transfer_diagnostics=None,
        )

    weight_transfer, diagnostics = compute_weight_transfer_from_samples(
        samples, batting_hand, frame_count
    )
    return BattingAnalysisResult(
        head_stability=head_stability,
        weight_transfer=weight_transfer,
        weight_transfer_diagnostics=diagnostics,
        weight_transfer_skip_reason=(
            None if weight_transfer is not None else "insufficient ankle detection"
        ),
    )
