# Milestone 07 — Coaching Engine: Diagnosis & Prioritisation

**Depends on:** [06-pose-estimation-and-technique-measurement.md](./06-pose-estimation-and-technique-measurement.md)
**Roadmap position:** [00-mvp.md](./00-mvp.md) #7

## Objective
Implement the deterministic coaching logic that turns measurements into a single, prioritised, confidence-qualified issue: issue detection, root-cause/severity assignment, and priority selection.

## Why It Matters
This is the "DIAGNOSE → PRIORITISE" core of the product's killer feature (one issue, not twenty — see [/docs/00-product-vision.md](../docs/00-product-vision.md) §8). It must be deterministic and testable, because the product's trustworthiness depends on it never being a black box.

## Dependencies
Milestone 06 (needs real measurements to operate on).

## Files Affected
- `services/coordinator-api/src/coaching-engine/*` — issue detection, severity, priority ([/docs/08-coaching-engine.md](../docs/08-coaching-engine.md) §4–7)
- `services/coordinator-api/src/pipeline/stages/diagnose.ts` — replaces the milestone-05 stub
- `supabase/migrations/*_skills.sql`, `*_sub_skills.sql`, `*_root_causes.sql`, `*_issues.sql` + seed data (six v1 root causes, one skill, one sub-skill)

## Implementation Requirements
Covers FR-07/08, SR-COACH-001 through SR-COACH-004:
- Seed `skills` (Batting), `sub_skills` (Front-foot drive), `root_causes` (the six from [/docs/08-coaching-engine.md](../docs/08-coaching-engine.md) §3).
- Issue detection against reference ranges (§4), with the confidence floor (0.5) excluding low-confidence measurements from consideration.
- Deterministic severity formula (§5) and priority formula (§7), including the "no confident issue" explicit result path.
- Database constraint enforcing exactly one `is_primary = true` issue per analysis ([/docs/04-database.md](../docs/04-database.md) §4).

## Acceptance Criteria
All acceptance criteria for SR-COACH-001 through SR-COACH-004 in [/docs/02-software-requirements.md](../docs/02-software-requirements.md).

## Tests
- Unit tests for severity/priority formulas, including boundary conditions and the no-confident-issue path.
- Database constraint test confirming the one-primary-issue guarantee holds even under concurrent writes.

## Definition of Done
Given a real measurement set from milestone 06, the engine deterministically selects one correct primary issue (or the explicit no-diagnosis result) in staging. Any threshold value changed from the [/docs/08-coaching-engine.md](../docs/08-coaching-engine.md) draft during implementation is updated there, still flagged as unvalidated per §9 of that document (calibration happens in milestone 13, not here).
