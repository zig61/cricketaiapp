import { createRemoteJWKSet, type JWTVerifyGetKey } from "jose";

/**
 * Creates a memoized remote JWK set for verifying Supabase-issued JWTs.
 * `jose` handles its own fetch caching/cooldown against the JWKS endpoint.
 */
export function createSupabaseJwks(jwksUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(jwksUrl));
}
