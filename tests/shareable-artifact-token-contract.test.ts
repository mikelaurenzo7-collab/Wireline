import { describe, expect, it } from "vitest";

import {
  hashToken,
  isValidSlug,
  mintSlug,
  mintToken,
  verifyToken,
} from "../src/lib/shareable-artifact/tokens";

describe("shareable-artifact tokens", () => {
  it("mints slugs that pass the regex the migration enforces", () => {
    for (let index = 0; index < 20; index++) {
      const slug = mintSlug();
      expect(slug).toMatch(/^[A-Za-z0-9]{16}$/);
      expect(isValidSlug(slug)).toBe(true);
    }
  });

  it("mints tokens with high entropy", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index++) seen.add(mintToken());
    expect(seen.size).toBe(200);
  });

  it("verifies matching slug+token pairs and rejects mismatches", () => {
    const slug = mintSlug();
    const token = mintToken();
    const hash = hashToken(slug, token);
    expect(verifyToken(slug, token, hash)).toBe(true);
    expect(verifyToken(slug, `${token}-suffix`, hash)).toBe(false);
    expect(verifyToken(mintSlug(), token, hash)).toBe(false);
  });

  it("rejects malformed slug shapes without touching the hash", () => {
    const slug = mintSlug();
    const token = mintToken();
    const hash = hashToken(slug, token);
    expect(verifyToken("../evil", token, hash)).toBe(false);
    expect(verifyToken("short", token, hash)).toBe(false);
    expect(verifyToken("", token, hash)).toBe(false);
    expect(verifyToken(slug, "", hash)).toBe(false);
  });

  it("uses a versioned hashing shape so we can rotate later without silent breakage", () => {
    const slug = "aBcDeFgHiJkLmNoP";
    const token = "static-token";
    expect(hashToken(slug, token)).toMatch(/^[0-9a-f]{64}$/);
    // Same inputs must always produce the same output.
    expect(hashToken(slug, token)).toBe(hashToken(slug, token));
  });
});
