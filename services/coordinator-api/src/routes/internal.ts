import type { FastifyInstance } from "fastify";
import { videoIdParamsSchema } from "../schemas/videos.schema.js";
import { unauthenticated } from "../lib/errors.js";
import { processVideo } from "../pipeline/processVideo.js";
import type { RegisterRoutesOptions } from "./index.js";

/**
 * Service-to-service only — verified by a shared secret header, not the
 * player-JWT auth plugin. The only caller today is web/'s confirm-upload
 * route, running locally against COORDINATOR_API_URL for this pass (this
 * service isn't deployed anywhere yet).
 */
export default async function internalRoutes(app: FastifyInstance, opts: RegisterRoutesOptions) {
  app.post("/videos/:videoId/process", async (request) => {
    const providedSecret = request.headers["x-internal-secret"];
    if (providedSecret !== opts.env.INTERNAL_API_SECRET) {
      throw unauthenticated("Invalid or missing internal secret.");
    }

    const { videoId } = videoIdParamsSchema.parse(request.params);

    return processVideo(
      { supabaseAdmin: opts.supabaseAdmin, cvServiceUrl: opts.env.CV_SERVICE_URL },
      videoId,
    );
  });
}
