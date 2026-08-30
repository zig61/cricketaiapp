# Deploy target confirmed working on Render (2026-08-30) after one fix: the
# original build ran, but the container crashed on start with
# `ImportError: libGL.so.1: cannot open shared object file` — opencv-python-headless
# still dynamically links against libGL despite the "headless" name. Added the
# full standard set below (libgl1 fixed the actual crash; the rest are the same
# family of commonly-needed shared libs for headless OpenCV on slim Debian,
# added proactively to avoid a third failed-deploy cycle discovering them
# one at a time).
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libglib2.0-0 libgl1 libgomp1 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY scripts ./scripts

RUN mkdir -p models && \
    curl -sL -o models/pose_landmarker_lite.task \
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
