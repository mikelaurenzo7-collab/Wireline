import React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, LayoutTemplate, Sparkles } from "lucide-react";
import type { DirectorPreviewMeta } from "../../lib/director-message-metadata";
import {
  buildStitchPreviewPageUrl,
  stitchPreviewPageUrlIsValid,
} from "../../lib/director-stitch-preview-route";
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

/** Compact in-thread card — links out to the dedicated design preview page. */
export default function DirectorStitchPreviewTeaser({ preview }: DirectorStitchPreviewTeaserProps) {
  if (!stitchPreviewPageUrlIsValid(preview)) return null;

  const previewUrl = buildStitchPreviewPageUrl(preview);

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
    </div>
  );
}
