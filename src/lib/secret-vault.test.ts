import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  looksEncrypted,
  lastFour,
  safeEqual,
  isVaultConfigured,
} from "./secret-vault";
import { randomBytes } from "node:crypto";

describe("secret-vault", () => {
  const prevKey = process.env.WIRELINE_DATA_KEY;
  beforeAll(() => {
    process.env.WIRELINE_DATA_KEY = randomBytes(32).toString("base64");
  });
  afterAll(() => {
    if (prevKey === undefined) delete process.env.WIRELINE_DATA_KEY;
    else process.env.WIRELINE_DATA_KEY = prevKey;
  });

  it("round-trips utf-8 plaintext", () => {
    const env = encryptSecret("super-secret-webhook-key-🦄");
    expect(looksEncrypted(env)).toBe(true);
    expect(decryptSecret(env)).toBe("super-secret-webhook-key-🦄");
  });

  it("produces a different envelope every encryption (fresh IV)", () => {
    const a = encryptSecret("same-input");
    const b = encryptSecret("same-input");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-input");
    expect(decryptSecret(b)).toBe("same-input");
  });

  it("rejects tampered ciphertext (GCM auth)", () => {
    const env = encryptSecret("don't tamper with me");
    const parts = env.split(".");
    // Flip a byte in the ciphertext.
    const ct = Buffer.from(parts[3], "base64");
    ct[0] = ct[0] ^ 0xff;
    parts[3] = ct.toString("base64");
    const tampered = parts.join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("rejects malformed envelopes", () => {
    expect(() => decryptSecret("not-an-envelope")).toThrow();
    expect(() => decryptSecret("v9.aa.bb.cc")).toThrow(); // wrong version
    expect(looksEncrypted("plain")).toBe(false);
    expect(looksEncrypted(123 as any)).toBe(false);
  });

  it("hex-encoded key is accepted", () => {
    const saved = process.env.WIRELINE_DATA_KEY;
    process.env.WIRELINE_DATA_KEY = randomBytes(32).toString("hex");
    // Reset module key cache by importing fresh — same module, but
    // getDataKey detects change via env var fingerprint.
    const env = encryptSecret("hex-key-works");
    expect(decryptSecret(env)).toBe("hex-key-works");
    process.env.WIRELINE_DATA_KEY = saved;
  });

  it("throws when the data key is missing", () => {
    const saved = process.env.WIRELINE_DATA_KEY;
    delete process.env.WIRELINE_DATA_KEY;
    expect(isVaultConfigured()).toBe(false);
    expect(() => encryptSecret("nope")).toThrow(/WIRELINE_DATA_KEY/);
    process.env.WIRELINE_DATA_KEY = saved;
    expect(isVaultConfigured()).toBe(true);
  });

  it("throws on wrong-length key", () => {
    const saved = process.env.WIRELINE_DATA_KEY;
    process.env.WIRELINE_DATA_KEY = Buffer.from("too short").toString("base64");
    expect(() => encryptSecret("nope")).toThrow(/32 bytes/);
    process.env.WIRELINE_DATA_KEY = saved;
  });

  it("lastFour returns the trailing 4 chars", () => {
    expect(lastFour("abcdef")).toBe("cdef");
    expect(lastFour("ab")).toBe("ab");
    expect(lastFour("")).toBe("");
  });

  it("safeEqual is length-aware", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
