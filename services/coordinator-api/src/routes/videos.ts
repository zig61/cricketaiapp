import type { FastifyInstance } from "fastify";
import {
  createVideoSchema,
  confirmUploadSchema,
  videoIdParamsSchema,
} from "../schemas/videos.schema.js";
import { notImplemented } from "../lib/errors.js";

/**
 * All 6 endpoints get real auth + request-schema validation. Handler bodies return a
 * stable 501 NOT_IMPLEMENTED placeholder rather than fabricated pipeline behavior —
 * the actual video pipeline is built in Milestones 04-05, the coaching engine that
 * populates analysis/comparison in Milestones 06-11.
 *
 * Business-rule error codes documented in docs/05-api.md (e.g. 409 DUPLICATE_FOLLOWUP,
 * 403 ISSUE_NOT_OWNED) require real DB queries and are NOT reproduced here — only the
 * schema-shape validation (kind enum, uuid format, cross-field rules) is real.
 */
export default async function videoRoutes(app: FastifyInstance) {
  app.post(
    "/videos",
    { preHandler: [app.authenticate, app.rateLimit({ windowMs: 60 * 60 * 1000, max: 10 })] },
    async (request) => {
      createVideoSchema.parse(request.body);
      throw notImplemented("04");
    },
  );

  app.post(
    "/videos/:videoId/confirm-upload",
    { preHandler: [app.authenticate] },
    async (request) => {
      videoIdParamsSchema.parse(request.params);
      confirmUploadSchema.parse(request.body);
      throw notImplemented("04");
    },
  );

  app.get("/videos/:videoId", { preHandler: [app.authenticate] }, async (request) => {
    videoIdParamsSchema.parse(request.params);
    throw notImplemented("05");
  });

  app.get("/videos/:videoId/analysis", { preHandler: [app.authenticate] }, async (request) => {
    videoIdParamsSchema.parse(request.params);
    throw notImplemented("08");
  });

  app.get("/videos/:videoId/comparison", { preHandler: [app.authenticate] }, async (request) => {
    videoIdParamsSchema.parse(request.params);
    throw notImplemented("11");
  });

  app.post(
    "/videos/:videoId/retry",
    { preHandler: [app.authenticate, app.rateLimit({ windowMs: 60 * 60 * 1000, max: 5 })] },
    async (request) => {
      videoIdParamsSchema.parse(request.params);
      throw notImplemented("05");
    },
  );
}
