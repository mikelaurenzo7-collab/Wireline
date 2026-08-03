import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { generateToken, verifyToken, verifyPassword, hashPassword } from "./auth-service";

const originalEnv = { ...process.env };
const TEST_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "test@wireline.app",
  sessionVersion: 0,
};

describe("auth-service", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.INTERNAL_JWT_SECRET =
      "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("generateToken / verifyToken", () => {
    it("verifyToken returns payload for a valid versioned token", async () => {
      const token = generateToken(TEST_USER);
      const payload = await verifyToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe(TEST_USER.id);
      expect(payload!.email).toBe(TEST_USER.email);
      expect(payload!.session_version).toBe(0);
      expect(payload!.iss).toBe("wireline-internal");
      expect(payload!.aud).toBe("authenticated");
    });

    it("refuses to mint a token without a verified session generation", () => {
      expect(() => generateToken({ id: TEST_USER.id, email: TEST_USER.email })).toThrow(
        "SESSION_VERSION_REQUIRED",
      );
    });

    it("verifyToken returns null for a malformed token", async () => {
      expect(await verifyToken("not.a.jwt")).toBeNull();
      expect(await verifyToken("")).toBeNull();
      expect(await verifyToken("a.b.c.d")).toBeNull();
    });

    it("verifyToken returns null for a token missing the expected issuer", async () => {
      const token = generateToken(TEST_USER);
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      payload.iss = "evil-issuer";
      const tamperedParts = `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${parts[2]}`;
      const result = await verifyToken(tamperedParts);
      expect(result).toBeNull();
    });

    it("verifyToken returns null for a token with an expired exp claim", async () => {
      const token = generateToken(TEST_USER);
      const parts = token.split(".");
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
      payload.exp = Math.floor(Date.now() / 1000) - 3600;
      const tamperedParts = `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${parts[2]}`;
      const result = await verifyToken(tamperedParts);
      expect(result).toBeNull();
    });
  });

  describe("hashPassword / verifyPassword", () => {
    it("verifyPassword returns true for the correct password", () => {
      const hash = hashPassword("correct-horse-battery-staple");
      expect(verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
    });

    it("verifyPassword returns false for the wrong password", () => {
      const hash = hashPassword("correct-horse-battery-staple");
      expect(verifyPassword("incorrect-dog-solar-panel", hash)).toBe(false);
    });

    it("verifyPassword returns false for a malformed hash", () => {
      expect(verifyPassword("anything", "not-a-real-hash")).toBe(false);
      expect(verifyPassword("anything", "")).toBe(false);
    });
  });
});
