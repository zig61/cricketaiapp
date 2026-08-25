import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";

/**
 * Service-role Supabase client — bypasses RLS by design. This is the ONLY connection
 * that should write to the tables the RLS migrations deny to clients (analyses,
 * measurements, issues, drill_prescriptions, progress_comparisons). Unused by any
 * route handler this milestone (business logic lands in Milestones 05-09); exists so
 * later milestones don't have to invent the client-construction pattern from scratch.
 */
export function createSupabaseAdmin(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
