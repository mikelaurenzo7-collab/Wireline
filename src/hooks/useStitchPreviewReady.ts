import type { DirectorPreviewMeta } from "../lib/director-message-metadata";
import {
  artifactIdFromDirectorSignedUrl,
  type DirectorArtifactInlineSrc,
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

interface StitchPreviewReadyResolutionInput {
  preview: DirectorPreviewMeta;
  imageBlob: DirectorArtifactInlineSrc;
  htmlBlob: DirectorArtifactInlineSrc;
  imageArtifactId: string | undefined;
  htmlArtifactId: string | undefined;
  embeddedImage: boolean;
  hasSources: boolean;
}

export function resolveStitchPreviewReadyState({
  preview,
  imageBlob,
  htmlBlob,
  imageArtifactId,
  htmlArtifactId,
  embeddedImage,
  hasSources,
}: StitchPreviewReadyResolutionInput): Omit<
  StitchPreviewReadyState,
  "hasSources" | "imageArtifactId" | "htmlArtifactId"
> {
  const directImageSrc = embeddedImage
    ? preview.previewDataUrl
    : directRenderableUrl(preview.imageDownloadUrl) || directRenderableUrl(preview.previewDataUrl);
  const directHtmlSrc = directRenderableUrl(preview.htmlDownloadUrl);

  const imageArtifactPending =
    Boolean(imageArtifactId) &&
    !embeddedImage &&
    !imageBlob.src &&
    !imageBlob.error &&
    (imageBlob.loading || !imageBlob.attempted);
  const htmlArtifactPending =
    Boolean(htmlArtifactId) &&
    !htmlBlob.src &&
    !htmlBlob.error &&
    (htmlBlob.loading || !htmlBlob.attempted);

  const imageSrc = imageBlob.src ?? (imageArtifactPending ? undefined : directImageSrc);
  const htmlSrc = htmlBlob.src ?? (htmlArtifactPending ? undefined : directHtmlSrc);

  const hasRenderableImage = Boolean(imageSrc);
  const hasRenderableHtml = Boolean(htmlSrc);

  const isReady = hasRenderableImage || hasRenderableHtml;
  const isLoading = hasSources && !isReady && (imageArtifactPending || htmlArtifactPending);
  const imagePathFailed =
    !hasRenderableImage &&
    (!imageArtifactId || imageBlob.error || (imageBlob.attempted && !imageBlob.src)) &&
    !directImageSrc;
  const htmlPathFailed =
    !hasRenderableHtml &&
    (!htmlArtifactId || htmlBlob.error || (htmlBlob.attempted && !htmlBlob.src)) &&
    !directHtmlSrc;
  const hasImagePath = Boolean(imageArtifactId || directImageSrc);
  const hasHtmlPath = Boolean(htmlArtifactId || directHtmlSrc);
  const failed =
    hasSources &&
    !isLoading &&
    !isReady &&
    (!hasImagePath || imagePathFailed) &&
    (!hasHtmlPath || htmlPathFailed);

  return {
    isLoading,
    isReady,
    failed,
    imageSrc,
    htmlSrc,
  };
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

  const { isLoading, isReady, failed, imageSrc, htmlSrc } = resolveStitchPreviewReadyState({
    preview,
    imageBlob,
    htmlBlob,
    imageArtifactId,
    htmlArtifactId,
    embeddedImage,
    hasSources,
  });

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
