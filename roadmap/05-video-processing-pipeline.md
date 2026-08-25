# Milestone 05 — Video Processing Pipeline

**Depends on:** [04-video-capture-and-upload.md](./04-video-capture-and-upload.md)
**Roadmap position:** [00-mvp.md](./00-mvp.md) #5

## Objective
Build the pipeline orchestration layer in the Coordinator API — the stage-by-stage state machine, job tracking, resumability, and retry mechanism that later milestones (CV, coaching engine, explanation, drill matching) plug their stages into.

## Why It Matters
NFR-02 requires that no submission ever silently dead-ends. This milestone builds that guarantee once, generically, so every stage added in milestones 06–09 inherits it rather than each reimplementing error handling.

## Dependencies
Milestone 04 (videos must exist and reach `validating` status to have something to orchestrate).

## Files Affected
- `services/coordinator-api/src/pipeline/*` — stage orchestrator, job runner/worker
- `services/coordinator-api/src/routes/videos.ts` — `POST /videos/:id/retry`
- `supabase/migrations/*_processing_jobs_worker.sql` (if additional worker-support columns/indexes are needed beyond milestone 04's base table)

## Implementation Requirements
- Implement the pipeline stage sequence from [/docs/03-system-architecture.md](../docs/03-system-architecture.md) §7 as a generic orchestrator that later milestones register stage implementations against (frame extraction, pose estimation, measurement, diagnosis, explanation, drill matching are all *stubbed* in this milestone — real implementations land in milestones 06–09).
- Postgres-backed job polling worker (the §0.5 assumption in [/docs/03-system-architecture.md](../docs/03-system-architecture.md)) — pick up `pending` jobs, execute, record outcome.
- Every stage transition is written before the next stage starts, so a crash mid-pipeline resumes rather than restarts.
- `POST /videos/:id/retry` per [/docs/05-api.md](../docs/05-api.md), valid only for `failed` (not `rejected`) videos.

## Acceptance Criteria
NFR-02: every submission reaches a definite terminal state. `POST /videos/:id/retry` behaves per its [/docs/05-api.md](../docs/05-api.md) contract.

## Tests
- Integration test: simulate a stage failure, confirm status reflects `failed` with a reason and a working retry.
- Integration test: kill the worker mid-pipeline, restart it, confirm the job resumes from its last completed stage rather than restarting or being lost.

## Definition of Done
Using stub stage implementations, a submitted video reliably reaches a terminal state in staging under normal and injected-failure conditions; retry works; the orchestrator's stage-registration interface is documented for milestones 06–09 to build against.
