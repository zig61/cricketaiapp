-- Confidence-gating pass (2026-09-06): closes a real gap where a
-- borderline-bad camera angle or landmark signal could produce a
-- plausible-but-wrong number rather than being caught, unlike the extreme
-- case (0.27cm base width) the pre-existing sanity floor already rejects.
--
-- A LOW-confidence measurement is now excluded from ever becoming a
-- diagnosable issue (see coordinator-api's diagnose.ts), which means it
-- has no explanation_text to carry a "why" to the player. This column
-- holds that deterministic, non-LLM explanation instead -- populated only
-- when confidence is LOW, independent of whether the raw value happened
-- to look like an issue or look fine.

alter table public.measurements
  add column confidence_note text;
