import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SignJWT } from "jose";
import { buildApp } from "../src/app.js";
import { makeTestEnv } from "./helpers/testEnv.js";
import { startTestJwksServer, type TestJwksServer } from "./helpers/jwksServer.js";

const ISSUER = "https://test.supabase.co/auth/v1";
const AUDIENCE = "authenticated";

describe("POST /api/v1/videos", () => {
  let jwks: TestJwksServer;
  let token: string;

  beforeAll(async () => {
    jwks = await startTestJwksServer();
    token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setSubject("user-123")
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(jwks.privateKey);
  });

  afterAll(async () => {
    await jwks.close();
  });

  async function buildTestApp() {
    return buildApp(makeTestEnv({ SUPABASE_JWKS_URL: jwks.url }));
  }

  it("rejects an unauthenticated request before validating the body", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/videos",
      payload: { kind: "initial", linkedIssueId: null },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects an invalid `kind` value with 400", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/videos",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "not-a-real-kind", linkedIssueId: null },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
    await app.close();
  });

  it("rejects kind=followup with a null linkedIssueId (cross-field rule)", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/videos",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "followup", linkedIssueId: null },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("accepts a valid body and reaches the stubbed handler", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/videos",
      headers: { authorization: `Bearer ${token}` },
      payload: { kind: "initial", linkedIssueId: null },
    });

    expect(response.statusCode).toBe(501);
    expect(response.json().error.details).toEqual({ milestone: "04" });
    await app.close();
  });
});
