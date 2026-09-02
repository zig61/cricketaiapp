import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * docs/08-coaching-engine.md §4 defines head_stability's reference range in
 * degrees (0-4). The measurement actually computed is peak lateral head
 * drift in centimeters (pose_world_landmarks, real-world scale) — degrees
 * and cm aren't convertible without camera calibration data this pipeline
 * doesn't have. Per §9 ("initial engineering hypotheses, not validated
 * science"), this is a new placeholder in the correct unit, sized against
 * the two real measurements already observed (16.55cm, 30.65cm).
 */
export const HEAD_STABILITY_REFERENCE_RANGE = [0, 5] as const;
export const HEAD_STABILITY_SEVERITY_SCALE = 20;

export const CANDIDATE_CONFIDENCE_FLOOR = 0.5;
export const PRIMARY_CONFIDENCE_FLOOR = 0.6;
const COACHABILITY_WEIGHT = 1.0;

// v1: one root cause per marker. Extend this map as more markers are built.
const ROOT_CAUSE_KEY_BY_MARKER: Record<string, string> = {
  head_stability: "head_falling_away",
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function distanceOutsideRange(value: number, [lo, hi]: readonly [number, number]): number {
  if (value < lo) return lo - value;
  if (value > hi) return value - hi;
  return 0;
}

export interface DiagnoseInput {
  analysisId: string;
  measurementId: string;
  markerKey: string;
  value: number;
  unit: string;
  confidence: number;
}

export interface DiagnoseResult {
  issueId: string;
  rootCauseId: string;
  rootCauseKey: string;
  rootCauseDescription: string;
  severity: number;
}

/**
 * Deterministic issue detection + priority selection (docs/08-coaching-engine.md
 * §4-7). Returns null when no candidate clears the confidence floor — that's
 * a valid, non-error outcome ("not enough to diagnose confidently"), not a
 * failure of this stage.
 */
export async function diagnose(
  supabaseAdmin: SupabaseClient,
  input: DiagnoseInput,
): Promise<DiagnoseResult | null> {
  const referenceRange =
    input.markerKey === "head_stability" ? HEAD_STABILITY_REFERENCE_RANGE : null;
  const severityScale =
    input.markerKey === "head_stability" ? HEAD_STABILITY_SEVERITY_SCALE : null;
  const rootCauseKey = ROOT_CAUSE_KEY_BY_MARKER[input.markerKey];

  if (!referenceRange || !severityScale || !rootCauseKey) {
    return null;
  }

  const distance = distanceOutsideRange(input.value, referenceRange);
  const isCandidate = distance > 0 && input.confidence >= CANDIDATE_CONFIDENCE_FLOOR;
  if (!isCandidate) {
    return null;
  }

  const severity = clamp(distance / severityScale, 0, 1);
  const priority = severity * input.confidence * COACHABILITY_WEIGHT;
  const isPrimary = priority > 0 && input.confidence >= PRIMARY_CONFIDENCE_FLOOR;
  if (!isPrimary) {
    return null;
  }

  const { data: rootCause, error: rootCauseError } = await supabaseAdmin
    .from("root_causes")
    .select("id, description")
    .eq("key", rootCauseKey)
    .maybeSingle();

  if (rootCauseError || !rootCause) {
    throw new Error(
      rootCauseError?.message ?? `Root cause "${rootCauseKey}" is not seeded in the database.`,
    );
  }

  const { data: issue, error: issueError } = await supabaseAdmin
    .from("issues")
    .insert({
      analysis_id: input.analysisId,
      measurement_id: input.measurementId,
      root_cause_id: rootCause.id,
      severity,
      confidence: input.confidence,
      is_primary: true,
    })
    .select("id")
    .single();

  if (issueError || !issue) {
    throw new Error(issueError?.message ?? "Could not create the issue record.");
  }

  return {
    issueId: issue.id,
    rootCauseId: rootCause.id,
    rootCauseKey,
    rootCauseDescription: rootCause.description,
    severity,
  };
}
