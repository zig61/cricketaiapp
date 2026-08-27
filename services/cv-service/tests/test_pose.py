import pytest

from app.services.pose import (
    InsufficientDetectionError,
    compute_head_stability,
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
