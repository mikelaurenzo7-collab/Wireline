import type { MutableRefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __directorArtifactBlobCacheTestUtils,
  artifactIdFromDirectorSignedUrl,
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

describe("signed blob cache active references", () => {
  beforeEach(() => {
    __directorArtifactBlobCacheTestUtils.activeBlobReferences.clear();
    __directorArtifactBlobCacheTestUtils.signedBlobCache.clear();
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __directorArtifactBlobCacheTestUtils.activeBlobReferences.clear();
    __directorArtifactBlobCacheTestUtils.signedBlobCache.clear();
  });

  it("does not revoke an expired cached blob URL while another consumer still references it", () => {
    const blobUrl = "blob:director-artifact/shared";
    const firstConsumer: MutableRefObject<string | undefined> = { current: undefined };
    const secondConsumer: MutableRefObject<string | undefined> = { current: undefined };

    __directorArtifactBlobCacheTestUtils.signedBlobCache.set("artifact:1", {
      src: blobUrl,
      expiresAt: Date.now() - 1,
    });
    __directorArtifactBlobCacheTestUtils.setActiveBlobReference(firstConsumer, blobUrl);
    __directorArtifactBlobCacheTestUtils.setActiveBlobReference(secondConsumer, blobUrl);

    expect(__directorArtifactBlobCacheTestUtils.activeBlobReferences.get(blobUrl)).toBe(2);

    __directorArtifactBlobCacheTestUtils.pruneExpiredSignedBlobCache();

    expect(__directorArtifactBlobCacheTestUtils.signedBlobCache.has("artifact:1")).toBe(false);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    __directorArtifactBlobCacheTestUtils.setActiveBlobReference(firstConsumer, undefined);
    __directorArtifactBlobCacheTestUtils.pruneExpiredSignedBlobCache();

    expect(__directorArtifactBlobCacheTestUtils.activeBlobReferences.get(blobUrl)).toBe(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    __directorArtifactBlobCacheTestUtils.setActiveBlobReference(secondConsumer, undefined);
    __directorArtifactBlobCacheTestUtils.revokeObjectUrlIfUncached(blobUrl);

    expect(__directorArtifactBlobCacheTestUtils.activeBlobReferences.has(blobUrl)).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(blobUrl);
  });
});
