import type { DirectorPreviewMeta } from "./director-message-metadata";
import { artifactIdFromDirectorSignedUrl } from "../hooks/useDirectorArtifactInlineSrc";

const PREVIEW_PATH = "/design/preview";

export function buildStitchPreviewPageUrl(preview: DirectorPreviewMeta): string {
  const htmlArtifactId =
    preview.htmlArtifactId ?? artifactIdFromDirectorSignedUrl(preview.htmlDownloadUrl);
  const imageArtifactId =
    preview.imageArtifactId ?? artifactIdFromDirectorSignedUrl(preview.imageDownloadUrl);

  const params = new URLSearchParams();
  params.set("concept", preview.conceptId);
  if (htmlArtifactId) params.set("html", htmlArtifactId);
  if (imageArtifactId) params.set("image", imageArtifactId);
  if (preview.deviceType) params.set("device", preview.deviceType);
  if (preview.title?.trim()) params.set("title", preview.title.trim());
  return `${PREVIEW_PATH}?${params.toString()}`;
}

export function stitchPreviewPageUrlIsValid(preview: DirectorPreviewMeta): boolean {
  return (
    parseStitchPreviewPageSearch(
      new URLSearchParams(buildStitchPreviewPageUrl(preview).split("?")[1] ?? ""),
    ) !== null
  );
}

/** Rehydrate preview meta from a dedicated preview-page URL (session-gated artifact fetch). */
export function parseStitchPreviewPageSearch(params: URLSearchParams): DirectorPreviewMeta | null {
  const conceptId = params.get("concept")?.trim();
  if (!conceptId) return null;

  const htmlArtifactId = params.get("html")?.trim() || undefined;
  const imageArtifactId = params.get("image")?.trim() || undefined;
  if (!htmlArtifactId && !imageArtifactId) return null;

  const deviceRaw = params.get("device")?.trim().toUpperCase();
  const deviceType =
    deviceRaw === "MOBILE" ||
    deviceRaw === "DESKTOP" ||
    deviceRaw === "TABLET" ||
    deviceRaw === "AGNOSTIC"
      ? deviceRaw
      : undefined;

  const title = params.get("title")?.trim() || "Wireline Design";

  return {
    conceptId,
    title,
    rationale: "Wireline Design",
    kind: "stitch",
    previewDataUrl: "",
    htmlArtifactId,
    imageArtifactId,
    deviceType,
  };
}
