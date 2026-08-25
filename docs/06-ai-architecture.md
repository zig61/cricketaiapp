# 06 — AI Architecture

**Status:** Draft v1
**Depends on:** [03-system-architecture.md](./03-system-architecture.md), [02-software-requirements.md](./02-software-requirements.md)
**Feeds into:** [07-computer-vision.md](./07-computer-vision.md), [08-coaching-engine.md](./08-coaching-engine.md)

## 1. AI Coaching System — Overview

Cricket AI's "AI coaching" is deliberately **not** one large model reasoning end-to-end over a video. It is a pipeline where each stage uses the right kind of system for what it's actually good at:

| Stage | System | Why |
|---|---|---|
| Body tracking | Pose-estimation ML model (MediaPipe) | Purpose-built, validated for landmark tracking; not something an LLM should attempt from raw pixels at this precision. |
| Measurement (angles, ratios, stability) | Deterministic code over landmark data | Must be reproducible, explainable, and versionable — not a black box. |
| Issue detection & prioritisation | Deterministic rules over measurements ([08-coaching-engine.md](./08-coaching-engine.md)) | Must be consistent and auditable — the same measurement always yields the same diagnosis. |
| Plain-language explanation | LLM (Anthropic Claude) | This is genuinely a language generation problem — turning structured facts into a clear, encouraging, age-appropriate explanation. |
| Drill selection | Deterministic lookup ([08-coaching-engine.md](./08-coaching-engine.md) §8) | Must be reliable and content-controlled by the coaching team, not generated per-request. |
| Progress narrative | LLM (Claude), grounded in the deterministic comparison | Same rationale as explanation generation — language, not decision-making. |

**The rule that governs all of this:** the LLM explains decisions; it never makes them. Every fact the LLM states in its output must trace back to a structured value computed elsewhere in the pipeline. This is what makes NFR-05 ("distinguishable observation / measurement / interpretation / recommendation") actually true rather than aspirational.

## 2. Prompt Architecture

Two LLM call sites in v1, both server-side only (Coordinator API — see [03-system-architecture.md](./03-system-architecture.md) §3b), both following the same pattern:

```
[System prompt: role, tone, constraints, output schema]
        +
[Structured input: JSON facts computed by earlier pipeline stages]
        →
[Claude API call, low temperature, schema-constrained via tool use]
        →
[Server-side schema validation of the response]
        →
        ├─ valid  → shown to player
        └─ invalid → logged, safe fallback template used instead (never shown a raw/unvalidated string)
```

**Call site A — Issue explanation** (SR-COACH-005), triggered once per analysis, only for the single primary issue.

*Structured input (illustrative):*
```json
{
  "player": { "ageBand": "13_17", "battingHand": "right", "playingLevel": "junior_club" },
  "subSkill": "front_foot_drive",
  "rootCause": { "key": "head_falling_away", "description": "..." },
  "measurement": { "markerKey": "head_stability", "value": 7.2, "unit": "degrees", "referenceRange": [0, 4] },
  "severity": 0.71,
  "confidence": 0.86
}
```

*Required output shape (enforced via Claude tool-use / structured output, not parsed from free text):*
```json
{
  "observation": "string — what was seen, tied to the measurement",
  "interpretation": "string — why it matters for batting",
  "recommendationPreview": "string — one sentence bridging to the drill",
  "confidenceLabel": "high" | "medium" | "low"
}
```
The model is never asked to state the recommendation itself (the drill) — that's a deterministic lookup (§8, [08-coaching-engine.md](./08-coaching-engine.md)); the model only bridges to it in `recommendationPreview`.

**Call site B — Progress narrative** (SR-PROG-002), triggered once per follow-up comparison.

*Structured input:* the `progress_comparisons` row (verdict, original/follow-up values, confidence) plus the original root cause. *Output:* a short plain-language summary consistent with the `verdict` enum already computed deterministically — the model is not permitted to alter or contradict the verdict, only phrase it.

**Model:** Claude Sonnet 5 (`claude-sonnet-5`) for both call sites at v1 launch. Model version is pinned explicitly in configuration, not floated to "latest," so that a model update is a deliberate, tested change (see [claude-api skill reference] for current model IDs/pricing when this is implemented). Temperature kept low (≈0.2–0.3) — this is an explanation task, not a creative one; consistency across repeated runs on the same input matters more than variety.

## 3. Model Responsibilities — Explicit Boundaries

To keep the "LLM explains, never decides" rule enforceable rather than aspirational, the following are **hard constraints** on both call sites, verified in code (schema validation) and in tests ([12-testing.md](./12-testing.md) §5):

- The LLM never receives raw video, images, or landmark data — only the already-computed structured facts.
- The LLM never selects the primary issue, the severity, the confidence score, the root cause, or the drill — all deterministic, computed before the LLM is called.
- The LLM output is schema-validated; any output that doesn't fit the required shape, or that appears to introduce a claim not present in the input, is discarded in favour of a safe fallback template (a plain-English rendering of the structured facts with no generated prose).
- The LLM is never given free rein to describe measurements it wasn't given — if a fact isn't in the structured input, it isn't available to be hallucinated.

## 4. Context Management

Each LLM call is **single-turn and stateless** in v1 — there is no multi-turn conversation, no chat history sent to the model, and no session memory held by the LLM itself. All "memory" (§6) lives in Postgres and is assembled into structured input by deterministic code before the call, not accumulated in a growing prompt. This keeps costs predictable, keeps behaviour auditable (the same stored input always reproduces materially the same call), and avoids prompt-injection surface from accumulated player-authored text (players do not currently submit free text that reaches the LLM at all in v1).

## 5. Player Profile in Prompts

Profile fields (`ageBand`, `battingHand`, `playingLevel`) are included in structured input **only to calibrate tone and framing**, never to change the facts. Explicit rule: age band may soften/simplify language (e.g. shorter sentences, less jargon for `under_13`) but must never change the confidence label, the severity, or the substance of the explanation.

## 6. Coaching Memory

v1 "memory" is **historical record, not adaptive model memory**: the player's past sessions, issues, and outcomes are stored relationally ([04-database.md](./04-database.md)) and are queryable for the history view (SR-HIST-001). This is not injected into the explanation-generation prompt in v1 — each analysis is explained on its own terms.

**Explicitly deferred to post-v1** (do not build now): using a player's history to adapt future diagnosis priorities (e.g. "this player has fixed head stability twice before, weight the next issue differently"), or any long-term personalised coaching model. The data model doesn't block this (all the history is captured), but v1 does not reason over it.

## 7. Confidence Handling

This is the mechanism behind NFR-05 and SR-COACH-004, and it's a coaching-integrity requirement, not a UX nicety: **Cricket AI must never present a low-confidence measurement as a confident diagnosis.**

Four distinct categories are tracked separately end-to-end (data model, pipeline, API, and UI — see [04-database.md](./04-database.md), [05-api.md](./05-api.md), [09-ux-specification.md](./09-ux-specification.md)):

| Category | Example | Source |
|---|---|---|
| **Observation** | "Your head moves laterally between backlift and contact." | Directly measured from pose data. |
| **Measurement** | "7.2° of lateral drift." | Deterministic formula over landmarks, with its own confidence score. |
| **Interpretation** | "This tends to cost balance and bat control." | Coaching-domain knowledge applied to the measurement (rule-based, then phrased by the LLM). |
| **Recommendation** | "Try the Wall Head-Still Drill." | Deterministic drill match to the root cause. |

**Confidence floors (initial values, tunable — see [08-coaching-engine.md](./08-coaching-engine.md) §6):**
- A measurement with confidence below **0.5** does not contribute to issue detection at all.
- An issue with confidence below **0.6** is not eligible to be selected as the primary issue (SR-COACH-003) — if nothing clears this bar, the player is told explicitly that the video didn't produce a confident enough diagnosis, with guidance on how to improve the recording (better lighting, clearer angle), rather than being given a shaky recommendation.
- Confidence is always shown to the player as a plain label (`high`/`medium`/`low`), derived from the numeric score by fixed thresholds — never shown as a bare, uncontextualised percentage that a young player might over-trust.

## 8. Recommendation Engine

"Recommendation" in v1 is deliberately narrow and deterministic: one root cause → one matched drill, via the `drill_root_causes` mapping ([04-database.md](./04-database.md)). There is no ranking model, no personalisation, no A/B-served recommendation logic in v1. Full mapping logic in [08-coaching-engine.md](./08-coaching-engine.md) §8.

## 9. Training-Plan Generation

**v1 scope: a training plan is exactly one prescribed drill**, tied to the single prioritised issue (§7). There is no multi-drill or multi-week plan in v1 — this is a direct consequence of the "one issue, one drill" coaching principle (see [00-product-vision.md](./00-product-vision.md) §9 and [08-coaching-engine.md](./08-coaching-engine.md)), not an oversight.

**Explicitly deferred:** sequenced multi-week programs, adaptive plans that change based on completion/non-completion patterns, or plans spanning multiple issues at once. The architecture (drill library, root-cause taxonomy, prescription/completion tracking) is structured so this can be layered on later as a scheduling/sequencing layer over the existing drill-matching primitive, without redesigning the coaching engine.

## 10. Progress Analysis

Covered mechanically in [02-software-requirements.md](./02-software-requirements.md) SR-PROG-002 and the API contract in [05-api.md](./05-api.md) `GET /videos/:videoId/comparison`. The AI-architecture-relevant point: the **verdict** (`improved` / `no_material_change` / `regressed` / `inconclusive_low_confidence`) is always computed deterministically from the two measurements and their confidences — the LLM call in this flow (Call site B, §2) narrates that pre-computed verdict, it does not derive it. This guarantees the player never receives an encouraging-sounding narrative that contradicts what was actually measured.
