import type { FastifyInstance } from "fastify";
import { historyQuerySchema } from "../schemas/videos.schema.js";
import { badRequest, notImplemented } from "../lib/errors.js";

export default async function playerRoutes(app: FastifyInstance) {
  app.get("/players/me/history", { preHandler: [app.authenticate] }, async (request) => {
    historyQuerySchema.parse(request.query);
    throw notImplemented("12");
  });

  app.delete("/players/me", { preHandler: [app.authenticate] }, async (request) => {
    const body = request.body as { confirm?: unknown } | undefined;
    if (body?.confirm !== true) {
      throw badRequest("CONFIRMATION_REQUIRED", "Request body must include { confirm: true }.");
    }
    throw notImplemented("12");
  });
}
