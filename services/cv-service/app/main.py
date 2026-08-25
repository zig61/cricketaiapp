"""CV microservice entrypoint.

Stateless pose-estimation service (docs/03-system-architecture.md). MediaPipe Pose
integration lands in Milestone 06 — this scaffold exposes only a health check.
"""

from fastapi import FastAPI

from app.api.health import router as health_router

app = FastAPI(title="Cricket AI - CV Service")
app.include_router(health_router)
