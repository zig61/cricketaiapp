import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoProgress } from "@/lib/demo";
import type { ProgressComparison } from "@/lib/database.types";

const VERDICT_LABELS: Record<ProgressComparison["verdict"], string> = {
  improved: "Improved",
  no_material_change: "No material change",
  regressed: "Regressed",
  inconclusive_low_confidence: "Inconclusive (low confidence)",
};

// Status colors, reserved — never reused as a categorical/series color.
const VERDICT_STYLE: Record<ProgressComparison["verdict"], string> = {
  improved: "text-[var(--good)] border-[var(--good)]/30 bg-[var(--good)]/10",
  regressed: "text-[var(--critical)] border-[var(--critical)]/30 bg-[var(--critical)]/10",
  no_material_change: "text-[var(--muted)] border-[var(--border-strong)] bg-white/[0.03]",
  inconclusive_low_confidence:
    "text-[var(--warning)] border-[var(--warning)]/30 bg-[var(--warning)]/10",
};

export default async function ProgressPage() {
  const comparisons = (await isDemoMode()) ? [demoProgress] : await fetchComparisons();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-semibold text-[var(--foreground)]">Progress</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        How your technique is trending over time.
      </p>

      <div className="surface-card mt-6 rounded-2xl p-6">
        {comparisons.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {comparisons.map((comparison) => (
              <li
                key={comparison.id}
                className="border-b border-[var(--border)] pb-4 last:border-0 last:pb-0"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${VERDICT_STYLE[comparison.verdict]}`}
                  >
                    {VERDICT_LABELS[comparison.verdict]}
                  </span>
                  <span className="text-xs text-[var(--muted-2)]">
                    {new Date(comparison.created_at).toLocaleDateString()}
                  </span>
                </div>
                {comparison.delta_value != null ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {comparison.delta_value < 0 ? "Improved by" : "Changed by"}{" "}
                    <span className="font-medium text-[var(--foreground)]">
                      {Math.abs(comparison.delta_value)}
                    </span>{" "}
                    ({Math.round(comparison.confidence * 100)}% confidence)
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            No progress data yet. Upload an initial video, train on your prescribed drill, then
            upload a follow-up to see how you&apos;ve improved.
          </p>
        )}
      </div>
    </div>
  );
}

async function fetchComparisons(): Promise<ProgressComparison[]> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) return [];

  const { data } = await supabase
    .from("progress_comparisons")
    .select("*")
    .order("created_at", { ascending: false });

  return data ?? [];
}
