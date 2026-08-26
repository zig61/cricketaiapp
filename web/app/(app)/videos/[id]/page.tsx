import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isDemoMode,
  demoVideos,
  demoPrimaryIssue,
  demoMeasurements,
  demoDrill,
} from "@/lib/demo";

const STATUS_MESSAGES: Record<string, string> = {
  uploaded: "Your video has been received and is queued for validation.",
  validating: "Your video is being validated.",
  rejected: "Your video was rejected.",
  analysing: "Your video is being analysed.",
  complete: "Analysis complete.",
  failed: "Something went wrong processing this video.",
};

interface ViewModel {
  kind: "initial" | "followup";
  createdAt: string;
  status: string;
  rejectionReason: string | null;
  primaryIssue: { explanationText: string | null } | null;
  measurements: { markerKey: string; value: string; confidence: number }[];
  drill: { title: string; difficulty: string; steps: string[] } | null;
}

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (await isDemoMode()) {
    const video = demoVideos.find((v) => v.id === id);
    if (!video) notFound();
    return (
      <VideoView
        model={{
          kind: video.kind,
          createdAt: video.created_at,
          status: video.status,
          rejectionReason: video.rejection_reason,
          primaryIssue: { explanationText: demoPrimaryIssue.explanation_text },
          measurements: demoMeasurements,
          drill: {
            title: demoDrill.title,
            difficulty: demoDrill.difficulty,
            steps: demoDrill.steps,
          },
        }}
      />
    );
  }

  const supabase = await createClient();
  const { data: video } = await supabase.from("videos").select("*").eq("id", id).maybeSingle();
  if (!video) notFound();

  let primaryIssue: { explanationText: string | null } | null = null;
  let measurements: ViewModel["measurements"] = [];
  let drill: ViewModel["drill"] = null;

  if (video.status === "complete") {
    const { data: analysis } = await supabase
      .from("analyses")
      .select("id")
      .eq("video_id", video.id)
      .maybeSingle();

    if (analysis) {
      const [{ data: issues }, { data: rawMeasurements }] = await Promise.all([
        supabase
          .from("issues")
          .select("id, is_primary, explanation_text")
          .eq("analysis_id", analysis.id),
        supabase.from("measurements").select("*").eq("analysis_id", analysis.id),
      ]);

      const primary = issues?.find((issue) => issue.is_primary) ?? null;
      if (primary) {
        primaryIssue = { explanationText: primary.explanation_text };

        const { data: prescription } = await supabase
          .from("drill_prescriptions")
          .select("drill_id")
          .eq("issue_id", primary.id)
          .maybeSingle();

        if (prescription) {
          const { data: drillRow } = await supabase
            .from("drills")
            .select("*")
            .eq("id", prescription.drill_id)
            .maybeSingle();
          if (drillRow) {
            drill = {
              title: drillRow.title,
              difficulty: drillRow.difficulty_level,
              steps: Array.isArray(drillRow.steps) ? (drillRow.steps as string[]) : [],
            };
          }
        }
      }

      measurements = (rawMeasurements ?? []).map((m) => ({
        markerKey: m.marker_key.replace(/_/g, " "),
        value: `${m.value} ${m.unit}`,
        confidence: m.confidence,
      }));
    }
  }

  return (
    <VideoView
      model={{
        kind: video.kind,
        createdAt: video.created_at,
        status: video.status,
        rejectionReason: video.rejection_reason,
        primaryIssue,
        measurements,
        drill,
      }}
    />
  );
}

function VideoView({ model }: { model: ViewModel }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-black dark:text-white">
        {model.kind === "followup" ? "Follow-up video" : "Video"}
      </h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Uploaded {new Date(model.createdAt).toLocaleString()}
      </p>

      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
        <p className="text-sm font-medium text-black dark:text-white">
          {STATUS_MESSAGES[model.status] ?? model.status}
        </p>
        {model.status === "rejected" && model.rejectionReason ? (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{model.rejectionReason}</p>
        ) : null}

        {model.status === "complete" && model.primaryIssue ? (
          <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
            <h2 className="text-sm font-medium text-black dark:text-white">
              Your biggest opportunity
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {model.primaryIssue.explanationText ?? "No explanation available yet."}
            </p>
          </div>
        ) : null}

        {model.status !== "complete" && model.status !== "rejected" && model.status !== "failed" ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Automated analysis isn&apos;t live yet in this build — your video will stay at this
            status until the coaching pipeline is connected.
          </p>
        ) : null}
      </div>

      {model.measurements.length > 0 ? (
        <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
          <h2 className="text-sm font-medium text-black dark:text-white">Measurements</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {model.measurements.map((m) => (
              <li
                key={m.markerKey}
                className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-300"
              >
                <span className="capitalize">{m.markerKey}</span>
                <span className="text-black dark:text-white">
                  {m.value}{" "}
                  <span className="text-xs text-zinc-400">
                    ({Math.round(m.confidence * 100)}% confidence)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {model.drill ? (
        <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-black dark:text-white">Prescribed drill</h2>
            <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs capitalize text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
              {model.drill.difficulty}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-black dark:text-white">
            {model.drill.title}
          </p>
          <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-4">
            {model.drill.steps.map((step, i) => (
              <li key={i} className="text-sm text-zinc-600 dark:text-zinc-300">
                {step}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
