import pytest

from app.services.pose import (
    CONFIDENCE_HIGH_THRESHOLD,
    FrameSample,
    InsufficientDetectionError,
    classify_confidence,
    compute_head_stability,
    compute_weight_transfer_from_samples,
)
from app.services.pose import (
    _compute_head_stability_from_samples,
    _head_stability_geometry_score,
    _linear_residuals,
    _weight_transfer_geometry_score,
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


def _head_frame(
    hip_x: float,
    nose_x: float,
    front_ankle_x: float = 0.3,
    back_ankle_x: float = 0.0,
) -> FrameSample:
    """A FrameSample for the head_stability/weight-transfer-correlation
    tests below: hips centered on hip_x with a plausible ~10cm hip width
    (the geometry score treats zero hip width as unmeasurable, so hips
    can't be fully symmetric the way _sample's weight-transfer-only frames
    are), nose at nose_x, and fixed front/back ankles -- feet planted,
    matching a real stance where hip position (not foot position) is what
    moves as weight transfers. Assumes batting_hand="right" (front=left
    ankle, back=right ankle, per _front_back_attrs)."""
    return FrameSample(
        nose_x=nose_x,
        nose_visibility=0.9,
        left_hip_x=hip_x + 0.05,
        left_hip_visibility=0.9,
        right_hip_x=hip_x - 0.05,
        right_hip_visibility=0.9,
        left_ankle_x=front_ankle_x,
        left_ankle_visibility=0.9,
        right_ankle_x=back_ankle_x,
        right_ankle_visibility=0.9,
    )


# --- _linear_residuals: the pure regression math the redesign depends on ---


def test_linear_residuals_are_near_zero_for_an_exact_line():
    x = [i / 9 for i in range(10)]
    y = [0.02 + 0.05 * xi for xi in x]  # exact line -- no noise
    residuals = _linear_residuals(x, y)
    assert all(abs(r) < 1e-9 for r in residuals)


def test_linear_residuals_surface_a_single_outlier():
    x = [i / 9 for i in range(10)]
    y = [0.02 + 0.05 * xi for xi in x]
    y[5] += 0.08  # one frame perturbed independently of x
    residuals = _linear_residuals(x, y)
    assert abs(residuals[5]) > 0.06  # the outlier dominates its own residual
    assert all(abs(r) < 0.02 for i, r in enumerate(residuals) if i != 5)


def test_linear_residuals_falls_back_to_deviation_from_mean_when_x_has_no_spread():
    x = [0.5, 0.5, 0.5]
    y = [1.0, 2.0, 3.0]
    residuals = _linear_residuals(x, y)
    assert residuals == pytest.approx([-1.0, 0.0, 1.0])


# --- head_stability vs. weight_transfer: the real bug found live 2026-09-06 ---
#
# head_stability and weight_transfer both read the same world-space x axis.
# In a correctly side-on video that axis is the front-foot/back-foot line,
# so a batter driving through the ball moves their head forward along the
# *same* axis weight_transfer measures as (correct) forward press. The old
# formula -- raw drift from a pre-shot baseline -- couldn't tell that apart
# from the head genuinely falling away independent of the shot.


def test_head_stability_does_not_flag_a_correct_forward_lean_as_drift():
    # Head position relative to the hips moves in exact linear proportion
    # to weight-transfer progress -- a pure, correlated forward lean, no
    # independent wobble. The redesigned formula should score this as
    # near-zero drift and high confidence.
    n = 20
    samples = [
        _head_frame(hip_x=(i / (n - 1)) * 0.3, nose_x=(i / (n - 1)) * 0.3 + 0.02 + 0.05 * (i / (n - 1)))
        for i in range(n)
    ]

    result = _compute_head_stability_from_samples(samples, frame_count=n, batting_hand="right")

    assert result.isolated_from_weight_transfer is True
    assert result.value_cm < 0.5
    assert result.confidence >= CONFIDENCE_HIGH_THRESHOLD


def test_head_stability_still_catches_movement_independent_of_weight_transfer():
    # Same correlated-lean setup as above, but one frame's head position is
    # additionally perturbed by 8cm independent of weight-transfer progress
    # -- a real wobble/falling-away. The redesigned formula should surface
    # roughly that 8cm, not the larger total raw range (lean + spike) the
    # old baseline-drift formula would have reported.
    n = 20
    samples = []
    for i in range(n):
        ratio = i / (n - 1)
        hip_x = ratio * 0.3
        nose_x = hip_x + 0.02 + 0.05 * ratio
        if i == 10:
            nose_x += 0.08
        samples.append(_head_frame(hip_x, nose_x))

    result = _compute_head_stability_from_samples(samples, frame_count=n, batting_hand="right")

    assert result.isolated_from_weight_transfer is True
    assert 6.0 <= result.value_cm <= 9.0


def test_head_stability_falls_back_to_raw_drift_without_a_batting_hand():
    # No batting_hand -> can't isolate the weight-transfer-driven component
    # -- falls back to the old raw-drift formula rather than failing the
    # marker outright, and confidence is capped below HIGH since a fallback
    # result can't rule out conflating a correct lean with real drift.
    n = 20
    samples = [
        _head_frame(hip_x=(i / (n - 1)) * 0.3, nose_x=(i / (n - 1)) * 0.3 + 0.02 + 0.05 * (i / (n - 1)))
        for i in range(n)
    ]

    result = _compute_head_stability_from_samples(samples, frame_count=n, batting_hand=None)

    assert result.isolated_from_weight_transfer is False
    assert result.confidence < CONFIDENCE_HIGH_THRESHOLD


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

    result, diagnostics = compute_weight_transfer_from_samples(samples, "right")

    assert result is not None
    assert result.value_percent == pytest.approx(75.0, abs=0.1)
    assert result.frames_with_detection == len(samples)
    assert diagnostics.frames_with_both_ankles_ok == len(samples)
    assert diagnostics.baseline_base_width_m == pytest.approx(0.3, abs=0.001)


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

    result, _diagnostics = compute_weight_transfer_from_samples(samples, "right")

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

    result, _diagnostics = compute_weight_transfer_from_samples(samples, "right")

    assert result is not None
    assert result.value_percent == pytest.approx(120.0, abs=0.1)
    assert result.value_percent > 100  # the "overbalanced" condition — not a stored flag


def test_left_hand_batter_swaps_front_and_back_ankle():
    # Same physical hip movement toward x=0.0 as the balanced right-hand
    # case, but for a left-hander front foot is the RIGHT ankle (x=0.3) and
    # back is the LEFT ankle (x=0.0) — so moving toward x=0.0 is now moving
    # toward the BACK foot, i.e. away from a good transfer, not toward one.
    samples = [_sample(0.28), _sample(0.20), _sample(0.075), _sample(0.10), _sample(0.15)]

    result, _diagnostics = compute_weight_transfer_from_samples(samples, "left")

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

    result, diagnostics = compute_weight_transfer_from_samples(low_vis_samples, "right")

    assert result is None
    # This is exactly the distinction the diagnostics exist to make visible:
    # ankles were never confidently detected at all (0/10), not "detected
    # but just below the bar" — and no baseline could be computed as a result.
    assert diagnostics.total_sampled_frames == 10
    assert diagnostics.frames_with_front_ankle_ok == 0
    assert diagnostics.frames_with_back_ankle_ok == 0
    assert diagnostics.frames_with_both_ankles_ok == 0
    assert diagnostics.mean_front_ankle_visibility == pytest.approx(0.1, abs=0.001)
    assert diagnostics.baseline_base_width_m is None


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

    result, _diagnostics = compute_weight_transfer_from_samples(samples, "right")

    assert result is not None
    assert result.value_percent == pytest.approx(75.0, abs=0.5)
    assert result.value_percent < 200  # sanity ceiling — nowhere near the old 12836% bug


def test_returns_none_when_the_stance_base_width_is_implausibly_narrow():
    # Ankles only 2cm apart at baseline — below the real-world floor, so
    # this is treated as an unreliable detection, not a real narrow stance.
    samples = [_sample(0.01, left_ankle_x=0.0, right_ankle_x=0.02) for _ in range(6)]

    result, diagnostics = compute_weight_transfer_from_samples(samples, "right")

    assert result is None
    # Diagnostics still show ankles WERE detected (visibility is fine) —
    # this is what distinguishes "narrow base width" from "no detection at
    # all" (the previous test), which look identical from skip reason alone.
    assert diagnostics.frames_with_both_ankles_ok == 6
    assert diagnostics.baseline_base_width_m == pytest.approx(0.02, abs=0.001)


def test_early_bailout_stops_well_short_of_the_full_frame_budget(synthetic_video_path):
    # Regression/behavior test for Part 3 of the confidence-gating plan
    # (2026-09-06): a video where nothing is ever detected should stop
    # around EARLY_BAILOUT_CHECKPOINT frames, not run the full ~90-frame
    # budget for a doomed result.
    with pytest.raises(InsufficientDetectionError) as exc_info:
        compute_head_stability(synthetic_video_path)

    assert exc_info.value.frame_count <= 20


def test_sampling_does_not_depend_on_the_containers_frame_count(synthetic_video_path, monkeypatch):
    # Real bug found live (2026-09-06): browser-recorded webm blobs from the
    # in-app "Record in-app" feature's MediaRecorder routinely report
    # CAP_PROP_FRAME_COUNT as 0 -- the container has no finalized index --
    # which made the old range(0, total_frames, step) sampling silently
    # compute an *empty* set of frames to sample, so pose detection never
    # even attempted a single frame despite cap.read() working fine
    # frame-by-frame. Simulate that exact metadata gap here.
    import cv2

    real_get = cv2.VideoCapture.get

    def fake_get(self, prop_id):
        if prop_id == cv2.CAP_PROP_FRAME_COUNT:
            return 0
        return real_get(self, prop_id)

    monkeypatch.setattr(cv2.VideoCapture, "get", fake_get)

    with pytest.raises(InsufficientDetectionError) as exc_info:
        compute_head_stability(synthetic_video_path)

    # frame_count > 0 proves frames were actually sampled and attempted --
    # with the bug, this was exactly 0 regardless of the video's real content.
    assert exc_info.value.frame_count > 0


# --- classify_confidence: thresholds are a first estimate, see pose.py's comment ---


@pytest.mark.parametrize(
    "score,expected",
    [
        (1.0, "high"),
        (0.75, "high"),
        (0.749, "medium"),
        (0.4, "medium"),
        (0.399, "low"),
        (0.0, "low"),
    ],
)
def test_classify_confidence_thresholds(score, expected):
    assert classify_confidence(score) == expected


# --- geometry scores: pure functions, the actual new signal in this pass ---


@pytest.mark.parametrize(
    "base_width_m,expected",
    [
        (0.05, 0.0),  # bottom of the borderline ramp (never actually reached in practice --
        # anything below this hits the separate hard floor and returns None instead)
        (0.10, pytest.approx(1 / 3, abs=0.01)),  # the real borderline case this pass targets
        (0.15, pytest.approx(2 / 3, abs=0.01)),
        (0.20, 1.0),
        (0.30, 1.0),  # plausible human stance width, middle of the plateau
        (0.45, 1.0),
        (0.575, pytest.approx(0.5, abs=0.01)),  # midpoint of the upper ramp-down
        (0.70, 0.0),
        (1.0, 0.0),  # implausibly wide -- as suspect as implausibly narrow
    ],
)
def test_weight_transfer_geometry_score_bands(base_width_m, expected):
    assert _weight_transfer_geometry_score(base_width_m) == expected


@pytest.mark.parametrize(
    "peak_drift_m,hip_width_m,expected",
    [
        (0.10, 0.15, 1.0),  # drift well under hip width -- plausible
        (0.15, 0.15, 1.0),  # exactly at the ratio-1.0 boundary
        (0.2625, 0.15, pytest.approx(0.5, abs=0.01)),  # ratio 1.75, midpoint of the ramp
        (0.375, 0.15, 0.0),  # ratio 2.5 -- implausible, a head can't realistically move
        # more than 2.5x the player's own hip width
        (0.10, 0.0, 0.0),  # degenerate hip width -- guarded, not a division error
    ],
)
def test_head_stability_geometry_score_bands(peak_drift_m, hip_width_m, expected):
    assert _head_stability_geometry_score(peak_drift_m, hip_width_m) == expected


# --- the three requested end-to-end scenarios, through the real composite formula ---


def test_high_confidence_weight_transfer_case():
    # Plausible stance width (0.30m, middle of the plausible band), good
    # visibility, full frame consistency -- the "clean video" case.
    samples = [_sample(x) for x in (0.28, 0.22, 0.15, 0.10, 0.075, 0.09, 0.10, 0.12, 0.15, 0.18)]

    result, _diagnostics = compute_weight_transfer_from_samples(samples, "right", frame_count=10)

    assert result is not None
    assert result.confidence_breakdown.geometry_score == 1.0
    assert classify_confidence(result.confidence) == "high"


def test_medium_confidence_weight_transfer_case_from_a_moderately_bad_angle():
    # 15cm base width -- clearly narrower than a real stance, but not the
    # extreme 0.27cm case. Good visibility/consistency, so the WEAK LINK
    # is specifically geometry -- exactly the case min() is designed to
    # catch rather than let visibility paper over.
    samples = [
        _sample(x, left_ankle_x=0.0, right_ankle_x=0.15)
        for x in (0.14, 0.11, 0.08, 0.05, 0.04, 0.05, 0.06, 0.08, 0.10, 0.12)
    ]

    result, _diagnostics = compute_weight_transfer_from_samples(samples, "right", frame_count=10)

    assert result is not None
    assert classify_confidence(result.confidence) == "medium"
    assert result.confidence_breakdown.geometry_score < result.confidence_breakdown.visibility_score


def test_low_confidence_weight_transfer_case_the_exact_borderline_gap_this_pass_closes():
    # 10cm base width -- the real gap named in this task: bad enough to be
    # untrustworthy, but not bad enough to hit the pre-existing 5cm hard
    # floor. Visibility stays high throughout (mirrors the real 0.27cm
    # case, where MediaPipe was extremely confident about *where* the
    # ankles were while the geometry itself was meaningless) -- this is
    # exactly what min() closes: high visibility no longer masks it.
    samples = [
        _sample(x, left_ankle_x=0.0, right_ankle_x=0.10)
        for x in (0.09, 0.07, 0.05, 0.03, 0.025, 0.03, 0.04, 0.05, 0.07, 0.08)
    ]

    result, _diagnostics = compute_weight_transfer_from_samples(samples, "right", frame_count=10)

    assert result is not None  # clears the hard floor -- still reported, just distrusted
    assert result.confidence_breakdown.visibility_score > 0.8  # visibility alone looks fine
    assert classify_confidence(result.confidence) == "low"  # but geometry drags it down


def test_the_extreme_bad_angle_case_still_hits_the_pre_existing_hard_floor_unchanged():
    # The actual 0.27cm real-world case this whole pass was prompted by --
    # confirms the new scoring doesn't regress the existing hard rejection
    # into "just a LOW-confidence result" -- it's still None entirely.
    samples = [
        _sample(x, left_ankle_x=0.150, right_ankle_x=0.1527)  # ~2.7mm apart
        for x in (0.14, 0.145, 0.15, 0.151, 0.148, 0.149, 0.15, 0.151, 0.149, 0.15)
    ]

    result, diagnostics = compute_weight_transfer_from_samples(samples, "right", frame_count=10)

    assert result is None
    assert diagnostics.baseline_base_width_m < 0.05
