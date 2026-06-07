import { describe, expect, it } from "vitest";
import { previewHasAssetSources } from "./useStitchPreviewReady";

describe("previewHasAssetSources", () => {
  it("returns false when preview has no artifact or download URLs", () => {
    expect(
      previewHasAssetSources({
        conceptId: "1",
        title: "Screen",
        rationale: "Wireline Design",
        previewDataUrl: "",
      }),
    ).toBe(false);
  });

  it("returns true when html artifact id is present", () => {
    expect(
      previewHasAssetSources({
        conceptId: "1",
        title: "Screen",
        rationale: "Wireline Design",
        previewDataUrl: "",
        htmlArtifactId: "42",
      }),
    ).toBe(true);
  });

  it("returns true for embedded data URL screenshots", () => {
    expect(
      previewHasAssetSources({
        conceptId: "1",
        title: "Screen",
        rationale: "Wireline Design",
        previewDataUrl: "data:image/png;base64,abc",
      }),
    ).toBe(true);
  });

  it("returns true for persisted signed download URLs", () => {
    expect(
      previewHasAssetSources({
        conceptId: "1",
        title: "Screen",
        rationale: "Wireline Design",
        previewDataUrl: "",
        htmlDownloadUrl: "/api/director/artifacts/html-1/download?exp=1&sig=s&inline=1",
      }),
    ).toBe(true);
  });
});
