import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  getDataKey,
  isVaultConfigured,
  lastFour,
  looksEncrypted,
  safeEqual,
} from "./secret-vault";

// secret-vault is the application-layer envelope encryption that keeps
// webhook signing secrets / intake keys from leaking in a partial DB
// compromise. It MUST fail-closed when the key is missing and MUST reject
// tampered ciphertext (GCM auth-tag). These invariants are security-load
// bearing, so they are pinned here.

const VALID_KEY_B64 = Buffer.alloc(32, 7).toString("base64");

describe("secret-vault", () => {
  const ORIG = process.env.WIRELINE_DATA_KEY;

  beforeEach(() => {
    process.env.WIRELINE_DATA_KEY = VALID_KEY_B64;
  });

  afterEach(() => {
    if (ORIG === undefined) delete process.env.WIRELINE_DATA_KEY;
    else process.env.WIRELINE_DATA_KEY = ORIG;
  });

  describe("getDataKey", () => {
    it("accepts a 32-byte base64 key", () => {
      expect(getDataKey()).toHaveLength(32);
    });

    it("accepts a 64-char hex key", () => {
      process.env.WIRELINE_DATA_KEY = "ab".repeat(32);
      expect(getDataKey()).toHaveLength(32);
    });

    it("throws when the key is unset (fail-closed)", () => {
      delete process.env.WIRELINE_DATA_KEY;
      expect(() => getDataKey()).toThrow(/WIRELINE_DATA_KEY is not set/);
    });

    it("throws when the key decodes to the wrong length", () => {
      process.env.WIRELINE_DATA_KEY = Buffer.alloc(16, 1).toString("base64");
      expect(() => getDataKey()).toThrow(/exactly 32 bytes/);
    });
  });

  describe("isVaultConfigured", () => {
    it("is true with a valid key and false without throwing when unset", () => {
      expect(isVaultConfigured()).toBe(true);
      delete process.env.WIRELINE_DATA_KEY;
      expect(isVaultConfigured()).toBe(false);
    });
  });

  describe("encrypt / decrypt round-trip", () => {
    it("recovers the original plaintext", () => {
      const secret = "whsec_super_secret_value_12345";
      const envelope = encryptSecret(secret);
      expect(decryptSecret(envelope)).toBe(secret);
    });

    it("produces a versioned 4-part envelope", () => {
      const envelope = encryptSecret("x");
      const parts = envelope.split(".");
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe("v1");
    });

    it("uses a fresh IV per call (ciphertext is non-deterministic)", () => {
      expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
    });

    it("handles empty strings and unicode", () => {
      for (const s of ["", "🔐 únïcödé secret"]) {
        expect(decryptSecret(encryptSecret(s))).toBe(s);
      }
    });
  });

  describe("decryptSecret tamper resistance", () => {
    it("rejects a flipped ciphertext byte (GCM auth-tag mismatch)", () => {
      const envelope = encryptSecret("authentic");
      const parts = envelope.split(".");
      const ct = Buffer.from(parts[3], "base64");
      ct[0] ^= 0xff;
      parts[3] = ct.toString("base64");
      expect(() => decryptSecret(parts.join("."))).toThrow();
    });

    it("rejects a malformed envelope (wrong part count)", () => {
      expect(() => decryptSecret("v1.only.three")).toThrow(/malformed envelope/);
    });

    it("rejects an unsupported version prefix", () => {
      const parts = encryptSecret("x").split(".");
      parts[0] = "v2";
      expect(() => decryptSecret(parts.join("."))).toThrow(/unsupported version/);
    });

    it("fails to decrypt with a different key", () => {
      const envelope = encryptSecret("secret");
      process.env.WIRELINE_DATA_KEY = Buffer.alloc(32, 9).toString("base64");
      expect(() => decryptSecret(envelope)).toThrow();
    });
  });

  describe("looksEncrypted", () => {
    it("recognizes a real envelope", () => {
      expect(looksEncrypted(encryptSecret("x"))).toBe(true);
    });

    it("rejects plaintext, wrong-shape, and non-strings", () => {
      expect(looksEncrypted("plain-text-secret")).toBe(false);
      expect(looksEncrypted("v1.a.b")).toBe(false);
      expect(looksEncrypted("v1.a..d")).toBe(false);
      expect(looksEncrypted(null)).toBe(false);
      expect(looksEncrypted(42)).toBe(false);
    });
  });

  describe("safeEqual", () => {
    it("is true for identical strings, false otherwise", () => {
      expect(safeEqual("token-abc", "token-abc")).toBe(true);
      expect(safeEqual("token-abc", "token-abd")).toBe(false);
    });

    it("returns false for different lengths without throwing", () => {
      expect(safeEqual("short", "much-longer-value")).toBe(false);
    });
  });

  describe("lastFour", () => {
    it("returns the last 4 chars and handles short/empty input", () => {
      expect(lastFour("sk_live_abcd1234")).toBe("1234");
      expect(lastFour("abc")).toBe("abc");
      expect(lastFour("")).toBe("");
    });
  });
});
