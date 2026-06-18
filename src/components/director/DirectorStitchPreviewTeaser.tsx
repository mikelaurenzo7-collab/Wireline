import React, { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  LayoutTemplate,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { DirectorPreviewMeta } from "../../lib/director-message-metadata";
import {
  buildStitchPreviewPageUrl,
  stitchPreviewPageUrlIsValid,
} from "../../lib/design-preview-route";
import { useStitchPreviewReady } from "../../hooks/useStitchPreviewReady";
import { WL_DIRECTOR_CLASSES, WIRELINE_STITCH_UI } from "../../lib/wireline-director-design";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";

export interface DirectorStitchPreviewTeaserProps {
  preview: DirectorPreviewMeta;
  /** When true the card is rendered inside a multi-preview grid and suppresses the standalone
   *  open-preview button (the surrounding grid component provides one shared action row). */
  inGrid?: boolean;
}

function deviceLabel(device?: DirectorPreviewMeta["deviceType"]): string {
  switch (device) {
    case "MOBILE":
      return "Mobile";
    case "DESKTOP":
      return "Desktop";
    case "TABLET":
      return "Tablet";
    default:
      return "Responsive";
  }
}

function DeviceFrame({
  preview,
  ready,
  imageBroken,
  onImageError,
  onRetryPreview,
}: {
  preview: DirectorPreviewMeta;
  ready: ReturnType<typeof useStitchPreviewReady>;
  imageBroken: boolean;
  onImageError: () => void;
  onRetryPreview: () => void;
}) {
  const mobile = preview.deviceType === "MOBILE" || preview.deviceType === "TABLET";
  const showImage = Boolean(ready.imageSrc) && !imageBroken;
  const showHtml = !showImage && Boolean(ready.htmlSrc);
  const showCanvas = showImage || showHtml;
  const effectiveFailed = ready.failed || (imageBroken && !ready.htmlSrc);

  return (
    <div className="mt-3">
      <div
        className={cn(
          "wl-stitch-device mx-auto overflow-hidden",
          mobile ? "wl-stitch-device--mobile" : "wl-stitch-device--desktop",
        )}
      >
        <div className="wl-stitch-device-chrome">
          <span className="wl-stitch-device-dot" aria-hidden="true" />
          <span className="wl-stitch-device-dot wl-stitch-device-dot--mid" aria-hidden="true" />
          <span className="wl-stitch-device-dot wl-stitch-device-dot--dim" aria-hidden="true" />
          <span className="wl-stitch-device-url" aria-hidden="true">
            {WIRELINE_STITCH_UI.deviceChromeLabel}
          </span>
        </div>
        <div className="wl-stitch-device-screen">
          {showImage && (
            <img
              src={ready.imageSrc}
              alt={preview.title}
              loading="lazy"
              decoding="async"
              onError={onImageError}
              className="block w-full max-h-[420px] object-contain object-top bg-card dark:bg-velvet"
            />
          )}
          {showHtml && (
            <iframe
              title={`${WIRELINE_STITCH_UI.previewTabLabel} — ${preview.title}`}
              src={ready.htmlSrc}
              className="wl-stitch-live-iframe"
              sandbox="allow-scripts allow-same-origin"
              referrerPolicy="no-referrer"
              loading="lazy"
              allow="fullscreen"
            />
          )}
          {!showCanvas && !effectiveFailed && (
            <div className="min-h-[180px] flex flex-col items-center justify-center gap-2 p-6 text-center">
              <Loader2 className="w-5 h-5 text-brand/50 animate-spin" />
              <p className="wl-micro-meta--muted">Loading the rendered preview…</p>
            </div>
          )}
          {!showCanvas && effectiveFailed && (
            <div className="min-h-[180px] flex flex-col items-center justify-center gap-2 p-6 text-center">
              <AlertCircle className="w-5 h-5 text-muted/60" />
              <p className="wl-micro-meta--muted">{WIRELINE_STITCH_UI.fallbackCopy}</p>
              <ShadButton
                type="button"
                variant="ghost"
                size="sm"
                disableAnimations
                onClick={onRetryPreview}
                className="mt-1 h-auto px-2.5 py-1 wl-label text-brand hover:text-brand-deep"
              >
                <RefreshCw className="w-3 h-3" />
                Retry preview
              </ShadButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * In-thread Stitch render — shows the actual screenshot (or live HTML) inline so the
 * design renders fully in chat, with a link out to the full preview studio (tabs + export).
 *
 * When rendered inside a multi-preview grid the standalone action row is suppressed.
 */
export default function DirectorStitchPreviewTeaser({
  preview,
  inGrid = false,
}: DirectorStitchPreviewTeaserProps) {
  const [retryNonce, setRetryNonce] = useState(0);
  const ready = useStitchPreviewReady(preview, { refreshKey: retryNonce });
  const [imageBroken, setImageBroken] = useState(false);
  const hasPage = stitchPreviewPageUrlIsValid(preview);
  const previewUrl = hasPage ? buildStitchPreviewPageUrl(preview) : null;
  const reduceMotion = useReducedMotion();

  const handleImageError = useCallback(() => setImageBroken(true), []);
  const handleRetry = useCallback(() => {
    setImageBroken(false);
    setRetryNonce((n) => n + 1);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={WIRELINE_STITCH_UI.previewTeaserTitle}
      className={cn(
        "w-full rounded-md border border-brand/20 bg-gradient-to-br from-brand/[0.05] to-card/95 dark:from-brand/[0.08] dark:to-velvet/50 p-3.5 shadow-sm",
        preview.deviceType === "DESKTOP" || preview.deviceType === "AGNOSTIC"
          ? "max-w-4xl"
          : "max-w-md",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-md bg-brand/12 border border-brand/20 text-brand">
          <LayoutTemplate className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 wl-label font-bold text-brand">
              <Sparkles className="w-3 h-3" />
              {WIRELINE_STITCH_UI.previewTeaserTitle}
            </span>
            <span className={cn(WL_DIRECTOR_CLASSES.metaCaption, "text-muted/70")}>
              {deviceLabel(preview.deviceType)}
            </span>
          </div>
          <p className="text-[12px] text-foreground font-medium leading-snug">{preview.title}</p>
          <p className="wl-micro-meta--muted leading-relaxed">
            {WIRELINE_STITCH_UI.previewTeaserBody}
          </p>
        </div>
      </div>

      <DeviceFrame
        preview={preview}
        ready={ready}
        imageBroken={imageBroken}
        onImageError={handleImageError}
        onRetryPreview={handleRetry}
      />

      {previewUrl && !inGrid && (
        <motion.div
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="mt-3 flex flex-wrap gap-2"
        >
          <ShadButton
            asChild
            className="h-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-md wl-micro-meta font-semibold bg-brand text-white hover:bg-brand-deep"
          >
            <Link to={previewUrl}>
              {WIRELINE_STITCH_UI.previewTeaserAction}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </ShadButton>
        </motion.div>
      )}
      {previewUrl && inGrid && (
        <motion.div
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="mt-2 flex flex-wrap gap-2"
        >
          <ShadButton
            asChild
            variant="ghost"
            size="sm"
            disableAnimations
            className="h-auto px-2 py-1 wl-label text-brand hover:text-brand-deep"
          >
            <Link to={previewUrl}>
              {WIRELINE_STITCH_UI.previewTeaserAction}
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </ShadButton>
        </motion.div>
      )}
    </div>
  );
}

export interface DirectorStitchPreviewVariantGridProps {
  previews: DirectorPreviewMeta[];
}

/**
 * Renders multiple Stitch previews (variants, multi-screen) as a side-by-side labeled grid
 * with a shared open-preview action anchored to the first preview.
 */
export function DirectorStitchPreviewVariantGrid({
  previews,
}: DirectorStitchPreviewVariantGridProps) {
  const reduceMotion = useReducedMotion();
  if (previews.length === 0) return null;
  if (previews.length === 1) {
    return <DirectorStitchPreviewTeaser preview={previews[0]} />;
  }

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="w-full max-w-3xl"
    >
      <div
        className={cn(
          "grid gap-3",
          previews.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        )}
      >
        {previews.map((p) => {
          const url = stitchPreviewPageUrlIsValid(p) ? buildStitchPreviewPageUrl(p) : null;
          return (
            <div key={p.conceptId} className="flex flex-col gap-2">
              <DirectorStitchPreviewTeaser preview={p} inGrid />
              {url && (
                <ShadButton
                  asChild
                  variant="ghost"
                  size="sm"
                  disableAnimations
                  className="h-auto px-2 py-1 wl-label text-brand hover:text-brand-deep"
                >
                  <Link to={url}>
                    {WIRELINE_STITCH_UI.previewTeaserAction}
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                </ShadButton>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
