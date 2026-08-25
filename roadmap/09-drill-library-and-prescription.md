# Milestone 09 — Drill Library & Prescription

**Depends on:** [07-coaching-engine-diagnosis-and-prioritisation.md](./07-coaching-engine-diagnosis-and-prioritisation.md)
**Roadmap position:** [00-mvp.md](./00-mvp.md) #9 (can proceed in parallel with milestone 08 — both depend only on milestone 07)

## Objective
Build the drill content library, the deterministic root-cause-to-drill matching logic, and drill-completion tracking.

## Why It Matters
This is the "PRESCRIBE" step — the one, specific, actionable correction the product promises (see [/docs/00-product-vision.md](../docs/00-product-vision.md) §6). Content must be structured and editable by the coaching/content team without a code deploy, per SR-DRILL-001.

## Dependencies
Milestone 07 (needs root causes to match drills against).

## Files Affected
- `supabase/migrations/*_drills.sql`, `*_drill_root_causes.sql`, `*_drill_prescriptions.sql`, `*_drill_completions.sql` + seed data (six v1 drills, [/docs/08-coaching-engine.md](../docs/08-coaching-engine.md) §8)
- `services/coordinator-api/src/coaching-engine/drill-matching.ts`
- `services/coordinator-api/src/pipeline/stages/match-drill.ts` — replaces the milestone-05 stub

## Implementation Requirements
Covers FR-10/11, SR-COACH-006, SR-DRILL-001/002:
- Seed the six v1 drills and their `drill_root_causes` mappings exactly as specified in [/docs/08-coaching-engine.md](../docs/08-coaching-engine.md) §8.
- Deterministic matching with a defined tie-break rule (SR-COACH-006).
- `drill_completions` insert path, client-direct per [/docs/05-api.md](../docs/05-api.md) §1, RLS-scoped to the caller's own prescriptions.

## Acceptance Criteria
All acceptance criteria for SR-COACH-006, SR-DRILL-001/002 in [/docs/02-software-requirements.md](../docs/02-software-requirements.md).

## Tests
- Data-integrity CI check: every seeded root cause has at least one mapped drill (enforced as a test against seed data, not just at write time).
- RLS test: a player can only mark their own prescriptions complete.

## Definition of Done
Every diagnosed issue in staging receives a correctly matched drill; completion marking works, is timestamped, and is correctly scoped per player.
