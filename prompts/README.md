# /prompts

Versioned LLM prompt artefacts for the two Claude call sites defined in [/docs/06-ai-architecture.md](../docs/06-ai-architecture.md) §2: issue explanation and progress narrative generation, plus their output schemas and golden-set fixtures used in [/docs/12-testing.md](../docs/12-testing.md) §5.

Populated starting in roadmap milestone 08 ([/roadmap/08-ai-coaching-explanation.md](../roadmap/08-ai-coaching-explanation.md)) — expected contents: `explanation-system-prompt.md`, `explanation-schema.json`, `progress-narrative-system-prompt.md`, `progress-narrative-schema.json`, and a `golden-set/` fixture directory. Prompts here must stay in sync with the implementation that uses them — a prompt change without a corresponding file update here is a documentation bug.
