import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { VideoKind } from "@/lib/database.types";

const ALLOWED_KINDS: VideoKind[] = ["initial", "followup"];
const ALLOWED_EXTENSIONS = ["mp4", "mov", "m4v"];

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) {
    return errorResponse(401, "UNAUTHENTICATED", "You must be logged in.");
  }

  let body: { kind?: unknown; linkedIssueId?: unknown; fileExtension?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const kind = body.kind;
  if (typeof kind !== "string" || !ALLOWED_KINDS.includes(kind as VideoKind)) {
    return errorResponse(400, "INVALID_KIND", "kind must be 'initial' or 'followup'.");
  }

  const linkedIssueId =
    typeof body.linkedIssueId === "string" && body.linkedIssueId.length > 0
      ? body.linkedIssueId
      : null;

  if (kind === "followup" && !linkedIssueId) {
    return errorResponse(
      400,
      "INVALID_LINKED_ISSUE",
      "linkedIssueId is required when kind is 'followup'.",
    );
  }

  const fileExtension =
    typeof body.fileExtension === "string" &&
    ALLOWED_EXTENSIONS.includes(body.fileExtension.toLowerCase())
      ? body.fileExtension.toLowerCase()
      : "mp4";

  if (kind === "followup" && linkedIssueId) {
    // RLS on `issues` restricts this to the caller's own rows — a mismatch
    // between "doesn't exist" and "exists but isn't yours" is intentionally
    // indistinguishable here, which is the correct security behavior.
    const { data: issue } = await supabase
      .from("issues")
      .select("id")
      .eq("id", linkedIssueId)
      .maybeSingle();
    if (!issue) {
      return errorResponse(404, "ISSUE_NOT_FOUND", "That issue could not be found.");
    }

    const { data: existingFollowup } = await supabase
      .from("videos")
      .select("id")
      .eq("linked_issue_id", linkedIssueId)
      .eq("kind", "followup")
      .neq("status", "rejected")
      .maybeSingle();
    if (existingFollowup) {
      return errorResponse(
        409,
        "DUPLICATE_FOLLOWUP",
        "A follow-up video for this issue already exists.",
      );
    }
  }

  const { data: video, error: insertError } = await supabase
    .from("videos")
    .insert({ player_id: userId, kind: kind as VideoKind, linked_issue_id: linkedIssueId })
    .select("id")
    .single();

  if (insertError || !video) {
    return errorResponse(500, "INTERNAL_ERROR", "Couldn't create the video record.");
  }

  const storagePath = `${userId}/${video.id}/original.${fileExtension}`;

  const { error: updateError } = await supabase
    .from("videos")
    .update({ storage_path: storagePath })
    .eq("id", video.id);
  if (updateError) {
    return errorResponse(500, "INTERNAL_ERROR", "Couldn't prepare the upload.");
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("player-videos")
    .createSignedUploadUrl(storagePath);

  if (signError || !signed) {
    return errorResponse(500, "STORAGE_ERROR", "Couldn't create an upload URL.");
  }

  return NextResponse.json(
    {
      videoId: video.id,
      uploadUrl: signed.signedUrl,
      uploadToken: signed.token,
      storagePath,
      uploadExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    },
    { status: 201 },
  );
}
