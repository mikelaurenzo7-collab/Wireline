import { describe, expect, it } from "vitest";
import {
  artifactIdFromDirectorSignedUrl,
  shouldDeferSignedBlobCacheEntryRevocation,
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

describe("shouldDeferSignedBlobCacheEntryRevocation", () => {
  it("defers revocation when refresh bypass discards the active blob URL", () => {
    const activeSrc = "blob:active-preview";

    expect(shouldDeferSignedBlobCacheEntryRevocation(activeSrc, activeSrc)).toBe(true);
  });

  it("allows immediate revocation when discarded cache entry is not active", () => {
    expect(
      shouldDeferSignedBlobCacheEntryRevocation("blob:cached-preview", "blob:active-preview"),
    ).toBe(false);
  });
});
