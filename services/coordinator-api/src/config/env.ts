import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWKS_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().min(1),
  CV_SERVICE_URL: z.string().url(),
  // Shared secret for service-to-service calls (e.g. the web app triggering
  // pipeline processing) — not a player JWT, so it doesn't go through the
  // auth plugin.
  INTERNAL_API_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof envSchema> & { SUPABASE_JWKS_URL: string };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  const env = parsed.data;
  return {
    ...env,
    SUPABASE_JWKS_URL: env.SUPABASE_JWKS_URL ?? `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
  };
}
