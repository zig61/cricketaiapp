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

const STATUS_STYLE: Record<string, string> = {
  complete: "text-[var(--good)] border-[var(--good)]/30 bg-[var(--good)]/10",
  rejected: "text-[var(--critical)] border-[var(--critical)]/30 bg-[var(--critical)]/10",
  failed: "text-[var(--critical)] border-[var(--critical)]/30 bg-[var(--critical)]/10",
  analysing: "text-[var(--accent-strong)] border-[var(--accent)]/30 bg-[var(--accent)]/10",
  validating: "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10",
  uploaded: "text-[var(--muted)] border-[var(--border-strong)] bg-white/[0.03]",
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

  // Not gated on video.status === "complete": with only head_stability built
  // out, a real video's pipeline currently finishes at "analysing" (the full
  // loop — diagnose/explain/match_drill — hasn't run), so an analyses row can
  // exist well before status reaches "complete". Query for it whenever it
  // exists; issues/drill naturally stay empty until those stages are built.
  {
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
  const statusStyle = STATUS_STYLE[model.status] ?? STATUS_STYLE.uploaded;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">
            {model.kind === "followup" ? "Follow-up video" : "Video"}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Uploaded {new Date(model.createdAt).toLocaleString()}
          </p>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${statusStyle}`}
        >
          {model.status}
        </span>
      </div>

      <div className="surface-card mt-6 rounded-2xl p-6">
        <p className="text-sm text-[var(--muted)]">
          {STATUS_MESSAGES[model.status] ?? model.status}
        </p>
        {model.status === "rejected" && model.rejectionReason ? (
          <p className="mt-2 text-sm text-[var(--critical)]">{model.rejectionReason}</p>
        ) : null}

        {model.status === "complete" && model.primaryIssue ? (
          <div className="mt-4 border-t border-[var(--border)] pt-4">
            <h2 className="font-display text-sm font-semibold text-[var(--accent-strong)]">
              Your biggest opportunity
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">
              {model.primaryIssue.explanationText ?? "No explanation available yet."}
            </p>
          </div>
        ) : null}

        {model.status !== "complete" && model.status !== "rejected" && model.status !== "failed" ? (
          <p className="mt-2 text-xs text-[var(--muted-2)]">
            Automated analysis isn&apos;t live yet in this build — your video will stay at this
            status until the coaching pipeline is connected.
          </p>
        ) : null}
      </div>

      {model.measurements.length > 0 ? (
        <div className="mt-6">
          <h2 className="font-display mb-3 text-sm font-semibold text-[var(--foreground)]">
            Measurements
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {model.measurements.map((m) => (
              <div key={m.markerKey} className="surface-card rounded-xl p-4">
                <p className="text-xs capitalize text-[var(--muted)]">{m.markerKey}</p>
                <p className="font-display mt-1 text-xl font-semibold text-[var(--foreground)]">
                  {m.value}
                </p>
                <p className="mt-1 text-xs text-[var(--muted-2)]">
                  {Math.round(m.confidence * 100)}% confidence
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {model.drill ? (
        <div className="surface-card mt-6 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-semibold text-[var(--foreground)]">
              Prescribed drill
            </h2>
            <span className="rounded-full border border-[var(--border-strong)] px-2.5 py-1 text-xs capitalize text-[var(--muted)]">
              {model.drill.difficulty}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-[var(--accent-strong)]">
            {model.drill.title}
          </p>
          <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-4">
            {model.drill.steps.map((step, i) => (
              <li key={i} className="text-sm text-[var(--muted)]">
                {step}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
