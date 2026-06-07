import { describe, expect, it } from "vitest";
import {
  artifactIdFromDirectorSignedUrl,
  shouldDiscardSignedBlobCacheEntry,
} from "./useDirectorArtifactInlineSrc";

describe("artifactIdFromDirectorSignedUrl", () => {
  it("extracts artifact ids from relative signed preview URLs", () => {
    expect(
      artifactIdFromDirectorSignedUrl(
        "/api/director/artifacts/stitch%2Fhtml/download?exp=1&sig=s&inline=1",
      ),
    ).toBe("stitch/html");
  });

  it("extracts artifact ids from absolute signed preview URLs", () => {
    expect(
      artifactIdFromDirectorSignedUrl(
        "https://trywireline.com/api/director/artifacts/image-123/download?exp=1&sig=s",
      ),
    ).toBe("image-123");
  });

  it("ignores non-director artifact URLs", () => {
    expect(artifactIdFromDirectorSignedUrl("https://example.com/file.png")).toBeUndefined();
  });
});

describe("shouldDiscardSignedBlobCacheEntry", () => {
  it("keeps fresh cached blobs unless a refresh bypass is requested", () => {
    const cached = { src: "blob:fresh", expiresAt: 1_100 };

    expect(shouldDiscardSignedBlobCacheEntry(cached, false, 1_000)).toBe(false);
    expect(shouldDiscardSignedBlobCacheEntry(cached, true, 1_000)).toBe(true);
  });

  it("discards expired cached blobs and ignores empty cache entries", () => {
    expect(
      shouldDiscardSignedBlobCacheEntry({ src: "blob:expired", expiresAt: 999 }, false, 1_000),
    ).toBe(true);
    expect(shouldDiscardSignedBlobCacheEntry(undefined, true, 1_000)).toBe(false);
  });
});
