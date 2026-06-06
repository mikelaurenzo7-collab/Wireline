import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, LayoutTemplate, Loader2, Sparkles } from "lucide-react";
import type { DirectorPreviewMeta } from "../../lib/director-message-metadata";
import {
  buildStitchPreviewPageUrl,
  stitchPreviewPageUrlIsValid,
} from "../../lib/director-stitch-preview-route";
import { useStitchPreviewReady } from "../../hooks/useStitchPreviewReady";
import { WL_DIRECTOR_CLASSES, WIRELINE_STITCH_UI } from "../../lib/wireline-director-design";
import { cn } from "../../lib/utils";
import { ShadButton } from "../ui/shadcn/ShadButton";

export interface DirectorStitchPreviewTeaserProps {
  preview: DirectorPreviewMeta;
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

/**
 * In-thread Stitch render — shows the actual screenshot (or live HTML) inline so the
 * design renders fully in chat, with a link out to the full preview studio (tabs + export).
 */
export default function DirectorStitchPreviewTeaser({ preview }: DirectorStitchPreviewTeaserProps) {
  const ready = useStitchPreviewReady(preview);
  const [imageBroken, setImageBroken] = useState(false);
  const hasPage = stitchPreviewPageUrlIsValid(preview);
  const previewUrl = hasPage ? buildStitchPreviewPageUrl(preview) : null;

  const mobile = preview.deviceType === "MOBILE" || preview.deviceType === "TABLET";
  const showImage = Boolean(ready.imageSrc) && !imageBroken;
  const showHtml = !showImage && Boolean(ready.htmlSrc);
  const showCanvas = showImage || showHtml;

  return (
    <div className="w-full max-w-md rounded-md border border-brand/20 bg-gradient-to-br from-brand/[0.05] to-paper/95 dark:from-brand/[0.08] dark:to-velvet/50 p-3.5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="shrink-0 flex h-9 w-9 items-center justify-center rounded-md bg-brand/12 border border-brand/20 text-brand">
          <LayoutTemplate className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.14em] font-bold text-brand">
              <Sparkles className="w-3 h-3" />
              {WIRELINE_STITCH_UI.previewTeaserTitle}
            </span>
            <span className={cn(WL_DIRECTOR_CLASSES.metaCaption, "text-muted/70")}>
              {deviceLabel(preview.deviceType)}
            </span>
          </div>
          <p className="text-[12px] text-ink font-medium leading-snug">{preview.title}</p>
          <p className="text-[11px] text-muted leading-relaxed">
            {WIRELINE_STITCH_UI.previewTeaserBody}
          </p>
        </div>
      </div>

      {/* Inline render — the design itself, framed like a device, capped for the chat thread. */}
      <div className="mt-3">
        <div
          className={cn(
            "wl-stitch-device mx-auto overflow-hidden",
            mobile ? "wl-stitch-device--mobile" : "wl-stitch-device--desktop",
          )}
        >
          <div className="wl-stitch-device-chrome">
            <span className="wl-stitch-device-dot" />
            <span className="wl-stitch-device-dot wl-stitch-device-dot--mid" />
            <span className="wl-stitch-device-dot wl-stitch-device-dot--dim" />
            <span className="wl-stitch-device-url">{WIRELINE_STITCH_UI.deviceChromeLabel}</span>
          </div>
          <div className="wl-stitch-device-screen">
            {showImage && (
              <img
                src={ready.imageSrc}
                alt={preview.title}
                loading="lazy"
                onError={() => setImageBroken(true)}
                className="block w-full max-h-[420px] object-contain object-top bg-paper dark:bg-velvet"
              />
            )}
            {showHtml && (
              <iframe
                title={`${WIRELINE_STITCH_UI.previewTabLabel} — ${preview.title}`}
                src={ready.htmlSrc}
                className="wl-stitch-live-iframe"
                sandbox="allow-scripts allow-same-origin"
                loading="lazy"
              />
            )}
            {!showCanvas && (
              <div className="min-h-[180px] flex flex-col items-center justify-center gap-2 p-6 text-center">
                <Loader2 className="w-5 h-5 text-brand/50 animate-spin" />
                <p className="text-[11px] text-muted">
                  {ready.failed ? WIRELINE_STITCH_UI.fallbackCopy : "Loading the rendered preview…"}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {previewUrl && (
        <div className="mt-3 flex flex-wrap gap-2">
          <ShadButton
            asChild
            className="h-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-semibold bg-brand text-white hover:bg-brand-deep"
          >
            <Link to={previewUrl}>
              {WIRELINE_STITCH_UI.previewTeaserAction}
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </ShadButton>
        </div>
      )}
    </div>
  );
}
