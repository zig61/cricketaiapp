# Milestone 06 — Pose Estimation & Technique Measurement

**Depends on:** [05-video-processing-pipeline.md](./05-video-processing-pipeline.md)
**Roadmap position:** [00-mvp.md](./00-mvp.md) #6

## Objective
Build the real CV microservice: frame extraction, MediaPipe pose estimation, the six v1 technique measurement formulas, and confidence scoring — replacing the stub CV stage from milestone 05.

## Why It Matters
This is the "ANALYSE" step of the core loop and the factual foundation everything downstream (diagnosis, explanation, comparison) depends on. Every honesty guarantee in the product (confidence labelling, the observation/measurement distinction) is only real if this stage is implemented exactly as specified in [/docs/07-computer-vision.md](../docs/07-computer-vision.md) — no shortcuts that quietly overstate accuracy.

## Dependencies
Milestone 05 (pipeline orchestrator must exist to plug this stage into).

## Files Affected
- `services/cv-service/` — frame extraction, pose estimation, measurement formulas ([/docs/07-computer-vision.md](../docs/07-computer-vision.md) §2–4, §8–11)
- `services/coordinator-api/src/pipeline/stages/cv.ts` — CV microservice client, replacing the milestone-05 stub
- `supabase/migrations/*_analyses.sql`, `*_measurements.sql` ([/docs/04-database.md](../docs/04-database.md) §1)

## Implementation Requirements
Covers FR-06, SR-CV-001 through SR-CV-004:
- Frame extraction with contact-point-estimate heuristic (§2 of [/docs/07-computer-vision.md](../docs/07-computer-vision.md)).
- MediaPipe Pose integration, 33-landmark output with per-landmark confidence (§3).
- The six versioned measurement formulas exactly as specified in §8 — `head_stability`, `balance_weight_transfer`, `backlift_alignment`, `front_elbow_height`, `base_width`, `follow_through_shape`.
- Handedness/mirroring correction using the player's `batting_hand` profile field.
- Confidence composition per §9.
- Persistence: `analyses` + `measurements` rows, raw landmark JSON to Storage (`landmarks_storage_path`).
- Wire the real CV client into the pipeline orchestrator, replacing milestone 05's stub for this stage; also replaces milestone 04's lightweight suitability heuristic with the real pose-based suitability check.

## Acceptance Criteria
All acceptance criteria for SR-CV-001 through SR-CV-004 in [/docs/02-software-requirements.md](../docs/02-software-requirements.md).

## Tests
- pytest unit tests per formula, using fixture landmark data (known input → known output), including boundary cases.
- Golden video set test per [/docs/12-testing.md](../docs/12-testing.md) §6.
- Explicit handedness/mirroring test case.

## Definition of Done
A real fixture video, submitted through the full app flow, produces all six measurements with plausible values and confidences, persisted correctly, in staging. Any formula detail that changed from the [/docs/07-computer-vision.md](../docs/07-computer-vision.md) spec during implementation is reflected back into that document, with the formula version bumped.
