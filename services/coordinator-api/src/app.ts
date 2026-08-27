import Fastify, { type FastifyInstance } from "fastify";
import type { Env } from "./config/env.js";
import { createSupabaseJwks } from "./lib/jwks.js";
import { createSupabaseAdmin } from "./lib/supabaseAdmin.js";
import authPlugin from "./plugins/auth.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import rateLimitPlugin from "./plugins/rate-limit.js";
import registerRoutes from "./routes/index.js";

export async function buildApp(env: Env): Promise<FastifyInstance> {
  const app = Fastify({ logger: env.NODE_ENV !== "test" });

  await app.register(errorHandlerPlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin, {
    jwks: createSupabaseJwks(env.SUPABASE_JWKS_URL),
    issuer: `${env.SUPABASE_URL}/auth/v1`,
    audience: "authenticated",
  });
  await app.register(registerRoutes, { env, supabaseAdmin: createSupabaseAdmin(env) });

  return app;
}
