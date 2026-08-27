"""CV microservice entrypoint.

Stateless pose-estimation service (docs/03-system-architecture.md). Computes
one measurement (head_stability) via MediaPipe Pose — the other 5 markers and
the rest of the pipeline (diagnose/explain/match_drill) aren't built yet.
"""

from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.measurements import router as measurements_router

app = FastAPI(title="Cricket AI - CV Service")
app.include_router(health_router)
app.include_router(measurements_router)
