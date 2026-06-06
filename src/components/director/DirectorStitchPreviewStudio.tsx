/**
 * Full Wireline Design preview surface — device frame, live HTML, screenshot, export.
 * Used on /design/preview (not inlined in the main Director chat thread).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Download, ExternalLink, LayoutTemplate, Monitor, Sparkles } from "lucide-react";
import type { DirectorPreviewMeta } from "../../lib/director-message-metadata";
import { fetchDirectorArtifactSignedUrl } from "../../hooks/useDirectorArtifactInlineSrc";
import { useStitchPreviewReady } from "../../hooks/useStitchPreviewReady";
import { cn } from "../../lib/utils";
import { WL_DIRECTOR_CLASSES, WIRELINE_STITCH_UI } from "../../lib/wireline-director-design";
import { ShadButton } from "../ui/shadcn/ShadButton";

export interface DirectorStitchPreviewStudioProps {
  preview: DirectorPreviewMeta;
  onSuggestEdit?: (prompt: string) => void;
  disabled?: boolean;
  /** First tab when the studio opens — preview page prefers live HTML when available. */
  defaultTab?: "preview" | "screenshot" | "export";
  className?: string;
}

type StitchTab = "preview" | "screenshot" | "export";

const QUICK_EDITS = [
  "Make the hero section darker with higher contrast",
  "Show 3 color variants",
  "Tighten spacing and enlarge the primary CTA",
] as const;

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

function DeviceChrome({
  device,
  children,
  fullHeight,
}: {
  device?: DirectorPreviewMeta["deviceType"];
  children: React.ReactNode;
  fullHeight?: boolean;
}) {
  const mobile = device === "MOBILE" || device === "TABLET";
  return (
    <div
      className={cn(
        "wl-stitch-device mx-auto",
        mobile ? "wl-stitch-device--mobile" : "wl-stitch-device--desktop",
        fullHeight && "wl-stitch-device--studio",
      )}
    >
      <div className="wl-stitch-device-chrome">
        <span className="wl-stitch-device-dot" />
        <span className="wl-stitch-device-dot wl-stitch-device-dot--mid" />
        <span className="wl-stitch-device-dot wl-stitch-device-dot--dim" />
        <span className="wl-stitch-device-url">{WIRELINE_STITCH_UI.deviceChromeLabel}</span>
      </div>
      <div
        className={cn("wl-stitch-device-screen", fullHeight && "wl-stitch-device-screen--studio")}
      >
        {children}
      </div>
    </div>
  );
}

function resolveDefaultTab(
  hasRenderableHtml: boolean,
  hasRenderableImage: boolean,
  preferred?: DirectorStitchPreviewStudioProps["defaultTab"],
): StitchTab {
  if (preferred === "export") return "export";
  if (preferred === "screenshot" && hasRenderableImage) return "screenshot";
  if (preferred === "preview" && hasRenderableHtml) return "preview";
  if (hasRenderableHtml) return "preview";
  if (hasRenderableImage) return "screenshot";
  return "export";
}

export default function DirectorStitchPreviewStudio({
  preview,
  onSuggestEdit,
  disabled,
  defaultTab,
  className,
}: DirectorStitchPreviewStudioProps) {
  const ready = useStitchPreviewReady(preview);
  const hasRenderableImage = Boolean(ready.imageSrc);
  const hasRenderableHtml = Boolean(ready.htmlSrc);

  const [tab, setTab] = useState<StitchTab>(() =>
    resolveDefaultTab(hasRenderableHtml, hasRenderableImage, defaultTab),
  );
  const autoTabbedRef = useRef<string | null>(null);

  useEffect(() => {
    if (autoTabbedRef.current === preview.conceptId) return;
    if (hasRenderableHtml) {
      autoTabbedRef.current = preview.conceptId;
      setTab(resolveDefaultTab(true, hasRenderableImage, defaultTab ?? "preview"));
    }
  }, [preview.conceptId, hasRenderableHtml, hasRenderableImage, defaultTab]);

  const openArtifactDownload = async (artifactId: string | undefined, inline: boolean) => {
    if (!artifactId) return;
    const url = await fetchDirectorArtifactSignedUrl(artifactId, inline);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const tabs = useMemo(() => {
    const list: { id: StitchTab; label: string; icon: React.ElementType }[] = [];
    if (hasRenderableHtml) {
      list.push({ id: "preview", label: WIRELINE_STITCH_UI.previewTabLabel, icon: Monitor });
    }
    if (hasRenderableImage) {
      list.push({
        id: "screenshot",
        label: WIRELINE_STITCH_UI.screenshotTabLabel,
        icon: LayoutTemplate,
      });
    }
    list.push({ id: "export", label: "Export", icon: Download });
    return list;
  }, [hasRenderableHtml, hasRenderableImage]);

  if (!ready.hasSources || !ready.isReady) {
    return (
      <div
        className={cn(
          "wl-stitch-studio-loading rounded-md border border-brand/15 p-8 text-center",
          className,
        )}
      >
        <p className="text-[12px] text-muted">Loading preview assets…</p>
      </div>
    );
  }

  return (
    <div className={cn("w-full wl-stitch-studio", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-brand/12 to-brand-deep/10 border border-brand/25 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          <span
            className={cn(WL_DIRECTOR_CLASSES.microLabel, "text-brand font-bold tracking-[0.14em]")}
          >
            {WIRELINE_STITCH_UI.badgeLabel}
          </span>
          <span className="text-[10px] text-muted/60 font-mono tabular-nums">
            {deviceLabel(preview.deviceType)}
          </span>
        </span>
        <p className="text-[12px] text-ink font-medium truncate max-w-[min(100%,20rem)]">
          {preview.title}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 mb-3 p-1 rounded-md bg-black/[0.03] dark:bg-white/[0.04] border border-brand/10">
        {tabs.map((t) => {
          const Icon = t.icon;
          const selected = tab === t.id;
          return (
            <ShadButton
              key={t.id}
              type="button"
              variant="ghost"
              onClick={() => setTab(t.id)}
              className={cn(
                "h-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all",
                selected
                  ? "bg-paper dark:bg-velvet/80 text-brand shadow-sm border border-brand/20"
                  : "text-muted hover:text-ink hover:bg-paper/60",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </ShadButton>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${preview.conceptId}-${tab}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-md border border-brand/15 bg-gradient-to-b from-paper/98 to-paper/90 dark:from-velvet/70 dark:to-velvet/50 overflow-hidden shadow-[0_20px_50px_-24px_rgba(107,47,168,0.35)]"
        >
          {tab === "screenshot" && hasRenderableImage && (
            <DeviceChrome device={preview.deviceType} fullHeight>
              <div className="relative min-h-[min(70vh,640px)] flex items-center justify-center p-2">
                <img
                  src={ready.imageSrc}
                  alt={preview.title}
                  className="max-h-[min(70vh,640px)] w-full object-contain object-top"
                  loading="lazy"
                  onError={() => {
                    if (hasRenderableHtml) setTab("preview");
                  }}
                />
              </div>
            </DeviceChrome>
          )}

          {tab === "preview" && hasRenderableHtml && (
            <DeviceChrome device={preview.deviceType} fullHeight>
              <iframe
                title={`${WIRELINE_STITCH_UI.previewTabLabel} — ${preview.title}`}
                src={ready.htmlSrc}
                className="wl-stitch-live-iframe wl-stitch-live-iframe--studio"
                sandbox="allow-scripts allow-same-origin"
                loading="lazy"
              />
            </DeviceChrome>
          )}

          {tab === "export" && (
            <div className="p-4 sm:p-5 space-y-3">
              <p className="text-[12px] text-ink font-medium">{preview.title}</p>
              <p className="text-[11px] text-muted leading-relaxed">
                {WIRELINE_STITCH_UI.exportBlurb}
              </p>
              <div className="flex flex-wrap gap-2">
                {ready.htmlArtifactId && (
                  <ShadButton
                    type="button"
                    onClick={() => void openArtifactDownload(ready.htmlArtifactId, false)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-semibold bg-brand text-white hover:bg-brand-deep transition-colors h-auto"
                  >
                    <Download className="w-3.5 h-3.5" />
                    HTML prototype
                  </ShadButton>
                )}
                {ready.imageArtifactId && (
                  <ShadButton
                    type="button"
                    onClick={() => void openArtifactDownload(ready.imageArtifactId, false)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-semibold border border-brand/25 text-brand bg-brand/5 hover:bg-brand/10 h-auto"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PNG screenshot
                  </ShadButton>
                )}
                {ready.htmlArtifactId && (
                  <ShadButton
                    type="button"
                    onClick={() => void openArtifactDownload(ready.htmlArtifactId, true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-semibold border border-black/10 hover:border-brand/20 h-auto"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open live
                  </ShadButton>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {onSuggestEdit && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {QUICK_EDITS.map((prompt) => (
            <ShadButton
              key={prompt}
              type="button"
              disabled={disabled}
              onClick={() => onSuggestEdit(prompt)}
              className="px-2.5 py-1 rounded-full text-[10px] font-medium border border-brand/15 bg-brand/[0.04] text-brand-deep hover:bg-brand/10 hover:border-brand/25"
            >
              {prompt}
            </ShadButton>
          ))}
        </div>
      )}
    </div>
  );
}
