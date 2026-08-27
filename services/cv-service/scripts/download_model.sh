#!/usr/bin/env bash
# Downloads the MediaPipe Pose Landmarker model. Not committed to git (binary,
# ~6MB) — run this once for local dev; the Dockerfile runs the equivalent
# fetch at container build time.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODELS_DIR="$SCRIPT_DIR/../models"
MODEL_URL="https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task"
MODEL_PATH="$MODELS_DIR/pose_landmarker_lite.task"

mkdir -p "$MODELS_DIR"

if [ -f "$MODEL_PATH" ]; then
  echo "Model already present at $MODEL_PATH"
  exit 0
fi

echo "Downloading pose landmarker model to $MODEL_PATH..."
curl -sL -o "$MODEL_PATH" "$MODEL_URL"
echo "Done ($(du -h "$MODEL_PATH" | cut -f1))."
