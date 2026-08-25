import fp from "fastify-plugin";
import type { FastifyInstance, FastifyError } from "fastify";
import { ZodError } from "zod";
import { AppError } from "../lib/errors.js";

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function envelope(code: string, message: string, details?: unknown): ErrorEnvelope {
  return { error: { code, message, details } };
}

/**
 * Centralizes every failure path into the single error envelope shape required by
 * docs/05-api.md: { error: { code, message, details } }.
 */
export default fp(async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((err: FastifyError | AppError, _request, reply) => {
    if (err instanceof AppError) {
      reply.status(err.status).send(envelope(err.code, err.message, err.details));
      return;
    }

    if (err instanceof ZodError) {
      reply
        .status(400)
        .send(envelope("VALIDATION_ERROR", "Request failed validation.", err.issues));
      return;
    }

    if (err.validation) {
      reply.status(400).send(envelope("VALIDATION_ERROR", err.message, err.validation));
      return;
    }

    app.log.error(err);
    reply.status(500).send(envelope("INTERNAL_ERROR", "An unexpected error occurred."));
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send(envelope("NOT_FOUND", "The requested resource was not found."));
  });
});
