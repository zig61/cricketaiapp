import type { SupabaseClient } from "@supabase/supabase-js";
import { requestBattingMeasurements, CvServiceError, type Measurement } from "../lib/cvService.js";
import { explainIssue, type SecondaryMeasurementContext } from "../lib/explain.js";
import { lowConfidenceNote, FRONT_FOOT_SHOT_SCOPE_NOTE } from "../lib/confidence.js";
import { notFound } from "../lib/errors.js";
import { markJob } from "./markJob.js";
import {
  evaluateCandidate,
  selectPrimary,
  writeIssue,
  lookupRootCause,
  referenceRangeFor,
  UNVALIDATED_RANGE_MARKERS,
  FRONT_FOOT_SHOT_MIN_WEIGHT_TRANSFER_PERCENT,
  type Candidate,
} from "./diagnose.js";
import { matchDrill } from "./matchDrill.js";

const SIGNED_URL_EXPIRY_SECONDS = 300;
const MEASUREMENT_FORMULA_VERSION = "head-stability-and-weight-transfer-2026.09";

export interface ProcessVideoDeps {
  supabaseAdmin: SupabaseClient;
  cvServiceUrl: string;
  anthropicApiKey: string;
}

export type ProcessVideoResult =
  | {
      status: "processed";
      videoId: string;
      measurementValue: number;
      confidence: number;
      primaryIssueId: string | null;
    }
  | { status: "skipped"; videoId: string; reason: string }
  | { status: "failed"; videoId: string; stage: string; error: string };

/**
 * Advances one video's pipeline: validate (already queued by the web app's
 * confirm-upload route) -> extract_frames -> pose_estimate -> measure ->
 * diagnose -> explain -> match_drill -> persist.
 *
 * extract_frames and pose_estimate/measure don't map to three separate real
 * operations here — cv-service's one endpoint does frame extraction, pose
 * detection, and both markers' measurement computation together in a
 * single pass (avoids paying for pose estimation twice). extract_frames is
 * marked succeeded as a thin proxy for that; pose_estimate and measure are
 * marked succeeded together after the single cv-service call returns.
 * persist is a similar thin capstone, marked succeeded once
 * diagnose/explain/match_drill have all landed.
 *
 * Two markers now exist (head_stability, balance_weight_transfer), so a
 * video can have two candidate issues at once — diagnose picks exactly one
 * primary (docs/08-coaching-engine.md §7's argmax), matching the DB's own
 * `issues_one_primary_per_analysis` constraint. If neither candidate clears
 * the confidence floor, that's a valid outcome, not a failure — the
 * pipeline still completes with no primary issue.
 */
export async function processVideo(
  deps: ProcessVideoDeps,
  videoId: string,
): Promise<ProcessVideoResult> {
  const { supabaseAdmin, cvServiceUrl, anthropicApiKey } = deps;

  const { data: video } = await supabaseAdmin
    .from("videos")
    .select("id, player_id, storage_path, status")
    .eq("id", videoId)
    .maybeSingle();

  if (!video) {
    throw notFound("VIDEO_NOT_FOUND", "That video could not be found.");
  }

  // Idempotency guard: analyses.video_id is unique, so a second call would
  // otherwise fail on a DB constraint violation rather than a clean no-op.
  if (video.status !== "validating") {
    return { status: "skipped", videoId, reason: `video.status is "${video.status}", not "validating"` };
  }
  if (!video.storage_path) {
    return { status: "skipped", videoId, reason: "video has no storage_path" };
  }

  // Fetched once, up front: batting_hand determines front/back-ankle
  // assignment for weight_transfer (must be known before calling
  // cv-service), and the same row is reused for explain's player context
  // later rather than queried twice.
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("age_band, batting_hand, playing_level")
    .eq("id", video.player_id)
    .maybeSingle();
  const battingHand =
    profile?.batting_hand === "left" || profile?.batting_hand === "right"
      ? profile.batting_hand
      : null;

  await markJob(supabaseAdmin, videoId, "validate", {
    status: "succeeded",
    completed_at: new Date().toISOString(),
  });
  await supabaseAdmin.from("videos").update({ status: "analysing" }).eq("id", videoId);

  // extract_frames: thin proxy, see docstring above.
  await markJob(supabaseAdmin, videoId, "extract_frames", {
    status: "succeeded",
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });

  await markJob(supabaseAdmin, videoId, "pose_estimate", {
    status: "running",
    started_at: new Date().toISOString(),
  });

  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from("player-videos")
    .createSignedUrl(video.storage_path, SIGNED_URL_EXPIRY_SECONDS);

  if (signError || !signed) {
    const message = signError?.message ?? "Could not create a signed URL for the video.";
    await markJob(supabaseAdmin, videoId, "pose_estimate", { status: "failed", error: message });
    await supabaseAdmin.from("videos").update({ status: "failed" }).eq("id", videoId);
    return { status: "failed", videoId, stage: "pose_estimate", error: message };
  }

  let result;
  try {
    result = await requestBattingMeasurements(cvServiceUrl, signed.signedUrl, battingHand);
  } catch (err) {
    const message =
      err instanceof CvServiceError
        ? `cv-service ${err.status}: ${JSON.stringify(err.body)}`
        : err instanceof Error
          ? err.message
          : "Unknown cv-service error";
    await markJob(supabaseAdmin, videoId, "pose_estimate", {
      status: "failed",
      error: message,
      completed_at: new Date().toISOString(),
    });
    await supabaseAdmin.from("videos").update({ status: "failed" }).eq("id", videoId);
    return { status: "failed", videoId, stage: "pose_estimate", error: message };
  }

  await markJob(supabaseAdmin, videoId, "pose_estimate", {
    status: "succeeded",
    completed_at: new Date().toISOString(),
  });

  if (!result.weightTransfer && battingHand) {
    // battingHand was known but weight_transfer still came back null —
    // worth a visible log line rather than a silently skipped marker, so a
    // pattern of real users hitting this doesn't require manually calling
    // cv-service directly each time to see why (same reasoning as
    // explain.ts's fallback logging).
    console.warn("processVideo: weight_transfer skipped.", {
      videoId,
      reason: result.weightTransferSkipReason,
      diagnostics: result.weightTransferDiagnostics,
    });
  }

  await markJob(supabaseAdmin, videoId, "measure", {
    status: "running",
    started_at: new Date().toISOString(),
  });

  const { data: analysis, error: analysisError } = await supabaseAdmin
    .from("analyses")
    .insert({
      video_id: videoId,
      measurement_formula_version: MEASUREMENT_FORMULA_VERSION,
    })
    .select("id")
    .single();

  if (analysisError || !analysis) {
    const message = analysisError?.message ?? "Could not create the analysis record.";
    await markJob(supabaseAdmin, videoId, "measure", {
      status: "failed",
      error: message,
      completed_at: new Date().toISOString(),
    });
    await supabaseAdmin.from("videos").update({ status: "failed" }).eq("id", videoId);
    return { status: "failed", videoId, stage: "measure", error: message };
  }

  const measurementsToWrite: Array<{ markerKey: string; measurement: Measurement }> = [
    { markerKey: "head_stability", measurement: result.headStability },
  ];
  if (result.weightTransfer) {
    measurementsToWrite.push({ markerKey: "balance_weight_transfer", measurement: result.weightTransfer });
  }

  // Front-foot-shot scope gate (see FRONT_FOOT_SHOT_MIN_WEIGHT_TRANSFER_PERCENT,
  // diagnose.ts): weight_transfer is null whenever ankles weren't reliably
  // detected at all -- an unrelated, already-handled failure mode with no
  // shot-type signal either way, so this only ever suppresses confidence
  // when there's an actual low/negative percentage to suppress it for.
  const looksLikeFrontFootShot =
    result.weightTransfer === null ||
    result.weightTransfer.value >= FRONT_FOOT_SHOT_MIN_WEIGHT_TRANSFER_PERCENT;

  const candidates: Candidate[] = [];
  // Tracked alongside candidates so explain() can be told the primary
  // issue's confidence level (for the deterministic MEDIUM caveat) without
  // re-deriving it from the raw score a second time.
  const confidenceLevelByMarker = new Map<string, "high" | "medium" | "low">();

  for (const { markerKey, measurement } of measurementsToWrite) {
    // When the scope gate trips, both markers are forced to LOW -- not just
    // relabeled, but the stored confidence itself is zeroed -- so the
    // existing CANDIDATE_CONFIDENCE_FLOOR check below excludes them from
    // ever becoming a diagnose candidate, the same mechanism a genuine
    // LOW-confidence reading already relies on. No separate gating logic
    // needed elsewhere in the pipeline.
    const level = looksLikeFrontFootShot ? measurement.confidenceBreakdown.level : "low";
    const effectiveConfidence = looksLikeFrontFootShot ? measurement.confidence : 0;
    confidenceLevelByMarker.set(markerKey, level);

    const { data: measurementRow, error: measurementError } = await supabaseAdmin
      .from("measurements")
      .insert({
        analysis_id: analysis.id,
        marker_key: markerKey,
        value: measurement.value,
        unit: measurement.unit,
        confidence: effectiveConfidence,
        // Deterministic, non-LLM -- a LOW-confidence result is already
        // known unreliable, so there's no severity/explanation for it to
        // attach to (see evaluateCandidate below); this is the only place
        // the player learns *why*, applied regardless of whether the raw
        // value happened to look like an issue or look fine.
        confidence_note: !looksLikeFrontFootShot
          ? FRONT_FOOT_SHOT_SCOPE_NOTE
          : level === "low"
            ? lowConfidenceNote(markerKey, measurement.confidenceBreakdown)
            : null,
      })
      .select("id")
      .single();

    if (measurementError || !measurementRow) {
      const message = measurementError?.message ?? "Could not create the measurement record.";
      await markJob(supabaseAdmin, videoId, "measure", {
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      });
      await supabaseAdmin.from("videos").update({ status: "failed" }).eq("id", videoId);
      return { status: "failed", videoId, stage: "measure", error: message };
    }

    const candidate = evaluateCandidate({
      measurementId: measurementRow.id,
      markerKey,
      value: measurement.value,
      unit: measurement.unit,
      confidence: effectiveConfidence,
    });
    if (candidate) candidates.push(candidate);
  }

  await markJob(supabaseAdmin, videoId, "measure", {
    status: "succeeded",
    completed_at: new Date().toISOString(),
  });

  await markJob(supabaseAdmin, videoId, "diagnose", {
    status: "running",
    started_at: new Date().toISOString(),
  });

  let diagnosis;
  try {
    const primary = selectPrimary(candidates);
    diagnosis = primary ? await writeIssue(supabaseAdmin, analysis.id, primary) : null;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown diagnose error";
    await markJob(supabaseAdmin, videoId, "diagnose", {
      status: "failed",
      error: message,
      completed_at: new Date().toISOString(),
    });
    await supabaseAdmin.from("videos").update({ status: "failed" }).eq("id", videoId);
    return { status: "failed", videoId, stage: "diagnose", error: message };
  }

  await markJob(supabaseAdmin, videoId, "diagnose", {
    status: "succeeded",
    completed_at: new Date().toISOString(),
  });

  if (diagnosis) {
    await markJob(supabaseAdmin, videoId, "explain", {
      status: "running",
      started_at: new Date().toISOString(),
    });

    let explanationText: string;
    try {
      // Any OTHER candidate besides the selected primary — a second marker
      // that also cleared the candidate floor but wasn't chosen — becomes
      // optional context explain may (not must) connect to the primary.
      const secondaryCandidate = candidates.find((c) => c.markerKey !== diagnosis.markerKey) ?? null;

      let secondaryMeasurement: SecondaryMeasurementContext | undefined;
      if (secondaryCandidate) {
        const secondaryRootCause = await lookupRootCause(supabaseAdmin, secondaryCandidate.rootCauseKey);
        secondaryMeasurement = {
          markerKey: secondaryCandidate.markerKey,
          value: secondaryCandidate.value,
          unit: secondaryCandidate.unit,
          rootCauseKey: secondaryCandidate.rootCauseKey,
          rootCauseDescription: secondaryRootCause.description,
        };
      }

      const referenceRange = referenceRangeFor(diagnosis.markerKey) ?? [0, 0];

      explanationText = await explainIssue(anthropicApiKey, {
        rootCauseKey: diagnosis.rootCauseKey,
        rootCauseDescription: diagnosis.rootCauseDescription,
        markerKey: diagnosis.markerKey,
        value: diagnosis.value,
        unit: diagnosis.unit,
        referenceRange,
        severity: diagnosis.severity,
        confidence: diagnosis.confidence,
        confidenceLevel: confidenceLevelByMarker.get(diagnosis.markerKey) ?? "high",
        player: {
          ageBand: profile?.age_band ?? null,
          battingHand: profile?.batting_hand ?? null,
          playingLevel: profile?.playing_level ?? null,
        },
        secondaryMeasurement,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown explain error";
      await markJob(supabaseAdmin, videoId, "explain", {
        status: "failed",
        error: message,
        completed_at: new Date().toISOString(),
      });
      await supabaseAdmin.from("videos").update({ status: "failed" }).eq("id", videoId);
      return { status: "failed", videoId, stage: "explain", error: message };
    }

    await supabaseAdmin
      .from("issues")
      .update({ explanation_text: explanationText })
      .eq("id", diagnosis.issueId);
    await markJob(supabaseAdmin, videoId, "explain", {
      status: "succeeded",
      completed_at: new Date().toISOString(),
    });

    await markJob(supabaseAdmin, videoId, "match_drill", {
      status: "running",
      started_at: new Date().toISOString(),
    });

    // UNVALIDATED_RANGE_MARKERS' reference ranges aren't validated (see
    // diagnose.ts), so there's no trustworthy basis to prescribe a drill
    // against yet -- skip matchDrill entirely rather than prescribing a
    // fix for a measurement explain.ts itself won't call a problem. The
    // processing_jobs schema has no "skipped" status (only pending/
    // running/succeeded/failed), so this is recorded as "succeeded" --
    // deliberately doing nothing is a valid, non-error outcome here.
    if (!UNVALIDATED_RANGE_MARKERS.has(diagnosis.markerKey)) {
      try {
        await matchDrill(supabaseAdmin, diagnosis.rootCauseId, diagnosis.issueId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown match_drill error";
        await markJob(supabaseAdmin, videoId, "match_drill", {
          status: "failed",
          error: message,
          completed_at: new Date().toISOString(),
        });
        await supabaseAdmin.from("videos").update({ status: "failed" }).eq("id", videoId);
        return { status: "failed", videoId, stage: "match_drill", error: message };
      }
    }

    await markJob(supabaseAdmin, videoId, "match_drill", {
      status: "succeeded",
      completed_at: new Date().toISOString(),
    });
  }

  await markJob(supabaseAdmin, videoId, "persist", {
    status: "succeeded",
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
  await supabaseAdmin.from("videos").update({ status: "complete" }).eq("id", videoId);

  return {
    status: "processed",
    videoId,
    measurementValue: result.headStability.value,
    confidence: result.headStability.confidence,
    primaryIssueId: diagnosis?.issueId ?? null,
  };
}
