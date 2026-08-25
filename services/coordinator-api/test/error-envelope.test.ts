import { describe, it, expect, afterEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import errorHandlerPlugin from "../src/plugins/error-handler.js";
import { badRequest } from "../src/lib/errors.js";

async function buildErrorTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);

  app.get("/throw-app-error", async () => {
    throw badRequest("SOME_CODE", "Something was wrong.", { field: "x" });
  });
  app.get("/throw-zod-error", async () => {
    z.object({ a: z.string() }).parse({});
  });
  app.get("/throw-generic-error", async () => {
    throw new Error("boom");
  });

  return app;
}

describe("error envelope", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("maps AppError to { error: { code, message, details } } with its status", async () => {
    app = await buildErrorTestApp();
    const response = await app.inject({ method: "GET", url: "/throw-app-error" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: "SOME_CODE", message: "Something was wrong.", details: { field: "x" } },
    });
  });

  it("maps ZodError to a 400 VALIDATION_ERROR envelope", async () => {
    app = await buildErrorTestApp();
    const response = await app.inject({ method: "GET", url: "/throw-zod-error" });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("maps an uncaught error to a 500 INTERNAL_ERROR envelope, without leaking details", async () => {
    app = await buildErrorTestApp();
    const response = await app.inject({ method: "GET", url: "/throw-generic-error" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        details: undefined,
      },
    });
  });

  it("maps an unknown route to a 404 NOT_FOUND envelope", async () => {
    app = await buildErrorTestApp();
    const response = await app.inject({ method: "GET", url: "/does-not-exist" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");
  });
});
