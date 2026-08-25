# Milestone 11 — Progress Comparison & Re-measurement

**Depends on:** [10-player-dashboard-and-results-ui.md](./10-player-dashboard-and-results-ui.md)
**Roadmap position:** [00-mvp.md](./00-mvp.md) #11

## Objective
Let a player submit a follow-up video against a prior issue, re-measure the relevant marker, compute a deterministic verdict, generate a grounded progress narrative, and display the Comparison Result screen.

## Why It Matters
This is the "MEASURE → IMPROVE" close of the loop — the product's actual payoff moment and the thing that differentiates it from generic feedback tools (see [/docs/00-product-vision.md](../docs/00-product-vision.md) §8). It has to be as honest as the initial diagnosis: no false "improved" verdicts, no hiding low-confidence comparisons.

## Dependencies
Milestone 10 (needs the recording flow and results UI to reuse for the follow-up path).

## Files Affected
- `services/coordinator-api/src/coaching-engine/progress-comparison.ts` ([/docs/08-coaching-engine.md](../docs/08-coaching-engine.md) §11)
- `services/coordinator-api/src/ai/progress-narrative.ts` — Claude call site B ([/docs/06-ai-architecture.md](../docs/06-ai-architecture.md) §2)
- `services/coordinator-api/src/routes/videos.ts` — `GET /videos/:id/comparison`
- `apps/mobile/app/(results)/comparison-result.tsx` ([/docs/09-ux-specification.md](../docs/09-ux-specification.md) §11)
- `apps/mobile/app/(record)/record-shot.tsx` — follow-up mode wiring (reusing the existing screen, not duplicating it)
- `supabase/migrations/*_progress_comparisons.sql`

## Implementation Requirements
Covers FR-12/13, SR-PROG-001/002:
- `progress_comparisons` table + the deterministic verdict logic from [/docs/08-coaching-engine.md](../docs/08-coaching-engine.md) §11, including the `inconclusive_low_confidence` and `formula_version_mismatch` cases.
- Claude call site B per [/docs/06-ai-architecture.md](../docs/06-ai-architecture.md) §2 — narrates the pre-computed verdict, never alters it.
- Follow-up recording mode reuses the existing Record Shot / Video Preview screens with a linked-issue context, per [/docs/09-ux-specification.md](../docs/09-ux-specification.md) §5.
- Comparison Result screen per §11 of that document, including honest framing of `regressed`/`inconclusive` outcomes.

## Acceptance Criteria
All acceptance criteria for SR-PROG-001/002; product acceptance criterion item 5 in [/docs/01-product-requirements.md](../docs/01-product-requirements.md) §7.

## Tests
- Unit tests for verdict logic, including the inconclusive and formula-version-mismatch branches.
- Golden-set test for the progress-narrative LLM call (parallel to milestone 08's approach).
- E2E: full-loop test — Journey A through to Comparison Result.

## Definition of Done
A player can submit a follow-up and receive a correct, confidence-qualified verdict; the complete first-pass MVP loop (record → diagnose → drill → follow-up → verdict) works end-to-end in staging.
