import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SignJWT, generateKeyPair } from "jose";
import { buildApp } from "../src/app.js";
import { makeTestEnv } from "./helpers/testEnv.js";
import { startTestJwksServer, type TestJwksServer } from "./helpers/jwksServer.js";

const ISSUER = "https://test.supabase.co/auth/v1";
const AUDIENCE = "authenticated";
const PROTECTED_ROUTE = "/api/v1/players/me/history";

describe("auth plugin (JWKS verification)", () => {
  let jwks: TestJwksServer;

  beforeAll(async () => {
    jwks = await startTestJwksServer();
  });

  afterAll(async () => {
    await jwks.close();
  });

  async function buildTestApp() {
    return buildApp(makeTestEnv({ SUPABASE_JWKS_URL: jwks.url }));
  }

  async function signValidToken(overrides: { exp?: string; subject?: string } = {}) {
    return new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setSubject(overrides.subject ?? "user-123")
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(overrides.exp ?? "1h")
      .sign(jwks.privateKey);
  }

  it("rejects requests with no Authorization header", async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: "GET", url: PROTECTED_ROUTE });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHENTICATED");
    await app.close();
  });

  it("rejects a malformed Authorization header", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: PROTECTED_ROUTE,
      headers: { authorization: "NotBearer abc" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects a token signed by a different key than the JWKS publishes", async () => {
    const app = await buildTestApp();
    const { privateKey: otherKey } = await generateKeyPair("ES256");
    const badToken = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: "test-key" })
      .setSubject("user-123")
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(otherKey);

    const response = await app.inject({
      method: "GET",
      url: PROTECTED_ROUTE,
      headers: { authorization: `Bearer ${badToken}` },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects an expired token", async () => {
    const app = await buildTestApp();
    const expiredToken = await signValidToken({ exp: "-10s" });

    const response = await app.inject({
      method: "GET",
      url: PROTECTED_ROUTE,
      headers: { authorization: `Bearer ${expiredToken}` },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("accepts a validly signed, unexpired token and reaches the handler", async () => {
    const app = await buildTestApp();
    const token = await signValidToken();

    const response = await app.inject({
      method: "GET",
      url: PROTECTED_ROUTE,
      headers: { authorization: `Bearer ${token}` },
    });

    // Auth succeeded and the request reached the (stubbed) handler.
    expect(response.statusCode).toBe(501);
    expect(response.json().error.code).toBe("NOT_IMPLEMENTED");
    await app.close();
  });
});
