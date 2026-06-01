import { describe, expect, it } from "vitest";
import {
  buildSignedDownloadUrl,
  createSignedDownloadToken,
  verifySignedDownloadToken,
} from "./director-artifact-signing";

describe("director-artifacts signing", () => {
  it("creates and verifies signed download tokens", () => {
    const token = createSignedDownloadToken("42", "user-1", 300);
    expect(verifySignedDownloadToken("42", "user-1", String(token.exp), token.sig)).toBe(true);
    expect(verifySignedDownloadToken("41", "user-1", String(token.exp), token.sig)).toBe(false);
  });

  it("builds signed urls", () => {
    const url = buildSignedDownloadUrl("/api/director/artifacts", "77", "user-99");
    expect(url).toContain("/api/director/artifacts/77/download?");
    expect(url).toContain("sig=");
    expect(url).toContain("exp=");
  });
});
