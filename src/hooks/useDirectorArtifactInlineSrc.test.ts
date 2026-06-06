import { describe, expect, it } from "vitest";
import { artifactIdFromDirectorSignedUrl } from "./useDirectorArtifactInlineSrc";

describe("artifactIdFromDirectorSignedUrl", () => {
  it("parses relative signed download URLs", () => {
    expect(
      artifactIdFromDirectorSignedUrl("/api/director/artifacts/42/download?exp=1&sig=abc&inline=1"),
    ).toBe("42");
  });

  it("parses absolute signed download URLs", () => {
    expect(
      artifactIdFromDirectorSignedUrl(
        "https://trywireline.com/api/director/artifacts/screen-9/download?exp=1&sig=abc",
      ),
    ).toBe("screen-9");
  });

  it("returns undefined for unrelated URLs", () => {
    expect(artifactIdFromDirectorSignedUrl("https://example.com/foo")).toBeUndefined();
  });
});
