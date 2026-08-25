import { createServer, type Server } from "node:http";
import { exportJWK, generateKeyPair, type KeyLike } from "jose";

export interface TestJwksServer {
  url: string;
  privateKey: KeyLike;
  close: () => Promise<void>;
}

/**
 * Spins up a local HTTP server exposing a JWKS document for a freshly generated ES256
 * keypair, so auth-plugin tests can verify real JWT signatures without a live Supabase
 * project.
 */
export async function startTestJwksServer(): Promise<TestJwksServer> {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  jwk.alg = "ES256";
  jwk.use = "sig";

  const body = JSON.stringify({ keys: [jwk] });

  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine test JWKS server address.");
  }
  const url = `http://127.0.0.1:${address.port}/jwks.json`;

  return {
    url,
    privateKey,
    close: () =>
      new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
