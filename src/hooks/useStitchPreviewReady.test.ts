import { describe, expect, it } from "vitest";
import { previewHasAssetSources, resolveStitchPreviewReadyState } from "./useStitchPreviewReady";

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

describe("resolveStitchPreviewReadyState", () => {
  it("treats an artifact-id-only preview as loading before blob resolution is attempted", () => {
    const state = resolveStitchPreviewReadyState({
      preview: {
        conceptId: "1",
        title: "Screen",
        rationale: "Wireline Design",
        previewDataUrl: "",
        htmlArtifactId: "html-1",
      },
      imageBlob: { src: undefined, loading: false, error: false, attempted: false },
      htmlBlob: { src: undefined, loading: false, error: false, attempted: false },
      imageArtifactId: undefined,
      htmlArtifactId: "html-1",
      embeddedImage: false,
      hasSources: true,
    });

    expect(state.isLoading).toBe(true);
    expect(state.failed).toBe(false);
    expect(state.isReady).toBe(false);
  });

  it("does not fail while one artifact path is still pending", () => {
    const state = resolveStitchPreviewReadyState({
      preview: {
        conceptId: "1",
        title: "Screen",
        rationale: "Wireline Design",
        previewDataUrl: "",
        imageArtifactId: "image-1",
        htmlArtifactId: "html-1",
      },
      imageBlob: { src: undefined, loading: false, error: true, attempted: true },
      htmlBlob: { src: undefined, loading: false, error: false, attempted: false },
      imageArtifactId: "image-1",
      htmlArtifactId: "html-1",
      embeddedImage: false,
      hasSources: true,
    });

    expect(state.isLoading).toBe(true);
    expect(state.failed).toBe(false);
  });

  it("only fails after all artifact paths have failed", () => {
    const state = resolveStitchPreviewReadyState({
      preview: {
        conceptId: "1",
        title: "Screen",
        rationale: "Wireline Design",
        previewDataUrl: "",
        imageArtifactId: "image-1",
        htmlArtifactId: "html-1",
      },
      imageBlob: { src: undefined, loading: false, error: true, attempted: true },
      htmlBlob: { src: undefined, loading: false, error: true, attempted: true },
      imageArtifactId: "image-1",
      htmlArtifactId: "html-1",
      embeddedImage: false,
      hasSources: true,
    });

    expect(state.isLoading).toBe(false);
    expect(state.failed).toBe(true);
  });

  it("falls back to a direct URL instead of failing after artifact resolution errors", () => {
    const state = resolveStitchPreviewReadyState({
      preview: {
        conceptId: "1",
        title: "Screen",
        rationale: "Wireline Design",
        previewDataUrl: "",
        htmlArtifactId: "html-1",
        htmlDownloadUrl: "https://example.com/stitch.html",
      },
      imageBlob: { src: undefined, loading: false, error: false, attempted: false },
      htmlBlob: { src: undefined, loading: false, error: true, attempted: true },
      imageArtifactId: undefined,
      htmlArtifactId: "html-1",
      embeddedImage: false,
      hasSources: true,
    });

    expect(state.htmlSrc).toBe("https://example.com/stitch.html");
    expect(state.isReady).toBe(true);
    expect(state.failed).toBe(false);
  });
});
