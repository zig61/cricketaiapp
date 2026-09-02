import pytest

from app.services.pose import (
    FrameSample,
    InsufficientDetectionError,
    compute_head_stability,
    compute_weight_transfer_from_samples,
)


def _sample(hip_x: float, left_ankle_x: float = 0.0, right_ankle_x: float = 0.3) -> FrameSample:
    """A FrameSample with symmetric hips (hip_mid_x == hip_x exactly) and
    fixed, fully-visible ankle positions — the minimum needed to exercise
    compute_weight_transfer_from_samples without any video/MediaPipe
    involved. nose fields are unused by weight-transfer and set to dummy
    but visible values so hips_ok-style checks elsewhere don't accidentally
    filter these out."""
    return FrameSample(
        nose_x=0.0,
        nose_visibility=0.9,
        left_hip_x=hip_x,
        left_hip_visibility=0.9,
        right_hip_x=hip_x,
        right_hip_visibility=0.9,
        left_ankle_x=left_ankle_x,
        left_ankle_visibility=0.9,
        right_ankle_x=right_ankle_x,
        right_ankle_visibility=0.9,
    )


def test_raises_insufficient_detection_on_a_video_with_no_person(synthetic_video_path):
    # Random noise frames — no person, so no landmarks should ever pass the
    # visibility/presence thresholds. This proves the full decode -> detect
    # -> threshold -> error path runs correctly; it can't prove real-world
    # accuracy, which needs an actual batting clip.
    with pytest.raises(InsufficientDetectionError) as exc_info:
        compute_head_stability(synthetic_video_path)

    assert exc_info.value.frames_with_detection == 0
    assert exc_info.value.frame_count > 0


def test_raises_value_error_on_an_unreadable_video(tmp_path):
    bogus_path = str(tmp_path / "not-a-video.mp4")
    with open(bogus_path, "wb") as f:
        f.write(b"not actually a video file")

    with pytest.raises(ValueError):
        compute_head_stability(bogus_path)


def test_raises_file_not_found_when_model_is_missing(synthetic_video_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "pose_model_path", "models/does-not-exist.task")

    with pytest.raises(FileNotFoundError):
        compute_head_stability(synthetic_video_path)


# --- weight_transfer: pure landmark-sequence tests, no video/MediaPipe involved ---
#
# Right-hand batter -> front foot = left ankle (x=0.0), back foot = right
# ankle (x=0.3), so base_width = 0.3m. percent_of_base = 0% at the back
# ankle's line, 100% at the front ankle's line, by construction — see
# compute_weight_transfer_from_samples's docstring for why this is
# camera-orientation-agnostic.


def test_balanced_controlled_shot_peaks_around_75_percent():
    samples = [
        _sample(0.28),
        _sample(0.25),
        _sample(0.20),
        _sample(0.15),
        _sample(0.10),
        _sample(0.075),  # peak: (0.075-0.3)/(0.0-0.3)*100 = 75%
        _sample(0.09),
        _sample(0.10),
    ]

    result = compute_weight_transfer_from_samples(samples, "right")

    assert result is not None
    assert result.value_percent == pytest.approx(75.0, abs=0.1)
    assert result.frames_with_detection == len(samples)


def test_insufficient_transfer_stuck_on_back_foot_peaks_around_30_percent():
    samples = [
        _sample(0.29),
        _sample(0.27),
        _sample(0.25),
        _sample(0.23),
        _sample(0.21),  # peak: (0.21-0.3)/(0.0-0.3)*100 = 30%
        _sample(0.22),
        _sample(0.23),
    ]

    result = compute_weight_transfer_from_samples(samples, "right")

    assert result is not None
    assert result.value_percent == pytest.approx(30.0, abs=0.1)


def test_overbalanced_shot_peaks_above_100_percent():
    samples = [
        _sample(0.28),
        _sample(0.20),
        _sample(0.10),
        _sample(0.00),
        _sample(-0.06),  # peak: (-0.06-0.3)/(0.0-0.3)*100 = 120%
        _sample(-0.03),
        _sample(0.02),
    ]

    result = compute_weight_transfer_from_samples(samples, "right")

    assert result is not None
    assert result.value_percent == pytest.approx(120.0, abs=0.1)
    assert result.value_percent > 100  # the "overbalanced" condition — not a stored flag


def test_left_hand_batter_swaps_front_and_back_ankle():
    # Same physical hip movement toward x=0.0 as the balanced right-hand
    # case, but for a left-hander front foot is the RIGHT ankle (x=0.3) and
    # back is the LEFT ankle (x=0.0) — so moving toward x=0.0 is now moving
    # toward the BACK foot, i.e. away from a good transfer, not toward one.
    samples = [_sample(0.28), _sample(0.20), _sample(0.075), _sample(0.10), _sample(0.15)]

    result = compute_weight_transfer_from_samples(samples, "left")

    assert result is not None
    # percent_of_base = (hip_mid_x - back_ankle_x) / (front_ankle_x - back_ankle_x) * 100
    #                 = (hip_mid_x - 0.0) / (0.3 - 0.0) * 100
    # peak hip_mid_x here is 0.28 -> (0.28-0.0)/(0.3-0.0)*100 = 93.3%
    assert result.value_percent == pytest.approx(93.3, abs=0.1)


def test_returns_none_when_ankles_are_not_visibly_detected():
    low_vis_samples = [
        FrameSample(
            nose_x=0.0,
            nose_visibility=0.9,
            left_hip_x=0.2,
            left_hip_visibility=0.9,
            right_hip_x=0.2,
            right_hip_visibility=0.9,
            left_ankle_x=0.0,
            left_ankle_visibility=0.1,  # below LANDMARK_MIN_SCORE
            right_ankle_x=0.3,
            right_ankle_visibility=0.1,
        )
        for _ in range(10)
    ]

    result = compute_weight_transfer_from_samples(low_vis_samples, "right")

    assert result is None


def test_raises_on_an_invalid_batting_hand():
    with pytest.raises(ValueError):
        compute_weight_transfer_from_samples([_sample(0.2)], "sideways")


def test_a_single_noisy_frame_does_not_blow_up_the_result():
    # Regression test for a real bug found via live verification (2026-09-02):
    # the base-width denominator was originally recomputed from each frame's
    # own (noisy) ankle positions rather than the fixed stance baseline. A
    # single frame where the ankles briefly appear only 2mm apart (motion
    # blur / detection noise, not a real stance change) divided by a
    # near-zero denominator and produced a peak of 12836% on real footage.
    # With a fixed baseline denominator, one noisy frame's ankle jitter
    # can't distort the result this way.
    samples = [
        _sample(0.28),
        _sample(0.20),
        _sample(0.15),
        _sample(0.075),  # genuine peak: 75%
        # ankles nearly coincide in this one frame only — should not affect
        # the result at all, since the baseline was already fixed above.
        FrameSample(
            nose_x=0.0,
            nose_visibility=0.9,
            left_hip_x=0.10,
            left_hip_visibility=0.9,
            right_hip_x=0.10,
            right_hip_visibility=0.9,
            left_ankle_x=0.001,
            left_ankle_visibility=0.9,
            right_ankle_x=0.302,
            right_ankle_visibility=0.9,
        ),
        _sample(0.10),
    ]

    result = compute_weight_transfer_from_samples(samples, "right")

    assert result is not None
    assert result.value_percent == pytest.approx(75.0, abs=0.5)
    assert result.value_percent < 200  # sanity ceiling — nowhere near the old 12836% bug


def test_returns_none_when_the_stance_base_width_is_implausibly_narrow():
    # Ankles only 2cm apart at baseline — below the real-world floor, so
    # this is treated as an unreliable detection, not a real narrow stance.
    samples = [_sample(0.01, left_ankle_x=0.0, right_ankle_x=0.02) for _ in range(6)]

    result = compute_weight_transfer_from_samples(samples, "right")

    assert result is None
