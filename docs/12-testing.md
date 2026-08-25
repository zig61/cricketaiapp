# 12 — Testing Strategy

**Status:** Draft v1
**Depends on:** [02-software-requirements.md](./02-software-requirements.md), [03-system-architecture.md](./03-system-architecture.md)
**Feeds into:** `/tests`, `/roadmap` (every milestone's "Tests" section references back to this document)

**Assumption requiring validation:** specific tool choices below (Vitest, Maestro, k6) are reasonable defaults for the stack in [03-system-architecture.md](./03-system-architecture.md) but not yet battle-tested on this project — confirm before wiring up CI.

## 1. Unit Testing

- **TypeScript (Coordinator API, RN app logic):** Vitest. Every deterministic function called out in [08-coaching-engine.md](./08-coaching-engine.md) (severity formula, priority function, verdict logic) and [07-computer-vision.md](./07-computer-vision.md) (measurement formulas, once ported/mirrored in TS for orchestration-side validation) gets direct unit tests with known-input/known-output cases — these are the highest-value tests in the codebase because they're the deterministic backbone the product's honesty guarantees depend on.
- **Python (CV microservice):** pytest. Unit tests for frame extraction, landmark-to-measurement formulas, and confidence composition (§9 of [07-computer-vision.md](./07-computer-vision.md)), using fixture landmark data (not live video) for fast, deterministic runs.
- Target: every function implementing a formula or threshold from [08-coaching-engine.md](./08-coaching-engine.md) §4–7 has boundary-condition tests (value exactly at range edge, value at confidence floor, etc.) — these are exactly the places a silent off-by-one would turn into a wrong diagnosis.

## 2. Integration Testing

- Coordinator API against a real (test-project) Supabase instance — verifies RLS policies actually behave as specified ([04-database.md](./04-database.md) §5), not just as documented.
- Coordinator API ↔ CV microservice contract tests — verify the request/response shape in [03-system-architecture.md](./03-system-architecture.md) §9 holds, using a recorded/fixture response so these run without invoking real pose estimation on every CI run.
- Coordinator API ↔ Claude API — tests run against recorded fixture responses by default (fast, free, deterministic); a smaller, separate suite runs against the live API on a schedule (not every CI run) to catch drift (§5).
- Full pipeline integration test: a known-good fixture video through validation → CV → coaching engine → explanation → drill match → persistence, asserting the final stored result matches expectations end-to-end.

## 3. End-to-End Testing

- Mobile app E2E via Maestro (YAML-flow based, works well against Expo builds) covering the critical path from [01-product-requirements.md](./01-product-requirements.md) §5 Journey A: sign up → profile setup → record/upload → (fixture) analysis result → drill complete → follow-up → comparison result.
- Run against a staging environment with a seeded test account and a fixture video (not live camera capture in CI — camera interaction is tested manually/exploratorily per release, not automated).
- Journey B (unsuitable video, §5 of [01-product-requirements.md](./01-product-requirements.md)) and Journey C (returning player history) get their own E2E flows.

## 4. API Testing

Per-endpoint contract tests against the spec in [05-api.md](./05-api.md): request validation (rejecting malformed input with the right error code), auth enforcement (401 without token, 403 for non-owned resources), and response-shape schema validation. Run in CI against every PR touching the Coordinator API.

## 5. AI Output Testing

This is where "AI output" specifically means the LLM explanation/narrative calls ([06-ai-architecture.md](./06-ai-architecture.md) §2) — the deterministic coaching-engine logic is covered by §1/§2 above, not here.

- **Golden-set evaluation:** a fixed set of structured inputs (one per root cause, at varying severity/confidence) run through the real explanation prompt against the pinned model version; outputs are checked for schema compliance (§2 of [06-ai-architecture.md](./06-ai-architecture.md)) and, where feasible, an automated check that no numeric claim in the output differs from the input facts (grounding check).
- **Regression on model version change:** since the model is pinned deliberately ([06-ai-architecture.md](./06-ai-architecture.md) §2), any proposed version bump re-runs the full golden set and requires human review of output diffs before the pin is updated — a model upgrade is a reviewed change, not a silent drift.
- **Fallback-path testing:** explicit tests that malformed/schema-violating model output correctly triggers the safe fallback template (§2 of [06-ai-architecture.md](./06-ai-architecture.md)), not a raw/broken string reaching the player.
- **Tone/reading-level spot checks:** manual review cadence (not fully automatable) confirming explanations read appropriately for the `under_13`/`13_17` age bands — tracked as a recurring QA task, not a one-time check.

## 6. Computer Vision Testing

- **Formula unit tests** (§1) cover the math in isolation.
- **Golden video set:** a curated set of real (consented) or synthetic reference videos with known/expected measurement outcomes, run through the full CV pipeline periodically (not necessarily every CI run, given cost/time) to catch pipeline-level regressions that unit tests on formulas alone wouldn't catch (e.g. a frame-extraction change that silently breaks contact-point estimation).
- **Confidence calibration testing:** directly supports the calibration milestone flagged in [08-coaching-engine.md](./08-coaching-engine.md) §9 — comparing system confidence against known-good vs known-poor footage to validate the floors actually separate reliable from unreliable measurements before launch.
- **Handedness/mirroring test:** explicit test case for left-handed batters (§3 of [07-computer-vision.md](./07-computer-vision.md)) — a category of bug that would silently produce confidently wrong output for a whole player segment if untested.

## 7. Security Testing

- **RLS policy tests** (§2 above) — the primary defence, tested directly, not assumed from code review alone.
- **Dependency scanning:** automated (e.g. Dependabot/`npm audit`/`pip-audit`) on every PR and on a schedule for the full dependency tree.
- **Secrets scanning:** CI check preventing any credential-shaped string from being committed (§8 of [11-security.md](./11-security.md)).
- **Rate limit tests:** verify the limits in [05-api.md](./05-api.md) §3 are actually enforced, not just documented.
- **Auth/session tests:** token expiry, revocation-on-password-change, and cross-account access denial (attempt to read another player's video/analysis, assert 403/404).

## 8. Performance Testing

- **Pipeline latency:** load-test the full video-processing pipeline against NFR-01 (≤ 3 minutes for a ≤ 30s video) under realistic concurrency assumptions for early launch volume, using a tool such as k6 driving the Coordinator API's real endpoints against a staging environment.
- **API latency/throughput:** standard load testing on read endpoints (`GET /videos/:id`, `GET /players/me/history`) to confirm they stay responsive under polling load from many concurrent clients (SR-VID-005's polling fallback pattern).
- **Cost-per-analysis tracking** (NFR-08): not a pass/fail test, but a dashboard/alert tied to actual Claude API and CV compute spend per completed analysis, to catch a regression (e.g. an accidental reprocessing loop) before it becomes a bill surprise.

## 9. What Is Explicitly Not Automated in v1

- Live camera-capture interaction (manual/exploratory testing per release).
- Full model-quality evaluation against a large, statistically rigorous coach-labelled dataset — the golden-set approach (§5/§6) is a starting point, not a substitute for the calibration milestone in [08-coaching-engine.md](./08-coaching-engine.md) §9.
- Load testing at scales beyond early-launch assumptions — revisit when real usage data exists.
