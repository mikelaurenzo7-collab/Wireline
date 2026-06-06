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

export function previewHasAssetSources(preview: DirectorPreviewMeta): boolean {
  return Boolean(
    preview.htmlArtifactId ||
      preview.imageArtifactId ||
      preview.htmlDownloadUrl ||
      preview.imageDownloadUrl ||
      preview.previewDataUrl?.startsWith("data:"),
  );
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
export function useStitchPreviewReady(preview: DirectorPreviewMeta): StitchPreviewReadyState {
  const imageArtifactId = resolveImageArtifactId(preview);
  const htmlArtifactId = resolveHtmlArtifactId(preview);
  const embeddedImage = hasEmbeddedImageData(preview);
  const hasSources = previewHasAssetSources(preview);

  const imageBlob = useDirectorArtifactBlobSrc(imageArtifactId, {
    inline: true,
    enabled: hasSources && !embeddedImage && Boolean(imageArtifactId),
  });
  const htmlBlob = useDirectorArtifactBlobSrc(htmlArtifactId, {
    inline: true,
    enabled: hasSources && Boolean(htmlArtifactId),
  });

  const imageSrc = embeddedImage
    ? preview.previewDataUrl
    : (imageBlob.src ?? (imageBlob.error ? preview.imageDownloadUrl : undefined));

  const htmlSrc = htmlBlob.src ?? (htmlBlob.error ? preview.htmlDownloadUrl : undefined);

  const hasRenderableImage = Boolean(imageSrc);
  const hasRenderableHtml = Boolean(htmlSrc);

  const imagePending =
    Boolean(imageArtifactId) && !embeddedImage && imageBlob.loading && !hasRenderableImage;
  const htmlPending = Boolean(htmlArtifactId) && htmlBlob.loading && !hasRenderableHtml;
  const isLoading = hasSources && (imagePending || htmlPending);
  const isReady = hasRenderableImage || hasRenderableHtml;
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
