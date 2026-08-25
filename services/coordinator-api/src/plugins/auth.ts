import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { jwtVerify, type JWTVerifyGetKey } from "jose";
import { unauthenticated } from "../lib/errors.js";

export interface AuthPluginOptions {
  jwks: JWTVerifyGetKey;
  issuer: string;
  audience: string;
}

export interface AuthenticatedUser {
  id: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

/**
 * Verifies the `Authorization: Bearer <jwt>` header against Supabase's JWKS endpoint.
 * Decorates `app.authenticate`, applied as a `preHandler` on routes that require auth
 * (not registered globally, so /health stays unauthenticated without exclusion logic).
 *
 * Only works once the target Supabase project has asymmetric (ES256/RS256) JWT signing
 * keys enabled in its Auth settings — a legacy HS256 shared-secret project has no public
 * JWKS to verify against.
 */
export default fp(async function authPlugin(app: FastifyInstance, opts: AuthPluginOptions) {
  app.decorate("authenticate", async (request: FastifyRequest) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw unauthenticated();
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw unauthenticated();
    }

    try {
      const { payload } = await jwtVerify(token, opts.jwks, {
        issuer: opts.issuer,
        audience: opts.audience,
      });
      if (typeof payload.sub !== "string") {
        throw unauthenticated("Token missing subject claim");
      }
      request.user = { id: payload.sub };
    } catch (err) {
      if (err instanceof Error && err.name === "AppError") {
        throw err;
      }
      throw unauthenticated();
    }
  });
});
