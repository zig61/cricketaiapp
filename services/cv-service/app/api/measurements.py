from __future__ import annotations

import os
import tempfile

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.pose import InsufficientDetectionError, compute_head_stability

router = APIRouter()

DOWNLOAD_TIMEOUT_SECONDS = 30.0


class HeadStabilityRequest(BaseModel):
    video_url: str


def error_envelope(code: str, message: str, details: dict | None = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def _download_video(video_url: str) -> str:
    fd, path = tempfile.mkstemp(suffix=".mp4")
    try:
        with httpx.stream(
            "GET", video_url, timeout=DOWNLOAD_TIMEOUT_SECONDS, follow_redirects=True
        ) as response:
            if response.status_code != 200:
                raise HTTPException(
                    status_code=422,
                    detail=error_envelope(
                        "VIDEO_DOWNLOAD_FAILED",
                        f"Could not download video (status {response.status_code}).",
                    ),
                )
            with os.fdopen(fd, "wb") as f:
                for chunk in response.iter_bytes():
                    f.write(chunk)
    except httpx.HTTPError as exc:
        os.remove(path)
        raise HTTPException(
            status_code=422,
            detail=error_envelope("VIDEO_DOWNLOAD_FAILED", f"Could not download video: {exc}"),
        ) from exc
    return path


@router.post("/measurements/head-stability")
def head_stability(body: HeadStabilityRequest) -> dict:
    video_path = _download_video(body.video_url)
    try:
        result = compute_head_stability(video_path)
    except InsufficientDetectionError as exc:
        raise HTTPException(
            status_code=422,
            detail=error_envelope(
                "INSUFFICIENT_DETECTION",
                str(exc),
                {
                    "frameCount": exc.frame_count,
                    "framesWithDetection": exc.frames_with_detection,
                },
            ),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=error_envelope("INVALID_VIDEO", str(exc)),
        ) from exc
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=500,
            detail=error_envelope("MODEL_NOT_FOUND", str(exc)),
        ) from exc
    finally:
        os.remove(video_path)

    return {
        "value": result.value_cm,
        "unit": "cm",
        "confidence": result.confidence,
        "frameCount": result.frame_count,
        "framesWithDetection": result.frames_with_detection,
    }
