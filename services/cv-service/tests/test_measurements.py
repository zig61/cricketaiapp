from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_head_stability_returns_422_when_no_pose_is_detected(synthetic_video_path, monkeypatch):
    import app.api.measurements as measurements_module

    monkeypatch.setattr(measurements_module, "_download_video", lambda url: synthetic_video_path)

    response = client.post("/measurements/head-stability", json={"video_url": "https://example.com/video.mp4"})

    assert response.status_code == 422
    body = response.json()
    assert body["detail"]["error"]["code"] == "INSUFFICIENT_DETECTION"


def test_head_stability_returns_422_when_the_video_cannot_be_downloaded():
    # A real (not mocked) connection attempt to an address nothing listens on —
    # proves the actual download-failure path, not just a simulated one.
    response = client.post(
        "/measurements/head-stability",
        json={"video_url": "http://127.0.0.1:1/video.mp4"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["detail"]["error"]["code"] == "VIDEO_DOWNLOAD_FAILED"


def test_head_stability_rejects_a_missing_video_url_field():
    response = client.post("/measurements/head-stability", json={})
    assert response.status_code == 422
