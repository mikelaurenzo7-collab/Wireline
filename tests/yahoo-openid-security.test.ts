import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyYahooIdToken } from "../src/lib/yahoo-openid";

const NOW_MS = Date.UTC(2026, 6, 27, 23, 0, 0);
const NOW_SECONDS = Math.floor(NOW_MS / 1000);
const CLIENT_ID = "wireline-yahoo-client";
const NONCE = "wireline-yahoo-nonce";

type SigningFixture = {
  alg: "RS256" | "ES256";
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JsonWebKey & { alg: string; kid: string; use: string };
};

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

async function createFixture(alg: "RS256" | "ES256"): Promise<SigningFixture> {
  const kid = `kid-${alg.toLowerCase()}`;
  const keyPair =
    alg === "RS256"
      ? ((await webcrypto.subtle.generateKey(
          {
            name: "RSASSA-PKCS1-v1_5",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
          },
          true,
          ["sign", "verify"],
        )) as CryptoKeyPair)
      : ((await webcrypto.subtle.generateKey(
          { name: "ECDSA", namedCurve: "P-256" },
          true,
          ["sign", "verify"],
        )) as CryptoKeyPair);
  const publicJwk = (await webcrypto.subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey & {
    alg: string;
    kid: string;
    use: string;
  };
  publicJwk.alg = alg;
  publicJwk.kid = kid;
  publicJwk.use = "sig";
  return { alg, kid, privateKey: keyPair.privateKey, publicJwk };
}

async function signToken(
  fixture: SigningFixture,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const header = encodeJson({ alg: fixture.alg, kid: fixture.kid, typ: "JWT" });
  const payload = encodeJson({
    iss: "https://api.login.yahoo.com",
    sub: "yahoo-subject-123",
    aud: CLIENT_ID,
    exp: NOW_SECONDS + 3_600,
    iat: NOW_SECONDS - 10,
    nonce: NONCE,
    email: "Founder@Yahoo.com",
    email_verified: true,
    name: "Wireline Founder",
    ...overrides,
  });
  const signingInput = `${header}.${payload}`;
  const algorithm =
    fixture.alg === "RS256"
      ? ({ name: "RSASSA-PKCS1-v1_5" } as AlgorithmIdentifier)
      : ({ name: "ECDSA", hash: "SHA-256" } as EcdsaParams);
  const signature = await webcrypto.subtle.sign(
    algorithm,
    fixture.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
}

function jwksFetch(fixture: SigningFixture): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ keys: [fixture.publicJwk] }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
      },
    })) as typeof fetch;
}

async function verify(token: string, fixture: SigningFixture, nonce = NONCE) {
  return verifyYahooIdToken(token, {
    clientId: CLIENT_ID,
    nonce,
    nowMs: NOW_MS,
    fetchImpl: jwksFetch(fixture),
  });
}

describe("Yahoo OpenID security", () => {
  it.each(["RS256", "ES256"] as const)(
    "verifies a fully bound %s ID token and normalizes identity",
    async (alg) => {
      const fixture = await createFixture(alg);
      const identity = await verify(await signToken(fixture), fixture);
      expect(identity).toEqual({
        subject: "yahoo-subject-123",
        email: "founder@yahoo.com",
        fullName: "Wireline Founder",
      });
    },
  );

  it("rejects a forged signature and an unknown signing key", async () => {
    const fixture = await createFixture("RS256");
    const token = await signToken(fixture);
    const parts = token.split(".");
    const forgedPayload = encodeJson({
      iss: "https://api.login.yahoo.com",
      sub: "attacker",
      aud: CLIENT_ID,
      exp: NOW_SECONDS + 3_600,
      iat: NOW_SECONDS,
      nonce: NONCE,
      email: "victim@yahoo.com",
      email_verified: true,
    });
    await expect(verify(`${parts[0]}.${forgedPayload}.${parts[2]}`, fixture)).rejects.toThrow(
      "signature",
    );

    const unknownKid = `${encodeJson({ alg: "RS256", kid: "unknown" })}.${parts[1]}.${parts[2]}`;
    await expect(verify(unknownKid, fixture)).rejects.toThrow("signing key");
  });

  it.each([
    ["issuer", { iss: "https://attacker.example" }, "issuer"],
    ["audience", { aud: "another-client" }, "audience"],
    ["expiry", { exp: NOW_SECONDS - 120 }, "expired"],
    ["issued-at", { iat: NOW_SECONDS + 120 }, "issued-at"],
    ["not-before", { nbf: NOW_SECONDS + 120 }, "not active"],
    ["nonce", { nonce: "another-session" }, "nonce"],
    ["subject", { sub: "" }, "subject"],
    ["verified email", { email_verified: false }, "verify ownership"],
    ["email", { email: "not-an-email" }, "email"],
  ] as const)("rejects an invalid %s claim", async (_label, overrides, message) => {
    const fixture = await createFixture("RS256");
    await expect(verify(await signToken(fixture, overrides), fixture)).rejects.toThrow(message);
  });

  it("requires the exact browser-bound nonce", async () => {
    const fixture = await createFixture("RS256");
    const token = await signToken(fixture);
    await expect(verify(token, fixture, "wrong-browser-nonce")).rejects.toThrow("nonce");
    await expect(
      verifyYahooIdToken(token, {
        clientId: CLIENT_ID,
        nonce: undefined,
        nowMs: NOW_MS,
        fetchImpl: jwksFetch(fixture),
      }),
    ).rejects.toThrow("nonce");
  });

  it("rejects malformed, oversized, and unsupported tokens before identity use", async () => {
    const fixture = await createFixture("RS256");
    await expect(verify("not-a-jwt", fixture)).rejects.toThrow("malformed");
    await expect(verify("x".repeat(16_385), fixture)).rejects.toThrow("valid ID token");

    const token = await signToken(fixture);
    const [, payload, signature] = token.split(".");
    const unsupported = `${encodeJson({ alg: "none", kid: fixture.kid })}.${payload}.${signature}`;
    await expect(verify(unsupported, fixture)).rejects.toThrow("header");
  });
});
