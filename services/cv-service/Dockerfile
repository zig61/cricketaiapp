# Deploy target: Google Cloud Run (docs/13-technology-decisions.md §6).
# Not buildable/verifiable in the scaffolding environment (no Docker available there) —
# the mediapipe/opencv system-library requirements on Debian slim are unverified;
# if the container fails to start, `libglib2.0-0`/`libgl1` are the usual culprits
# for headless OpenCV + MediaPipe on a minimal base image.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl libglib2.0-0 \
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
