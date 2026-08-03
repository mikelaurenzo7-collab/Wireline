import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("../src/lib/server-context", () => ({ log: mocks.log }));

import { verifyInternalJwt } from "../src/lib/auth-utils";

const SECRET = "wireline-test-internal-jwt-secret-at-least-32-bytes";
const NOW_SECONDS = 1_785_798_600;

function signedToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
    "base64url",
  );
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aud: "authenticated",
    exp: NOW_SECONDS + 3_600,
    iat: NOW_SECONDS - 60,
    iss: "wireline-internal",
    sub: "00000000-0000-4000-8000-000000000001",
    session_version: 7,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW_SECONDS * 1_000);
  mocks.log.error.mockReset();
  mocks.log.warn.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// These parser semantics run in the permanent preview/production boundary suite.
describe("internal JWT claim validation", () => {
  it("accepts a canonical Wireline session token", async () => {
    const payload = await verifyInternalJwt(signedToken(validPayload()), SECRET);
    expect(payload?.sub).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("rejects compact tokens with anything other than three segments", async () => {
    const token = signedToken(validPayload());
    expect(await verifyInternalJwt(`${token}.ignored`, SECRET)).toBeNull();
    expect(await verifyInternalJwt(token.slice(0, token.lastIndexOf(".")), SECRET)).toBeNull();
  });

  it("rejects missing, non-numeric, non-finite, and non-positive issued-at claims", async () => {
    for (const iat of [undefined, "1700000000", null, 0, -1, Number.NaN]) {
      const payload = validPayload();
      if (iat === undefined) delete payload.iat;
      else payload.iat = iat;
      expect(await verifyInternalJwt(signedToken(payload), SECRET)).toBeNull();
    }
  });

  it("treats the exact expiration second as expired", async () => {
    const token = signedToken(validPayload({ exp: NOW_SECONDS }));
    expect(await verifyInternalJwt(token, SECRET)).toBeNull();
  });
});
