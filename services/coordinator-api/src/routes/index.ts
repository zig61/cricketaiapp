import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";
import healthRoutes from "./health.js";
import videoRoutes from "./videos.js";
import playerRoutes from "./players.js";
import internalRoutes from "./internal.js";

export interface RegisterRoutesOptions {
  env: Env;
  supabaseAdmin: SupabaseClient;
}

export default async function registerRoutes(app: FastifyInstance, opts: RegisterRoutesOptions) {
  // Unauthenticated.
  await app.register(healthRoutes);

  // Authenticated API surface, versioned per docs/05-api.md.
  await app.register(
    async (v1) => {
      await v1.register(videoRoutes);
      await v1.register(playerRoutes);
    },
    { prefix: "/api/v1" },
  );

  // Service-to-service surface — shared-secret auth, not the player-JWT plugin.
  await app.register(
    async (internal) => {
      await internal.register(internalRoutes, opts);
    },
    { prefix: "/internal" },
  );
}
