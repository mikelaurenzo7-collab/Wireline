import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// server-context constructs a pg Pool at import time; stub it so this unit
// test never touches a database or real logger.
vi.mock("./server-context", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { verifySupabaseJwt } from "./auth-utils";

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

describe("verifySupabaseJwt", () => {
  it("returns the payload for a valid, unexpired token", async () => {
    const token = mintJwt({ sub: "user-1", email: "a@b.com", aud: "authenticated", exp: future() });
    const payload = await verifySupabaseJwt(token, SECRET);
    expect(payload?.sub).toBe("user-1");
    expect(payload?.email).toBe("a@b.com");
  });

  it("returns null when the signature was made with a different secret", async () => {
    const token = mintJwt(
      { sub: "user-1", aud: "authenticated", exp: future() },
      "a-totally-different-secret-value-x",
    );
    expect(await verifySupabaseJwt(token, SECRET)).toBeNull();
  });

  it("returns null when the payload is tampered after signing", async () => {
    const token = mintJwt({
      sub: "user-1",
      role: "authenticated",
      aud: "authenticated",
      exp: future(),
    });
    const [h, , s] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: "attacker", role: "owner", aud: "authenticated", exp: future() }),
    ).toString("base64url");
    expect(await verifySupabaseJwt(`${h}.${forgedBody}.${s}`, SECRET)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const token = mintJwt({ sub: "user-1", aud: "authenticated", exp: past() });
    expect(await verifySupabaseJwt(token, SECRET)).toBeNull();
  });

  it("returns null for a malformed token (missing segments)", async () => {
    expect(await verifySupabaseJwt("not-a-jwt", SECRET)).toBeNull();
    expect(await verifySupabaseJwt("only.two", SECRET)).toBeNull();
    expect(await verifySupabaseJwt("", SECRET)).toBeNull();
  });

  it("returns null when the payload is not valid JSON", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const body = Buffer.from("{not json").toString("base64url");
    const sig = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
    expect(await verifySupabaseJwt(`${header}.${body}.${sig}`, SECRET)).toBeNull();
  });

  it("rejects a token with no exp claim (no infinite-lifetime tokens)", async () => {
    const token = mintJwt({ sub: "user-1", aud: "authenticated" });
    expect(await verifySupabaseJwt(token, SECRET)).toBeNull();
  });

  it("rejects a token whose exp is not a number", async () => {
    const token = mintJwt({ sub: "user-1", aud: "authenticated", exp: "not-a-number" });
    expect(await verifySupabaseJwt(token, SECRET)).toBeNull();
  });

  it("rejects a token with wrong audience", async () => {
    const token = mintJwt({ sub: "user-1", aud: "external-service", exp: future() });
    expect(await verifySupabaseJwt(token, SECRET)).toBeNull();
  });

  it("rejects a token with wrong issuer", async () => {
    const token = mintJwt({
      sub: "user-1",
      aud: "authenticated",
      iss: "malicious-service",
      exp: future(),
    });
    expect(await verifySupabaseJwt(token, SECRET)).toBeNull();
  });

  it("accepts a token with no issuer (backward compatible)", async () => {
    const token = mintJwt({ sub: "user-1", aud: "authenticated", exp: future() });
    const payload = await verifySupabaseJwt(token, SECRET);
    expect(payload?.sub).toBe("user-1");
  });

  it("accepts a token with wireline-internal issuer", async () => {
    const token = mintJwt({
      sub: "user-1",
      aud: "authenticated",
      iss: "wireline-internal",
      exp: future(),
    });
    const payload = await verifySupabaseJwt(token, SECRET);
    expect(payload?.sub).toBe("user-1");
  });
});
