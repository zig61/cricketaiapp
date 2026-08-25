# Milestone 08 — AI Coaching Explanation

**Depends on:** [07-coaching-engine-diagnosis-and-prioritisation.md](./07-coaching-engine-diagnosis-and-prioritisation.md)
**Roadmap position:** [00-mvp.md](./00-mvp.md) #8

## Objective
Generate the plain-language explanation of the primary issue via the Claude API, grounded strictly in structured facts, with schema validation and a safe fallback.

## Why It Matters
This is the "PRESCRIBE"-adjacent step where the product actually talks to the player — it has to be clear, honest about confidence, and incapable of inventing facts the deterministic pipeline didn't produce. Getting the LLM/deterministic boundary wrong here undermines every honesty guarantee described in [/docs/06-ai-architecture.md](../docs/06-ai-architecture.md).

## Dependencies
Milestone 07 (needs a primary issue with root cause, severity, and confidence to explain).

## Files Affected
- `services/coordinator-api/src/ai/explanation.ts`
- `prompts/explanation-system-prompt.md`, `prompts/explanation-schema.json`
- `services/coordinator-api/src/pipeline/stages/explain.ts` — replaces the milestone-05 stub

## Implementation Requirements
Covers FR-09, SR-COACH-005, and the hard constraints in [/docs/06-ai-architecture.md](../docs/06-ai-architecture.md) §3:
- Call site A exactly as specified in §2 of that document — structured input only, no raw video/landmarks reach the model.
- Schema-constrained output (Claude tool-use/structured output), server-side validation before anything reaches the player.
- Safe fallback template for schema-invalid or suspicious (ungrounded) output.
- Pinned model version in configuration, not floated to "latest."

## Acceptance Criteria
All acceptance criteria for SR-COACH-005 in [/docs/02-software-requirements.md](../docs/02-software-requirements.md); explicit verification against every constraint in [/docs/06-ai-architecture.md](../docs/06-ai-architecture.md) §3.

## Tests
- Golden-set tests per [/docs/12-testing.md](../docs/12-testing.md) §5 — one case per root cause, varying severity/confidence.
- Fallback-path test using an intentionally malformed mock model response.
- Grounding check: automated comparison confirming no numeric/factual claim in the output differs from the structured input.

## Definition of Done
Real Claude API calls produce valid, schema-conformant, grounded explanations for all six root causes in staging; the fallback path is verified to trigger correctly on bad output; `prompts/` documents the exact system prompt and schema in sync with the implementation.
