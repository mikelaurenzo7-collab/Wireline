import { describe, expect, it } from "vitest";
import {
  buildStitchPreviewPageUrl,
  parseStitchPreviewPageSearch,
  stitchPreviewPageUrlIsValid,
} from "./director-stitch-preview-route";

describe("director stitch preview route", () => {
  it("round-trips artifact ids through the preview page URL", () => {
    const preview = {
      conceptId: "screen-abc",
      title: "Mobile screen",
      rationale: "Wireline Design",
      kind: "stitch" as const,
      previewDataUrl: "",
      htmlArtifactId: "101",
      imageArtifactId: "202",
      deviceType: "MOBILE" as const,
    };
    const url = buildStitchPreviewPageUrl(preview);
    expect(url).toContain("/design/preview?");
    const parsed = parseStitchPreviewPageSearch(
      new URL(url, "https://trywireline.com").searchParams,
    );
    expect(parsed?.conceptId).toBe("screen-abc");
    expect(parsed?.htmlArtifactId).toBe("101");
    expect(parsed?.imageArtifactId).toBe("202");
    expect(parsed?.deviceType).toBe("MOBILE");
    expect(parsed?.title).toBe("Mobile screen");
  });

  it("rejects preview URLs without artifact ids", () => {
    expect(parseStitchPreviewPageSearch(new URLSearchParams("concept=x"))).toBeNull();
  });

  it("resolves artifact ids from persisted signed download URLs", () => {
    const url = buildStitchPreviewPageUrl({
      conceptId: "screen-1",
      title: "Hero",
      rationale: "Wireline Design",
      kind: "stitch",
      previewDataUrl: "",
      htmlDownloadUrl: "/api/director/artifacts/55/download?exp=1&sig=abc",
    });
    expect(url).toContain("html=55");
    expect(
      stitchPreviewPageUrlIsValid({
        conceptId: "screen-1",
        title: "",
        rationale: "",
        previewDataUrl: "",
      }),
    ).toBe(false);
  });
});
