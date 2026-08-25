import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  // Real pipeline stages (Milestones 05+) aren't built yet — this row exists
  // so the status/progress model is genuinely wired end-to-end, not faked.
  await supabase.from("processing_jobs").insert({
    video_id: videoId,
    stage: "validate",
  });

  return NextResponse.json({ videoId, status: "validating" }, { status: 202 });
}
