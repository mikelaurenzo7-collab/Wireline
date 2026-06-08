import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// server-context constructs a pg Pool at import time; stub it so this unit
// test never touches a database or real logger.
vi.mock("./server-context", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { verifyInternalJwt } from "./auth-utils";

const SECRET = "test-internal-jwt-secret-at-least-32-chars";

/** Mint an HS256 JWT the same way auth-service.generateToken does. */
function mintJwt(payload: Record<string, unknown>, secret = SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

const future = () => Math.floor(Date.now() / 1000) + 3600;
const past = () => Math.floor(Date.now() / 1000) - 3600;
const validSub = "11111111-1111-4111-8111-111111111111";
const validClaims = () => ({
  sub: validSub,
  aud: "authenticated",
  iss: "wireline-internal",
  exp: future(),
});

describe("verifyInternalJwt", () => {
  it("returns the payload for a valid, unexpired token", async () => {
    const token = mintJwt({ ...validClaims(), email: "a@b.com" });
    const payload = await verifyInternalJwt(token, SECRET);
    expect(payload?.sub).toBe(validSub);
    expect(payload?.email).toBe("a@b.com");
  });

  it("returns null when the signature was made with a different secret", async () => {
    const token = mintJwt(validClaims(), "a-totally-different-secret-value-x");
    expect(await verifyInternalJwt(token, SECRET)).toBeNull();
  });

  it("returns null when the payload is tampered after signing", async () => {
    const token = mintJwt({ ...validClaims(), role: "authenticated" });
    const [h, , s] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({
        ...validClaims(),
        sub: "22222222-2222-4222-8222-222222222222",
        role: "owner",
      }),
    ).toString("base64url");
    expect(await verifyInternalJwt(`${h}.${forgedBody}.${s}`, SECRET)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = mintJwt({ ...validClaims(), exp: past() });
    expect(await verifyInternalJwt(token, SECRET)).toBeNull();
  });

  it("returns null for a malformed token (missing segments)", async () => {
    expect(await verifyInternalJwt("not-a-jwt", SECRET)).toBeNull();
    expect(await verifyInternalJwt("only.two", SECRET)).toBeNull();
    expect(await verifyInternalJwt("", SECRET)).toBeNull();
  });

  it("returns null when the payload is not valid JSON", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from("{not json").toString("base64url");
    const sig = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
    expect(await verifyInternalJwt(`${header}.${body}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a token with no exp claim (no infinite-lifetime tokens)", async () => {
    const { exp: _exp, ...claimsWithoutExp } = validClaims();
    const token = mintJwt(claimsWithoutExp);
    expect(await verifyInternalJwt(token, SECRET)).toBeNull();
  });

  it("rejects tokens whose header alg is not HS256", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(validClaims())).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
    expect(await verifyInternalJwt(`${header}.${body}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects tokens whose header typ is not JWT", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWE" })).toString("base64url");
    const body = Buffer.from(JSON.stringify(validClaims())).toString("base64url");
    const sig = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
    expect(await verifyInternalJwt(`${header}.${body}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a token whose exp is not a number", async () => {
    // Forge a token where exp is a string — the previous loose check
    // (`if (payload.exp && payload.exp < now)`) would have accepted it
    // because "abc" < now coerces to false.
    const token = mintJwt({ ...validClaims(), exp: "not-a-number" });
    expect(await verifyInternalJwt(token, SECRET)).toBeNull();
  });

  it("rejects tokens with the wrong issuer", async () => {
    const token = mintJwt({ ...validClaims(), iss: "other-issuer" });
    expect(await verifyInternalJwt(token, SECRET)).toBeNull();
  });

  it("rejects tokens with the wrong audience", async () => {
    const token = mintJwt({ ...validClaims(), aud: "other-audience" });
    expect(await verifyInternalJwt(token, SECRET)).toBeNull();
  });

  it("rejects tokens whose subject is not a UUID", async () => {
    const token = mintJwt({ ...validClaims(), sub: "user-1" });
    expect(await verifyInternalJwt(token, SECRET)).toBeNull();
  });
});
