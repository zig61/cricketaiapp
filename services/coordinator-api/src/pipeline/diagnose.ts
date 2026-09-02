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

/**
 * docs/08-coaching-engine.md §4 already specifies 0.55-1.0 "normalised
 * ratio" for this exact marker — that band maps directly onto the new
 * percent-of-base-width formula (55-100%), so it's reused rather than
 * inventing a third number. Above 100% ("overbalanced") is a genuinely new
 * category this pass introduces — not in the original docs, not validated
 * against any real coaching input. Flagged plainly, same as the severity
 * scale below: a first estimate, not ground truth.
 */
export const WEIGHT_TRANSFER_REFERENCE_RANGE = [55, 100] as const;
export const WEIGHT_TRANSFER_SEVERITY_SCALE = 40;

export const CANDIDATE_CONFIDENCE_FLOOR = 0.5;
export const PRIMARY_CONFIDENCE_FLOOR = 0.6;
const COACHABILITY_WEIGHT = 1.0;

interface MarkerConfig {
  referenceRange: readonly [number, number];
  severityScale: number;
  // Below-range and above-range can map to different root causes (weight
  // transfer: below = incomplete, above = overbalanced). Markers with only
  // one meaningful failure direction (head_stability only ever measures
  // drift away from a 0 baseline) just use the same key for both.
  belowRangeRootCause: string;
  aboveRangeRootCause: string;
}

const MARKER_CONFIG: Record<string, MarkerConfig> = {
  head_stability: {
    referenceRange: HEAD_STABILITY_REFERENCE_RANGE,
    severityScale: HEAD_STABILITY_SEVERITY_SCALE,
    belowRangeRootCause: "head_falling_away",
    aboveRangeRootCause: "head_falling_away",
  },
  balance_weight_transfer: {
    referenceRange: WEIGHT_TRANSFER_REFERENCE_RANGE,
    severityScale: WEIGHT_TRANSFER_SEVERITY_SCALE,
    belowRangeRootCause: "weight_transfer_incomplete",
    aboveRangeRootCause: "weight_transfer_overbalanced",
  },
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function distanceOutsideRange(value: number, [lo, hi]: readonly [number, number]): number {
  if (value < lo) return lo - value;
  if (value > hi) return value - hi;
  return 0;
}

export interface MeasurementInput {
  measurementId: string;
  markerKey: string;
  value: number;
  unit: string;
  confidence: number;
}

export interface Candidate {
  measurementId: string;
  markerKey: string;
  value: number;
  unit: string;
  confidence: number;
  severity: number;
  priority: number;
  rootCauseKey: string;
}

/**
 * Pure — no DB access. Computes severity/priority for one marker's
 * measurement (docs/08-coaching-engine.md §4-6); returns null if it's not
 * even a candidate (in range, unmapped marker, or confidence below the
 * candidate floor).
 */
export function evaluateCandidate(input: MeasurementInput): Candidate | null {
  const config = MARKER_CONFIG[input.markerKey];
  if (!config) return null;

  const distance = distanceOutsideRange(input.value, config.referenceRange);
  const isCandidate = distance > 0 && input.confidence >= CANDIDATE_CONFIDENCE_FLOOR;
  if (!isCandidate) return null;

  const severity = clamp(distance / config.severityScale, 0, 1);
  const priority = severity * input.confidence * COACHABILITY_WEIGHT;
  const rootCauseKey =
    input.value < config.referenceRange[0] ? config.belowRangeRootCause : config.aboveRangeRootCause;

  return {
    measurementId: input.measurementId,
    markerKey: input.markerKey,
    value: input.value,
    unit: input.unit,
    confidence: input.confidence,
    severity,
    priority,
    rootCauseKey,
  };
}

/**
 * docs/08-coaching-engine.md §7's argmax — highest priority among
 * candidates whose confidence clears the (stricter) primary floor. Ties
 * broken by rootCauseKey ordering as a stable, deterministic stand-in for
 * "lowest root_cause_id" (the real DB id isn't known until after
 * selection) — docs §7 itself expects ties to be rare given continuous
 * severity/confidence values, so this is a tiebreak of last resort, not a
 * load-bearing design point. Returns null if no candidate clears the
 * primary floor — a valid "not enough to diagnose confidently" outcome.
 */
export function selectPrimary(candidates: Candidate[]): Candidate | null {
  const eligible = candidates.filter((c) => c.confidence >= PRIMARY_CONFIDENCE_FLOOR);
  if (eligible.length === 0) return null;

  return eligible.reduce((best, current) => {
    if (current.priority > best.priority) return current;
    if (current.priority === best.priority && current.rootCauseKey < best.rootCauseKey) {
      return current;
    }
    return best;
  });
}

export function referenceRangeFor(markerKey: string): readonly [number, number] | null {
  return MARKER_CONFIG[markerKey]?.referenceRange ?? null;
}

export interface RootCause {
  id: string;
  description: string;
}

export async function lookupRootCause(
  supabaseAdmin: SupabaseClient,
  rootCauseKey: string,
): Promise<RootCause> {
  const { data: rootCause, error } = await supabaseAdmin
    .from("root_causes")
    .select("id, description")
    .eq("key", rootCauseKey)
    .maybeSingle();

  if (error || !rootCause) {
    throw new Error(error?.message ?? `Root cause "${rootCauseKey}" is not seeded in the database.`);
  }
  return rootCause;
}

export interface DiagnoseResult {
  issueId: string;
  rootCauseId: string;
  rootCauseKey: string;
  rootCauseDescription: string;
  severity: number;
  markerKey: string;
  value: number;
  unit: string;
  confidence: number;
}

/**
 * Writes the issue row for the already-selected primary candidate. Not
 * responsible for selection — see evaluateCandidate/selectPrimary above.
 * The DB's own `issues_one_primary_per_analysis` partial unique index is
 * the real backstop: this function is only ever called once per analysis,
 * with the one candidate selectPrimary chose.
 */
export async function writeIssue(
  supabaseAdmin: SupabaseClient,
  analysisId: string,
  primary: Candidate,
): Promise<DiagnoseResult> {
  const rootCause = await lookupRootCause(supabaseAdmin, primary.rootCauseKey);

  const { data: issue, error: issueError } = await supabaseAdmin
    .from("issues")
    .insert({
      analysis_id: analysisId,
      measurement_id: primary.measurementId,
      root_cause_id: rootCause.id,
      severity: primary.severity,
      confidence: primary.confidence,
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
    rootCauseKey: primary.rootCauseKey,
    rootCauseDescription: rootCause.description,
    severity: primary.severity,
    markerKey: primary.markerKey,
    value: primary.value,
    unit: primary.unit,
    confidence: primary.confidence,
  };
}
