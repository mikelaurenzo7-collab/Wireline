import { describe, it, expect, beforeEach } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  isOwnerEmail,
  resetOwnerEmailCacheForTests,
} from "../src/lib/auth-service";

describe("hashPassword", () => {
  it("produces a salt:hash format", () => {
    const result = hashPassword("test-password");
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(32); // 16 bytes hex = 32 chars
    expect(parts[1]).toHaveLength(128); // 64 bytes hex = 128 chars
  });

  it("produces different hashes for the same password", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("handles special characters", () => {
    const result = hashPassword("p@ss!#$%^&*()_+-=[]{}|;:,.<>?/~`");
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
  });

  it("handles empty string", () => {
    const result = hashPassword("");
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
  });

  it("handles very long passwords", () => {
    const longPassword = "a".repeat(1000);
    const result = hashPassword(longPassword);
    const parts = result.split(":");
    expect(parts).toHaveLength(2);
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
    const tampered = `${parts[0]}:${parts[1].slice(0, 10)}`;
    expect(verifyPassword("original", tampered)).toBe(false);
  });

  it("rejects when stored hash is empty", () => {
    expect(verifyPassword("password", "")).toBe(false);
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
    const token = generateToken({ id: "user-123", email: "test@example.com" });
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
  });

  it("includes correct user id in payload", () => {
    const token = generateToken({ id: "user-abc", email: "test@example.com" });
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(payload.sub).toBe("user-abc");
  });

  it("includes correct email in payload", () => {
    const token = generateToken({ id: "user-1", email: "user@wireline.com" });
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(payload.email).toBe("user@wireline.com");
  });

  it("sets 2-hour expiry", () => {
    const token = generateToken({ id: "user-1", email: "test@example.com" });
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    const now = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThan(now + 60 * 60);
    expect(payload.exp).toBeLessThanOrEqual(now + 60 * 60 * 2 + 5);
  });

  it("includes standard JWT claims", () => {
    const token = generateToken({ id: "user-1", email: "test@example.com" });
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    expect(payload.aud).toBe("authenticated");
    expect(payload.role).toBe("authenticated");
    expect(payload.iss).toBe("wireline-internal");
  });

  it("produces different tokens for different users", () => {
    const a = generateToken({ id: "user-a", email: "a@example.com" });
    const b = generateToken({ id: "user-b", email: "b@example.com" });
    expect(a).not.toBe(b);
  });

  it("produces different tokens for same user (different iat)", async () => {
    const a = generateToken({ id: "user-1", email: "test@example.com" });
    await new Promise((r) => setTimeout(r, 1100));
    const b = generateToken({ id: "user-1", email: "test@example.com" });
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

  it("is case-insensitive", () => {
    process.env.OWNER_EMAIL = "Admin@Wireline.com";
    resetOwnerEmailCacheForTests();
    expect(isOwnerEmail("admin@wireline.com")).toBe(true);
  });

  it("trims whitespace", () => {
    process.env.OWNER_EMAIL = "  admin@wireline.com  ";
    resetOwnerEmailCacheForTests();
    expect(isOwnerEmail("admin@wireline.com")).toBe(true);
  });

  it("returns false for null/undefined/empty", () => {
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
