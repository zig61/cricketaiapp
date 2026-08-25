import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const STATUS_MESSAGES: Record<string, string> = {
  uploaded: "Your video has been received and is queued for validation.",
  validating: "Your video is being validated.",
  rejected: "Your video was rejected.",
  analysing: "Your video is being analysed.",
  complete: "Analysis complete.",
  failed: "Something went wrong processing this video.",
};

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: video } = await supabase.from("videos").select("*").eq("id", id).maybeSingle();
  if (!video) notFound();

  let issues: { id: string; is_primary: boolean; explanation_text: string | null }[] = [];
  if (video.status === "complete") {
    const { data: analysis } = await supabase
      .from("analyses")
      .select("id")
      .eq("video_id", video.id)
      .maybeSingle();
    if (analysis) {
      const { data } = await supabase
        .from("issues")
        .select("id, is_primary, explanation_text")
        .eq("analysis_id", analysis.id);
      issues = data ?? [];
    }
  }

  const primaryIssue = issues.find((issue) => issue.is_primary);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-black dark:text-white">
        {video.kind === "followup" ? "Follow-up video" : "Video"}
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Uploaded {new Date(video.created_at).toLocaleString()}
      </p>

      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
        <p className="text-sm font-medium text-black dark:text-white">
          {STATUS_MESSAGES[video.status] ?? video.status}
        </p>
        {video.status === "rejected" && video.rejection_reason ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{video.rejection_reason}</p>
        ) : null}

        {video.status === "complete" && primaryIssue ? (
          <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
            <h2 className="text-sm font-medium text-black dark:text-white">
              Your biggest opportunity
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {primaryIssue.explanation_text ?? "No explanation available yet."}
            </p>
          </div>
        ) : null}

        {video.status !== "complete" && video.status !== "rejected" && video.status !== "failed" ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Automated analysis isn&apos;t live yet in this build — your video will stay at this
            status until the coaching pipeline is connected.
          </p>
        ) : null}
      </div>
    </div>
  );
}
