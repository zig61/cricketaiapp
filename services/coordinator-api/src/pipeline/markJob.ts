import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Upserts a processing_jobs row by (video_id, stage) — the unique index the
 * schema already enforces. Separated from processVideo.ts so the
 * insert-vs-update branching is directly unit-testable.
 */
export async function markJob(
  supabaseAdmin: SupabaseClient,
  videoId: string,
  stage: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from("processing_jobs")
    .select("id")
    .eq("video_id", videoId)
    .eq("stage", stage)
    .maybeSingle();

  if (existing) {
    await supabaseAdmin.from("processing_jobs").update(patch).eq("id", existing.id);
  } else {
    await supabaseAdmin.from("processing_jobs").insert({ video_id: videoId, stage, ...patch });
  }
}
