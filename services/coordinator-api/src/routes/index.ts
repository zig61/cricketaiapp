import type { FastifyInstance } from "fastify";
import healthRoutes from "./health.js";
import videoRoutes from "./videos.js";
import playerRoutes from "./players.js";

export default async function registerRoutes(app: FastifyInstance) {
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
}
