import type { SupabaseClient } from "@supabase/supabase-js";
import { requestHeadStability, CvServiceError } from "../lib/cvService.js";
import { notFound } from "../lib/errors.js";
import { markJob } from "./markJob.js";

const SIGNED_URL_EXPIRY_SECONDS = 300;
const MEASUREMENT_FORMULA_VERSION = "head-stability-only-2026.08";

export interface ProcessVideoDeps {
  supabaseAdmin: SupabaseClient;
  cvServiceUrl: string;
}

export type ProcessVideoResult =
  | { status: "processed"; videoId: string; measurementValue: number; confidence: number }
  | { status: "skipped"; videoId: string; reason: string }
  | { status: "failed"; videoId: string; stage: string; error: string };

/**
 * Advances one video's pipeline: validate (already queued by the web app's
 * confirm-upload route) -> extract_frames -> pose_estimate -> measure.
 *
 * extract_frames and pose_estimate/measure don't map to three separate real
 * operations here — cv-service's one endpoint does frame extraction, pose
 * detection, and the measurement computation together. extract_frames is
 * marked succeeded as a thin proxy for that (noted, not pretended away);
 * pose_estimate and measure are marked succeeded together after the single
 * cv-service call returns.
 *
 * Only the head_stability marker is computed this pass — diagnose/explain/
 * match_drill are not run, so videos.status lands on "analysing", not
 * "complete" (which would imply the full coaching loop finished).
 */
export async function processVideo(
  deps: ProcessVideoDeps,
  videoId: string,
): Promise<ProcessVideoResult> {
  const { supabaseAdmin, cvServiceUrl } = deps;

  const { data: video } = await supabaseAdmin
    .from("videos")
    .select("id, storage_path, status")
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
    result = await requestHeadStability(cvServiceUrl, signed.signedUrl);
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

  const { error: measurementError } = await supabaseAdmin.from("measurements").insert({
    analysis_id: analysis.id,
    marker_key: "head_stability",
    value: result.value,
    unit: result.unit,
    confidence: result.confidence,
  });

  if (measurementError) {
    await markJob(supabaseAdmin, videoId, "measure", {
      status: "failed",
      error: measurementError.message,
      completed_at: new Date().toISOString(),
    });
    await supabaseAdmin.from("videos").update({ status: "failed" }).eq("id", videoId);
    return { status: "failed", videoId, stage: "measure", error: measurementError.message };
  }

  await markJob(supabaseAdmin, videoId, "measure", {
    status: "succeeded",
    completed_at: new Date().toISOString(),
  });

  return {
    status: "processed",
    videoId,
    measurementValue: result.value,
    confidence: result.confidence,
  };
}
