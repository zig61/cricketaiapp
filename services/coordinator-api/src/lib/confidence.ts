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

// "geometry" means something different per marker (weight_transfer: stance
// width plausibility; head_stability: drift-vs-hip-width plausibility), so
// unlike consistency/visibility (genuinely marker-agnostic concepts —
// "we lost track of you" and "we couldn't see you" mean the same thing
// regardless of which marker), geometry needs a per-marker message.
// Found live (2026-09-06, not hypothetical): a real video's compressed
// camera angle dropped BOTH markers' geometry scores for related but
// distinct reasons, and the first version of this function used
// weight_transfer's "look across your feet" wording on a head_stability
// row — technically the same root cause (camera angle), but worded for
// the wrong measurement.
const GEOMETRY_MESSAGE_BY_MARKER: Record<string, string> = {
  balance_weight_transfer:
    "Your camera wasn't angled straight across your stance — try positioning it looking directly across your feet, not at an angle.",
  head_stability:
    "We couldn't get a reliable read on your head movement relative to your body size — this usually also means the camera wasn't quite side-on. Try filming from directly across your stance.",
};
const DEFAULT_GEOMETRY_MESSAGE =
  "Something about the camera angle made this measurement unreliable — try filming side-on, directly across your stance.";

const NON_GEOMETRY_MESSAGES: Record<Exclude<ConfidenceComponent, "geometry">, string> = {
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
export function lowConfidenceNote(markerKey: string, breakdown: ConfidenceBreakdown): string {
  const weakest = weakestComponent(breakdown);
  if (weakest === "geometry") {
    return GEOMETRY_MESSAGE_BY_MARKER[markerKey] ?? DEFAULT_GEOMETRY_MESSAGE;
  }
  return NON_GEOMETRY_MESSAGES[weakest];
}

/**
 * Appended deterministically to a MEDIUM-confidence explanation rather
 * than trusted to the LLM to remember — same reasoning as explain.ts's
 * existing out-of-scope guard: a prompt instruction is encouragement, not
 * a guarantee.
 */
export const MEDIUM_CONFIDENCE_CAVEAT =
  "This reading has moderate confidence, likely due to camera angle or tracking during the clip — treat it as directional rather than exact.";
