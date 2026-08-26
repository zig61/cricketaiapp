import { createClient } from "@/lib/supabase/server";
import { isDemoMode, demoProgress } from "@/lib/demo";
import type { ProgressComparison } from "@/lib/database.types";

const VERDICT_LABELS: Record<ProgressComparison["verdict"], string> = {
  improved: "Improved",
  no_material_change: "No material change",
  regressed: "Regressed",
  inconclusive_low_confidence: "Inconclusive (low confidence)",
};

export default async function ProgressPage() {
  const comparisons = (await isDemoMode())
    ? [demoProgress]
    : await fetchComparisons();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-black dark:text-white">Progress</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        How your technique is trending over time.
      </p>

      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
        {comparisons.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {comparisons.map((comparison) => (
              <li
                key={comparison.id}
                className="border-b border-black/5 pb-4 last:border-0 last:pb-0 dark:border-white/5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-black dark:text-white">
                    {VERDICT_LABELS[comparison.verdict]}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {new Date(comparison.created_at).toLocaleDateString()}
                  </span>
                </div>
                {comparison.delta_value != null ? (
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {comparison.delta_value < 0 ? "Improved by" : "Changed by"}{" "}
                    {Math.abs(comparison.delta_value)} ({Math.round(comparison.confidence * 100)}%
                    confidence)
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
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
