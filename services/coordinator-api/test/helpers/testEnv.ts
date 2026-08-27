import type { Env } from "../../src/config/env.js";

export function makeTestEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    PORT: 0,
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    SUPABASE_JWKS_URL: "https://test.supabase.co/auth/v1/.well-known/jwks.json",
    ANTHROPIC_API_KEY: "test-anthropic-key",
    CV_SERVICE_URL: "http://localhost:8000",
    INTERNAL_API_SECRET: "test-internal-secret-0123456789",
    ...overrides,
  };
}
