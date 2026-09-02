from __future__ import annotations

import os
import tempfile
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.pose import InsufficientDetectionError, analyze_batting_video

router = APIRouter()

DOWNLOAD_TIMEOUT_SECONDS = 30.0


class BattingMeasurementsRequest(BaseModel):
    video_url: str
    batting_hand: Optional[str] = None


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


@router.post("/measurements/batting")
def batting_measurements(body: BattingMeasurementsRequest) -> dict:
    if body.batting_hand is not None and body.batting_hand not in ("left", "right"):
        raise HTTPException(
            status_code=422,
            detail=error_envelope(
                "INVALID_BATTING_HAND", "batting_hand must be 'left' or 'right' if provided."
            ),
        )

    video_path = _download_video(body.video_url)
    try:
        result = analyze_batting_video(video_path, body.batting_hand)
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
        "headStability": {
            "value": result.head_stability.value_cm,
            "unit": "cm",
            "confidence": result.head_stability.confidence,
            "frameCount": result.head_stability.frame_count,
            "framesWithDetection": result.head_stability.frames_with_detection,
        },
        "weightTransfer": (
            {
                "value": result.weight_transfer.value_percent,
                "unit": "percent_of_base_width",
                "confidence": result.weight_transfer.confidence,
                "frameCount": result.weight_transfer.frame_count,
                "framesWithDetection": result.weight_transfer.frames_with_detection,
            }
            if result.weight_transfer is not None
            else None
        ),
        "weightTransferSkipReason": result.weight_transfer_skip_reason,
    }
