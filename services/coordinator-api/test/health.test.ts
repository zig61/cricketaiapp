import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { makeTestEnv } from "./helpers/testEnv.js";

describe("GET /health", () => {
  it("returns 200 with status ok, unauthenticated", async () => {
    const app = await buildApp(makeTestEnv());
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });

    await app.close();
  });
});
