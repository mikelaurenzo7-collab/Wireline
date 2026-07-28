import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyYahooIdToken } from "../src/lib/yahoo-openid";

const NOW_MS = Date.UTC(2026, 6, 27, 23, 45, 0);
const NOW_SECONDS = Math.floor(NOW_MS / 1000);
const CLIENT_ID = "wireline-yahoo-client";
const NONCE = "wireline-yahoo-rotation-nonce";

async function createSigningFixture(kid: string) {
  const keyPair = (await webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const publicJwk = (await webcrypto.subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey & {
    alg: string;
    kid: string;
    use: string;
  };
  publicJwk.alg = "RS256";
  publicJwk.kid = kid;
  publicJwk.use = "sig";
  return { privateKey: keyPair.privateKey, publicJwk, kid };
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

async function signToken(fixture: Awaited<ReturnType<typeof createSigningFixture>>) {
  const header = encodeJson({ alg: "RS256", kid: fixture.kid, typ: "JWT" });
  const payload = encodeJson({
    iss: "https://api.login.yahoo.com",
    sub: "rotated-yahoo-subject",
    aud: CLIENT_ID,
    exp: NOW_SECONDS + 3_600,
    iat: NOW_SECONDS - 10,
    nonce: NONCE,
    email: "rotation@yahoo.com",
    email_verified: true,
  });
  const signingInput = `${header}.${payload}`;
  const signature = await webcrypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    fixture.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
}

function jwksResponse(publicJwk: JsonWebKey): Response {
  return new Response(JSON.stringify({ keys: [publicJwk] }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=21600",
    },
  });
}

describe("Yahoo JWKS rotation", () => {
  it("refreshes once when the token kid is absent from the first JWKS response", async () => {
    const stale = await createSigningFixture("stale-key");
    const rotated = await createSigningFixture("rotated-key");
    const token = await signToken(rotated);
    let fetchCount = 0;
    const fetchImpl = (async () => {
      fetchCount += 1;
      return jwksResponse(fetchCount === 1 ? stale.publicJwk : rotated.publicJwk);
    }) as typeof fetch;

    const identity = await verifyYahooIdToken(token, {
      clientId: CLIENT_ID,
      nonce: NONCE,
      nowMs: NOW_MS,
      fetchImpl,
    });

    expect(fetchCount).toBe(2);
    expect(identity.email).toBe("rotation@yahoo.com");
  });

  it("still fails closed after one refresh when the key remains unknown", async () => {
    const stale = await createSigningFixture("stale-key-only");
    const rotated = await createSigningFixture("never-published-key");
    const token = await signToken(rotated);
    let fetchCount = 0;
    const fetchImpl = (async () => {
      fetchCount += 1;
      return jwksResponse(stale.publicJwk);
    }) as typeof fetch;

    await expect(
      verifyYahooIdToken(token, {
        clientId: CLIENT_ID,
        nonce: NONCE,
        nowMs: NOW_MS,
        fetchImpl,
      }),
    ).rejects.toThrow("signing key");
    expect(fetchCount).toBe(2);
  });
});
