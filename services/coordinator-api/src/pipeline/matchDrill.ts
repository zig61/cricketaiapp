import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Deterministic drill lookup (docs/08-coaching-engine.md §8) — one drill per
 * root cause in v1, no selection logic needed. Returns null if the catalogue
 * has no drill for this root cause, which the caller should treat as a real
 * failure (every root cause is supposed to have one, enforced by the seed
 * migration, not by a DB constraint on this schema).
 */
export async function matchDrill(
  supabaseAdmin: SupabaseClient,
  rootCauseId: string,
  issueId: string,
): Promise<{ drillId: string } | null> {
  const { data: link, error: linkError } = await supabaseAdmin
    .from("drill_root_causes")
    .select("drill_id")
    .eq("root_cause_id", rootCauseId)
    .limit(1)
    .maybeSingle();

  if (linkError) {
    throw new Error(linkError.message);
  }
  if (!link) {
    return null;
  }

  const { error: prescriptionError } = await supabaseAdmin.from("drill_prescriptions").insert({
    issue_id: issueId,
    drill_id: link.drill_id,
  });

  if (prescriptionError) {
    throw new Error(prescriptionError.message);
  }

  return { drillId: link.drill_id };
}
