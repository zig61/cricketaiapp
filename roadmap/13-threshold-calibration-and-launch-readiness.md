# Milestone 13 — Threshold Calibration & Launch Readiness

**Depends on:** Milestones 01–12
**Roadmap position:** [00-mvp.md](./00-mvp.md) #13 — **gates real launch**

## Objective
Resolve every open validation flagged throughout the documentation before the product makes real diagnostic claims to real players: calibrate the coaching engine's numeric thresholds against coach-labelled reference video, and complete legal review of child-data and privacy handling.

## Why It Matters
The MVP loop can be fully built and functionally correct (milestones 01–12) while still resting on numeric thresholds that are, by design, engineering placeholders (see [/docs/08-coaching-engine.md](../docs/08-coaching-engine.md) §9). Shipping those placeholders to real players as if they were validated coaching judgement would violate the product's core trustworthiness commitment ([/docs/00-product-vision.md](../docs/00-product-vision.md) §9). Similarly, the child-user privacy defaults in [/docs/11-security.md](../docs/11-security.md) §9 are engineering defaults, explicitly not a substitute for legal sign-off.

## Dependencies
The full MVP loop (milestones 01–12) must be stable and complete — calibration needs a working pipeline to calibrate, and legal review needs a concrete product to review.

## Files Affected
- `docs/08-coaching-engine.md` — reference ranges, severity scales, confidence floors, min-meaningful-deltas (§4–7, §11), with the "engineering placeholder" caveat in §9 updated once resolved
- `docs/11-security.md` — §9–10 updated with legal review outcomes
- `services/coordinator-api/src/coaching-engine/*` — constant updates resulting from calibration

## Implementation Requirements
- Collect a set of coach-labelled reference video (real coaches assessing real footage against the six v1 root causes) sufficient to calibrate reference ranges, severity scales, and confidence floors — the specific sample size/method is a coaching-team decision, not invented here.
- Re-run the calibration against the golden video set methodology from [/docs/12-testing.md](../docs/12-testing.md) §6, adjusting thresholds until system output agrees with coach judgement at a bar the coaching team signs off on.
- Complete legal review of the under-18 consent mechanism and Australian Privacy Principles compliance per [/docs/11-security.md](../docs/11-security.md) §9–10, including the cross-border storage question (§10) left open in that document.
- Update every "engineering placeholder, needs coach validation" note in the documentation once its corresponding value is resolved — this milestone's documentation update *is* part of the deliverable, not a follow-up task.

## Acceptance Criteria
Every numeric threshold in [/docs/08-coaching-engine.md](../docs/08-coaching-engine.md) §4–7 and §11 has a documented calibration source. Legal sign-off is obtained and referenced directly in [/docs/11-security.md](../docs/11-security.md).

## Tests
Recalibrated thresholds re-run against the golden video/coach-labelled set with agreement to coach judgement at a bar set by the coaching team (not invented in this document) — tracked as a repeatable, re-runnable evaluation, not a one-time manual check.

## Definition of Done
No remaining "engineering placeholder, needs coach validation" language anywhere in shipped documentation; legal sign-off is documented and linked; the product is genuinely ready — not just functionally complete — to make real diagnostic claims to real players.
