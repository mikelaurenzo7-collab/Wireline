import { describe, it, expect, beforeEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  isOwnerEmail,
  resetOwnerEmailCacheForTests,
} from "../src/lib/auth-service";

const versionedUser = (id: string, email: string, sessionVersion = 0) => ({
  id,
  email,
  sessionVersion,
});

describe("hashPassword", () => {
  it("produces a salt:hash format", () => {
    const result = hashPassword("test-password");
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(32);
    expect(parts[1]).toHaveLength(128);
  });

  it("produces different hashes for the same password", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("handles special characters", () => {
    const result = hashPassword("p@ss!#$%^&*()_+-=[]{}|;:,.<>?/~`");
    expect(result.split(":")).toHaveLength(2);
  });

  it("handles empty string for compatibility helpers", () => {
    expect(hashPassword("").split(":")).toHaveLength(2);
  });

  it("rejects passwords beyond the request KDF byte bound", () => {
    expect(() => hashPassword("a".repeat(1000))).toThrow("PASSWORD_TOO_LONG");
  });
});

describe("verifyPassword", () => {
  it("verifies correct password", () => {
    const hash = hashPassword("correct-password");
    expect(verifyPassword("correct-password", hash)).toBe(true);
  });

  it("rejects incorrect password", () => {
    const hash = hashPassword("correct-password");
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("rejects when hash format is malformed", () => {
    expect(verifyPassword("anything", "not-a-valid-hash")).toBe(false);
    expect(verifyPassword("anything", "")).toBe(false);
    expect(verifyPassword("anything", "onlysalt")).toBe(false);
  });

  it("rejects password with length mismatch in hash buffer", () => {
    const hash = hashPassword("original");
    const parts = hash.split(":");
    expect(verifyPassword("original", `${parts[0]}:${parts[1].slice(0, 10)}`)).toBe(false);
  });

  it("is case-sensitive", () => {
    const hash = hashPassword("CaseSensitive");
    expect(verifyPassword("casesensitive", hash)).toBe(false);
    expect(verifyPassword("CaseSensitive", hash)).toBe(true);
  });
});

describe("generateToken", () => {
  beforeEach(() => {
    process.env.INTERNAL_JWT_SECRET = "wireline-test-internal-jwt-secret-minimum-32-chars";
    delete process.env.SUPABASE_JWT_SECRET;
  });

  it("generates a three-part JWT", () => {
    expect(generateToken(versionedUser("user-123", "test@example.com")).split(".")).toHaveLength(3);
  });

  it("includes identity and session generation in payload", () => {
    const token = generateToken(versionedUser("user-abc", "test@example.com", 7));
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(payload.sub).toBe("user-abc");
    expect(payload.email).toBe("test@example.com");
    expect(payload.session_version).toBe(7);
  });

  it("sets 2-hour expiry and standard claims", () => {
    const token = generateToken(versionedUser("user-1", "test@example.com"));
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThan(now + 60 * 60);
    expect(payload.exp).toBeLessThanOrEqual(now + 60 * 60 * 2 + 5);
    expect(payload.aud).toBe("authenticated");
    expect(payload.role).toBe("authenticated");
    expect(payload.iss).toBe("wireline-internal");
  });

  it("refuses omitted or invalid session generations", () => {
    expect(() => generateToken({ id: "user-1", email: "test@example.com" })).toThrow(
      "SESSION_VERSION_REQUIRED",
    );
    expect(() => generateToken(versionedUser("user-1", "test@example.com", -1))).toThrow(
      "SESSION_VERSION_REQUIRED",
    );
  });

  it("produces different tokens for different users", () => {
    const a = generateToken(versionedUser("user-a", "a@example.com"));
    const b = generateToken(versionedUser("user-b", "b@example.com"));
    expect(a).not.toBe(b);
  });

  it("produces different tokens for same user after time advances", async () => {
    const a = generateToken(versionedUser("user-1", "test@example.com"));
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const b = generateToken(versionedUser("user-1", "test@example.com"));
    expect(a).not.toBe(b);
  });
});

describe("isOwnerEmail", () => {
  beforeEach(() => {
    resetOwnerEmailCacheForTests();
    delete process.env.OWNER_EMAIL;
    delete process.env.OWNER_EMAILS;
  });

  it("returns false when no owner emails are configured", () => {
    expect(isOwnerEmail("admin@wireline.com")).toBe(false);
  });

  it("returns true when email matches OWNER_EMAIL", () => {
    process.env.OWNER_EMAIL = "admin@wireline.com";
    resetOwnerEmailCacheForTests();
    expect(isOwnerEmail("admin@wireline.com")).toBe(true);
  });

  it("returns false when email does not match OWNER_EMAIL", () => {
    process.env.OWNER_EMAIL = "admin@wireline.com";
    resetOwnerEmailCacheForTests();
    expect(isOwnerEmail("user@wireline.com")).toBe(false);
  });

  it("is case-insensitive and trims whitespace", () => {
    process.env.OWNER_EMAIL = "  Admin@Wireline.com  ";
    resetOwnerEmailCacheForTests();
    expect(isOwnerEmail("admin@wireline.com")).toBe(true);
  });

  it("returns false for null, undefined, and empty values", () => {
    process.env.OWNER_EMAIL = "admin@wireline.com";
    resetOwnerEmailCacheForTests();
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
    expect(isOwnerEmail("")).toBe(false);
  });

  it("supports OWNER_EMAILS comma-separated list", () => {
    process.env.OWNER_EMAIL = "admin@wireline.com";
    process.env.OWNER_EMAILS = "co-admin@wireline.com, ops@wireline.com";
    resetOwnerEmailCacheForTests();
    expect(isOwnerEmail("admin@wireline.com")).toBe(true);
    expect(isOwnerEmail("co-admin@wireline.com")).toBe(true);
    expect(isOwnerEmail("ops@wireline.com")).toBe(true);
    expect(isOwnerEmail("user@wireline.com")).toBe(false);
  });
});
