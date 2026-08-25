# Deploy target: Google Cloud Run (docs/13-technology-decisions.md §6).
# Not buildable/verifiable in the scaffolding environment (no Docker available there).
FROM python:3.11-slim

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
