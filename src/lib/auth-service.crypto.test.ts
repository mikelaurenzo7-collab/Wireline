import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only the pure crypto / pure-logic exports of auth-service are exercised
// here (password hashing, owner-email check, token minting). The DB-backed
// authService.signIn/signUp methods need a real Drizzle and belong in an
// integration test. server-context + db/schema are stubbed so importing the
// module doesn't spin up a pg Pool.
vi.mock("./server-context", () => ({
  drizzle: {},
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("../db/schema", () => ({ users: {} }));

import {
  generateToken,
  hashPassword,
  isOwnerEmail,
  resetOwnerEmailCacheForTests,
  verifyPassword,
} from "./auth-service";
import { verifyInternalJwt } from "./auth-utils";

describe("hashPassword / verifyPassword", () => {
  it("verifies a correct password against its own hash", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const hash = hashPassword("right-password");
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("salts: the same password hashes differently each time", () => {
    expect(hashPassword("repeat")).not.toBe(hashPassword("repeat"));
  });

  it("produces a salt:hash envelope", () => {
    const [salt, hash] = hashPassword("x").split(":");
    expect(salt).toMatch(/^[0-9a-f]{32}$/); // 16 random bytes hex
    expect(hash).toMatch(/^[0-9a-f]{128}$/); // 64-byte scrypt key hex
  });

  it("returns false for malformed stored hashes instead of throwing", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "no-colon-here")).toBe(false);
    expect(verifyPassword("x", "salt:")).toBe(false);
  });
});

describe("isOwnerEmail", () => {
  const ORIG = process.env.OWNER_EMAIL;
  const ORIG_EXTRA = process.env.OWNER_EMAILS;
  beforeEach(() => {
    resetOwnerEmailCacheForTests();
    process.env.OWNER_EMAIL = "Founder@Wireline.com";
    delete process.env.OWNER_EMAILS;
  });
  afterEach(() => {
    resetOwnerEmailCacheForTests();
    if (ORIG === undefined) delete process.env.OWNER_EMAIL;
    else process.env.OWNER_EMAIL = ORIG;
    if (ORIG_EXTRA === undefined) delete process.env.OWNER_EMAILS;
    else process.env.OWNER_EMAILS = ORIG_EXTRA;
  });

  it("matches case-insensitively and trims whitespace", () => {
    expect(isOwnerEmail("founder@wireline.com")).toBe(true);
    expect(isOwnerEmail("  FOUNDER@WIRELINE.COM  ")).toBe(true);
  });

  it("supports OWNER_EMAILS comma-separated allowlist", () => {
    process.env.OWNER_EMAILS = "ops@wireline.com, QA@Example.com ";
    resetOwnerEmailCacheForTests();
    expect(isOwnerEmail("ops@wireline.com")).toBe(true);
    expect(isOwnerEmail("qa@example.com")).toBe(true);
    expect(isOwnerEmail("founder@wireline.com")).toBe(true);
  });

  it("rejects non-owner and empty/null inputs", () => {
    expect(isOwnerEmail("someone@else.com")).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
  });

  it("returns false when OWNER_EMAIL is unset (no accidental owner)", () => {
    delete process.env.OWNER_EMAIL;
    resetOwnerEmailCacheForTests();
    expect(isOwnerEmail("anyone@wireline.com")).toBe(false);
  });
});

describe("generateToken", () => {
  const SECRET = "token-signing-secret-at-least-32-chars-long";
  const ORIG_INTERNAL = process.env.INTERNAL_JWT_SECRET;
  const ORIG_LEGACY = process.env.SUPABASE_JWT_SECRET;
  beforeEach(() => {
    process.env.INTERNAL_JWT_SECRET = SECRET;
    // requireInternalJwtSecret() throws JWT_SECRET_CONFLICT when both the
    // canonical and legacy secrets are set but differ. CI sets
    // SUPABASE_JWT_SECRET, so clear it here to isolate the secret under test
    // (otherwise generateToken throws and the suite is environment-dependent).
    delete process.env.SUPABASE_JWT_SECRET;
  });
  afterEach(() => {
    if (ORIG_INTERNAL === undefined) delete process.env.INTERNAL_JWT_SECRET;
    else process.env.INTERNAL_JWT_SECRET = ORIG_INTERNAL;
    if (ORIG_LEGACY === undefined) delete process.env.SUPABASE_JWT_SECRET;
    else process.env.SUPABASE_JWT_SECRET = ORIG_LEGACY;
  });

  it("mints a token that verifies under the same secret", async () => {
    const token = generateToken({
      id: "11111111-1111-4111-8111-111111111111",
      email: "user@wireline.com",
    });
    const payload = await verifyInternalJwt(token, SECRET);
    expect(payload?.sub).toBe("11111111-1111-4111-8111-111111111111");
    expect(payload?.email).toBe("user@wireline.com");
    expect(payload?.aud).toBe("authenticated");
  });

  it("sets an expiry roughly 2 hours out", () => {
    const token = generateToken({ id: "11111111-1111-4111-8111-111111111111", email: "e@e.com" });
    const body = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const lifetime = body.exp - body.iat;
    expect(lifetime).toBe(2 * 60 * 60);
  });
});
