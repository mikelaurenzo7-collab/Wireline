import type { DirectorPreviewMeta } from "../lib/director-message-metadata";
import {
  artifactIdFromDirectorSignedUrl,
  useDirectorArtifactBlobSrc,
} from "./useDirectorArtifactInlineSrc";

function resolveImageArtifactId(preview: DirectorPreviewMeta): string | undefined {
  return preview.imageArtifactId ?? artifactIdFromDirectorSignedUrl(preview.imageDownloadUrl);
}

function resolveHtmlArtifactId(preview: DirectorPreviewMeta): string | undefined {
  return preview.htmlArtifactId ?? artifactIdFromDirectorSignedUrl(preview.htmlDownloadUrl);
}

function hasEmbeddedImageData(preview: DirectorPreviewMeta): boolean {
  return Boolean(preview.previewDataUrl?.startsWith("data:"));
}

function directRenderableUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  if (url.startsWith("/api/director/artifacts/")) return url;
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const parsed = new URL(url, origin);
    if (parsed.origin === origin && parsed.pathname.includes("/api/director/artifacts/")) {
      return `${parsed.pathname}${parsed.search}`;
    }
    if (parsed.protocol === "https:") return url;
  } catch {
    return undefined;
  }
  return undefined;
}

export function previewHasAssetSources(preview: DirectorPreviewMeta): boolean {
  return Boolean(
    preview.htmlArtifactId ||
    preview.imageArtifactId ||
    preview.htmlDownloadUrl ||
    preview.imageDownloadUrl ||
    preview.previewDataUrl?.startsWith("data:"),
  );
}

export interface StitchPreviewReadyOptions {
  refreshKey?: string | number;
}

export interface StitchPreviewReadyState {
  hasSources: boolean;
  isLoading: boolean;
  isReady: boolean;
  failed: boolean;
  imageSrc: string | undefined;
  htmlSrc: string | undefined;
  imageArtifactId: string | undefined;
  htmlArtifactId: string | undefined;
}

/** Waits for signed artifact blobs before the in-chat device frame should appear. */
export function useStitchPreviewReady(
  preview: DirectorPreviewMeta,
  options?: StitchPreviewReadyOptions,
): StitchPreviewReadyState {
  const imageArtifactId = resolveImageArtifactId(preview);
  const htmlArtifactId = resolveHtmlArtifactId(preview);
  const embeddedImage = hasEmbeddedImageData(preview);
  const hasSources = previewHasAssetSources(preview);

  const imageBlob = useDirectorArtifactBlobSrc(imageArtifactId, {
    inline: true,
    enabled: hasSources && !embeddedImage && Boolean(imageArtifactId),
    refreshKey: options?.refreshKey,
  });
  const htmlBlob = useDirectorArtifactBlobSrc(htmlArtifactId, {
    inline: true,
    enabled: hasSources && Boolean(htmlArtifactId),
    refreshKey: options?.refreshKey,
  });

  const directImageSrc = embeddedImage
    ? preview.previewDataUrl
    : !imageArtifactId || imageBlob.error
      ? directRenderableUrl(preview.imageDownloadUrl) || directRenderableUrl(preview.previewDataUrl)
      : undefined;
  const directHtmlSrc =
    !htmlArtifactId || htmlBlob.error ? directRenderableUrl(preview.htmlDownloadUrl) : undefined;

  const imageSrc = imageBlob.src ?? directImageSrc;
  const htmlSrc = htmlBlob.src ?? directHtmlSrc;

  const hasRenderableImage = Boolean(imageSrc);
  const hasRenderableHtml = Boolean(htmlSrc);

  const isReady = hasRenderableImage || hasRenderableHtml;
  const imagePending =
    Boolean(imageArtifactId) && !embeddedImage && imageBlob.loading && !hasRenderableImage;
  const htmlPending = Boolean(htmlArtifactId) && htmlBlob.loading && !hasRenderableHtml;
  const isLoading = hasSources && !isReady && (imagePending || htmlPending);
  const failed = hasSources && !isLoading && !isReady;

  return {
    hasSources,
    isLoading,
    isReady,
    failed,
    imageSrc,
    htmlSrc,
    imageArtifactId,
    htmlArtifactId,
  };
}
