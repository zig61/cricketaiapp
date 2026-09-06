import type { ConfidenceBreakdown } from "./cvService.js";

export type ConfidenceComponent = "visibility" | "consistency" | "geometry";

/**
 * Which of the three components is dragging overall confidence down —
 * since overallScore is min(visibility, consistency, geometry), exactly
 * one of them equals overallScore (or more than one, tied; ties are
 * broken by checking geometry first, since a bad-angle geometry failure
 * is the specific gap this pass exists to surface clearly, followed by
 * consistency then visibility).
 */
export function weakestComponent(breakdown: ConfidenceBreakdown): ConfidenceComponent {
  if (breakdown.geometryScore <= breakdown.overallScore) return "geometry";
  if (breakdown.consistencyScore <= breakdown.overallScore) return "consistency";
  return "visibility";
}

const LOW_CONFIDENCE_MESSAGES: Record<ConfidenceComponent, string> = {
  geometry:
    "Your camera wasn't angled straight across your stance — try positioning it looking directly across your feet, not at an angle.",
  consistency:
    "We lost track of you partway through the clip — make sure you stay fully in frame for the whole shot.",
  visibility:
    "We couldn't see you clearly enough to measure this — check lighting and that your whole body is visible.",
};

/**
 * Deterministic, non-LLM — a LOW-confidence result is already known to be
 * unreliable, so there's no reason to spend a Claude call explaining it.
 * Applied whenever confidence is LOW, independent of whether the raw
 * value happened to look like an issue or look fine — a LOW-confidence
 * reading that looks fine by chance is exactly the "confidently wrong"
 * case worth catching too.
 */
export function lowConfidenceNote(breakdown: ConfidenceBreakdown): string {
  return LOW_CONFIDENCE_MESSAGES[weakestComponent(breakdown)];
}

/**
 * Appended deterministically to a MEDIUM-confidence explanation rather
 * than trusted to the LLM to remember — same reasoning as explain.ts's
 * existing out-of-scope guard: a prompt instruction is encouragement, not
 * a guarantee.
 */
export const MEDIUM_CONFIDENCE_CAVEAT =
  "This reading has moderate confidence, likely due to camera angle or tracking during the clip — treat it as directional rather than exact.";
