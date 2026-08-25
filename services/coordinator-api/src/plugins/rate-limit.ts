import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

/**
 * Rate limiting is intentionally NOT implemented as an in-memory counter here.
 *
 * docs/05-api.md §3 specifies per-player limits (10/hr on POST /videos, 5/hr on
 * .../retry, 120/min on everything else) and docs/11-security.md §7 requires them
 * enforced at the API layer. Cloud Run (docs/13-technology-decisions.md §6) runs
 * multiple instances behind the scenes, so an in-memory counter would let each
 * instance count independently — quietly wrong, not just incomplete. A real
 * implementation needs a shared store (Redis/Upstash) that doesn't exist yet.
 *
 * This decorates a no-op `rateLimit` preHandler so routes can already declare where
 * limiting belongs without faking behavior that isn't actually enforced.
 */
declare module "fastify" {
  interface FastifyInstance {
    rateLimit: (_limit: { windowMs: number; max: number }) => (request: unknown) => Promise<void>;
  }
}

export default fp(async function rateLimitPlugin(app: FastifyInstance) {
  app.decorate("rateLimit", (_limit: { windowMs: number; max: number }) => {
    return async () => {
      // TODO(milestone-02+): back this with a shared store before relying on it.
    };
  });
});
