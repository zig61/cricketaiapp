import { createClient } from "@/lib/supabase/server";

export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;

  const { data: comparisons } = userId
    ? await supabase
        .from("progress_comparisons")
        .select("*")
        .order("created_at", { ascending: false })
    : { data: null };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold text-black dark:text-white">Progress</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        How your technique is trending over time.
      </p>

      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-950">
        {comparisons && comparisons.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {comparisons.map((comparison) => (
              <li key={comparison.id} className="text-sm text-black dark:text-white">
                {comparison.verdict.replace(/_/g, " ")}
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
