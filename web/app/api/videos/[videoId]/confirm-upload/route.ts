import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// This route synchronously awaits coordinator-api's full pipeline run
// (validate -> ... -> persist) before responding. A warm run measured ~37s
// end-to-end (2026-09-02, live verification) -- already past Vercel's
// unconfigured default (10s on Hobby). 60 is the Hobby-plan ceiling; it
// covers the warm path with margin, but NOT a cold cv-service (~31s cold
// start on top of the ~37s run exceeds even this max) -- that failure mode
// needs a real fix (always-on tier, or an async trigger + queue), not a
// bigger number here.
export const maxDuration = 60;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request, { params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) {
    return errorResponse(401, "UNAUTHENTICATED", "You must be logged in.");
  }

  let body: { durationSeconds?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const durationSeconds = typeof body.durationSeconds === "number" ? body.durationSeconds : null;
  if (durationSeconds === null || durationSeconds <= 0) {
    return errorResponse(400, "INVALID_DURATION", "durationSeconds must be a positive number.");
  }

  // RLS restricts this to the caller's own video — a video that exists but
  // belongs to someone else looks identical to "not found" here, by design.
  const { data: video } = await supabase
    .from("videos")
    .select("id, status")
    .eq("id", videoId)
    .maybeSingle();

  if (!video) {
    return errorResponse(404, "VIDEO_NOT_FOUND", "That video could not be found.");
  }
  if (video.status !== "uploaded") {
    return errorResponse(409, "ALREADY_SUBMITTED", "This video has already been submitted.");
  }

  const { error: updateError } = await supabase
    .from("videos")
    .update({ status: "validating", duration_seconds: durationSeconds })
    .eq("id", videoId);
  if (updateError) {
    return errorResponse(500, "INTERNAL_ERROR", "Couldn't confirm the upload.");
  }

  await supabase.from("processing_jobs").insert({
    video_id: videoId,
    stage: "validate",
  });

  // Triggers coordinator-api to advance validate -> extract_frames ->
  // pose_estimate -> measure (head_stability only, for now). coordinator-api
  // isn't deployed anywhere yet, so COORDINATOR_API_URL is unset outside of
  // local dev — skip quietly rather than fail the upload confirmation over a
  // side effect. A real production version of this would go through a queue
  // with retries, not a synchronous fire-and-forget call.
  const coordinatorApiUrl = process.env.COORDINATOR_API_URL;
  if (coordinatorApiUrl && process.env.INTERNAL_API_SECRET) {
    try {
      await fetch(`${coordinatorApiUrl}/internal/videos/${videoId}/process`, {
        method: "POST",
        headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET },
      });
    } catch {
      // Non-fatal — see comment above.
    }
  }

  return NextResponse.json({ videoId, status: "validating" }, { status: 202 });
}
