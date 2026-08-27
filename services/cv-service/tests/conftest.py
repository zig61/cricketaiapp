import numpy as np
import pytest


@pytest.fixture
def synthetic_video_path(tmp_path):
    """A short random-noise video — proves the decode/detect mechanical path
    works, but (correctly) never produces a real pose detection, since there's
    no actual person in it. Real accuracy needs a real sample video."""
    import cv2

    path = str(tmp_path / "synthetic.mp4")
    width, height, fps, num_frames = 320, 240, 15, 30
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(path, fourcc, fps, (width, height))
    rng = np.random.default_rng(seed=42)
    for _ in range(num_frames):
        frame = (rng.random((height, width, 3)) * 255).astype(np.uint8)
        writer.write(frame)
    writer.release()
    return path
