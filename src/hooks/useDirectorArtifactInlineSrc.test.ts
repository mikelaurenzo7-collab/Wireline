import { describe, expect, it } from "vitest";
import { artifactIdFromDirectorSignedUrl } from "./useDirectorArtifactInlineSrc";

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
