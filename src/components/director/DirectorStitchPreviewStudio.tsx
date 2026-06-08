/**
 * Full Wireline Design preview surface — device frame, live HTML, screenshot, export.
 * Used on /design/preview (not inlined in the main Director chat thread).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Download,
  ExternalLink,
  LayoutTemplate,
  Loader2,
  Monitor,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { DirectorPreviewMeta } from "../../lib/director-message-metadata";
import { fetchDirectorArtifactSignedUrl } from "../../hooks/useDirectorArtifactInlineSrc";
import { useStitchPreviewReady } from "../../hooks/useStitchPreviewReady";
import { cn } from "../../lib/utils";
import { WL_DIRECTOR_CLASSES, WIRELINE_STITCH_UI } from "../../lib/wireline-director-design";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { useToast } from "../../contexts/ToastContext";

export interface DirectorStitchPreviewStudioProps {
  preview: DirectorPreviewMeta;
  onSuggestEdit?: (prompt: string) => void;
  disabled?: boolean;
  /** First tab when the studio opens — screenshot matches Stitch web fidelity. */
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
        <span className="wl-stitch-device-dot" aria-hidden="true" />
        <span className="wl-stitch-device-dot wl-stitch-device-dot--mid" aria-hidden="true" />
        <span className="wl-stitch-device-dot wl-stitch-device-dot--dim" aria-hidden="true" />
        <span className="wl-stitch-device-url" aria-hidden="true">
          {WIRELINE_STITCH_UI.deviceChromeLabel}
        </span>
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
  if (hasRenderableImage) return "screenshot";
  if (hasRenderableHtml) return "preview";
  return "export";
}

function LoadingProgress({ elapsedMs }: { elapsedMs: number }) {
  const phases = WIRELINE_STITCH_UI.loadingPhases;
  const phaseIndex = Math.min(Math.floor(elapsedMs / 6000) % phases.length, phases.length - 1);
  const phase = phases[phaseIndex];
  const elapsedSec = Math.round(elapsedMs / 1000);
  const minutes = Math.floor(elapsedSec / 60);
  const seconds = elapsedSec % 60;
  const timeLabel = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return (
    <div className="rounded-md border border-brand/15 p-8 text-center space-y-3">
      <Loader2 className="w-6 h-6 text-brand/50 animate-spin mx-auto" />
      <div>
        <p className="text-[12px] text-ink font-medium">{phase}</p>
        <p className="text-[11px] text-muted mt-1">{timeLabel} elapsed</p>
      </div>
      {elapsedMs > 15_000 && (
        <p className="text-[10px] text-muted/70">{WIRELINE_STITCH_UI.loadingHint}</p>
      )}
    </div>
  );
}

export default function DirectorStitchPreviewStudio({
  preview,
  onSuggestEdit,
  disabled,
  defaultTab,
  className,
}: DirectorStitchPreviewStudioProps) {
  const [retryNonce, setRetryNonce] = useState(0);
  const ready = useStitchPreviewReady(preview, { refreshKey: retryNonce });
  const hasRenderableImage = Boolean(ready.imageSrc);
  const hasRenderableHtml = Boolean(ready.htmlSrc);

  const [tab, setTab] = useState<StitchTab>(() =>
    resolveDefaultTab(hasRenderableHtml, hasRenderableImage, defaultTab),
  );
  const autoTabbedRef = useRef<string | null>(null);
  const autoTabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadStartRef = useRef<number>(Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);
  const [exportBusy, setExportBusy] = useState<Record<string, true>>({});
  const [iframeFailed, setIframeFailed] = useState(false);
  const { error: toastError } = useToast();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    loadStartRef.current = Date.now();
    if (!ready.isReady) {
      const interval = setInterval(() => setElapsedMs(Date.now() - loadStartRef.current), 1000);
      return () => clearInterval(interval);
    }
  }, [ready.isReady]);

  useEffect(() => {
    if (autoTabbedRef.current === preview.conceptId) return;
    const target = resolveDefaultTab(hasRenderableHtml, hasRenderableImage, defaultTab);
    if (tab === target) return;
    if (autoTabTimerRef.current) {
      clearTimeout(autoTabTimerRef.current);
    }
    autoTabTimerRef.current = setTimeout(() => {
      autoTabbedRef.current = preview.conceptId;
      setTab(target);
    }, 800);
    return () => {
      if (autoTabTimerRef.current) {
        clearTimeout(autoTabTimerRef.current);
      }
    };
  }, [preview.conceptId, hasRenderableHtml, hasRenderableImage, defaultTab, tab]);

  useEffect(() => {
    if (!ready.htmlSrc || !hasRenderableHtml) return;
    setIframeFailed(false);
    const timer = setTimeout(() => {
      setIframeFailed(true);
    }, 12_000);
    return () => clearTimeout(timer);
  }, [ready.htmlSrc, hasRenderableHtml]);

  const openArtifactDownload = useCallback(
    async (artifactId: string | undefined, inline: boolean) => {
      if (!artifactId) return;
      setExportBusy((prev) => ({ ...prev, [artifactId]: true }));
      try {
        const url = await fetchDirectorArtifactSignedUrl(artifactId, inline);
        if (!url) {
          toastError("Download failed", "Could not retrieve the signed download URL.");
          return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
      } catch {
        toastError("Download failed", "Could not retrieve the signed download URL.");
      } finally {
        setExportBusy((prev) => {
          const next = { ...prev };
          delete next[artifactId];
          return next;
        });
      }
    },
    [toastError],
  );

  const tabs = useMemo(() => {
    const list: { id: StitchTab; label: string; icon: React.ElementType }[] = [];
    if (hasRenderableImage) {
      list.push({
        id: "screenshot",
        label: WIRELINE_STITCH_UI.screenshotTabLabel,
        icon: LayoutTemplate,
      });
    }
    if (hasRenderableHtml) {
      list.push({ id: "preview", label: WIRELINE_STITCH_UI.previewTabLabel, icon: Monitor });
    }
    list.push({ id: "export", label: "Export", icon: Download });
    return list;
  }, [hasRenderableHtml, hasRenderableImage]);

  if (!ready.hasSources || (!ready.isReady && !ready.isLoading)) {
    return (
      <div
        className={cn(
          "wl-stitch-studio-loading rounded-md border border-brand/15 p-8 text-center space-y-3",
          className,
        )}
      >
        <p className="text-[12px] text-muted">
          {ready.failed ? WIRELINE_STITCH_UI.fallbackCopy : "Loading preview assets…"}
        </p>
        {ready.failed && (
          <ShadButton
            type="button"
            variant="ghost"
            size="sm"
            disableAnimations
            onClick={() => setRetryNonce((n) => n + 1)}
            className="h-auto px-2.5 py-1 text-[10px] font-semibold text-brand hover:text-brand-deep"
          >
            <RefreshCw className="w-3 h-3" />
            Retry preview
          </ShadButton>
        )}
      </div>
    );
  }

  if (ready.isLoading) {
    return (
      <div className={cn("w-full wl-stitch-studio", className)}>
        <LoadingProgress elapsedMs={elapsedMs} />
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

      <div className="flex flex-nowrap gap-1 mb-3 p-1 rounded-md bg-black/[0.03] dark:bg-white/[0.04] border border-brand/10 overflow-x-auto">
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
                "h-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all",
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
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -4 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
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
                  decoding="async"
                  onError={() => {
                    if (hasRenderableHtml) setTab("preview");
                  }}
                />
              </div>
            </DeviceChrome>
          )}

          {tab === "preview" && hasRenderableHtml && (
            <DeviceChrome device={preview.deviceType} fullHeight>
              {iframeFailed && hasRenderableImage ? (
                <div className="min-h-[min(70vh,640px)] flex flex-col items-center justify-center gap-2 p-6 text-center">
                  <p className="text-[12px] text-muted">
                    Live preview is taking longer than expected.
                  </p>
                  <ShadButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setTab("screenshot")}
                    className="h-auto px-2.5 py-1 text-[10px] font-semibold text-brand hover:text-brand-deep"
                  >
                    View screenshot instead
                  </ShadButton>
                </div>
              ) : (
                <iframe
                  title={`${WIRELINE_STITCH_UI.previewTabLabel} — ${preview.title}`}
                  src={ready.htmlSrc}
                  className="wl-stitch-live-iframe wl-stitch-live-iframe--studio"
                  sandbox="allow-scripts"
                  referrerPolicy="no-referrer"
                  allow="fullscreen"
                />
              )}
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
                    disabled={Boolean(exportBusy[ready.htmlArtifactId])}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-semibold bg-brand text-white hover:bg-brand-deep transition-colors h-auto disabled:opacity-60"
                  >
                    {exportBusy[ready.htmlArtifactId] ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    HTML prototype
                  </ShadButton>
                )}
                {ready.imageArtifactId && (
                  <ShadButton
                    type="button"
                    onClick={() => void openArtifactDownload(ready.imageArtifactId, false)}
                    disabled={Boolean(exportBusy[ready.imageArtifactId])}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-semibold border border-brand/25 text-brand bg-brand/5 hover:bg-brand/10 h-auto disabled:opacity-60"
                  >
                    {exportBusy[ready.imageArtifactId] ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    PNG screenshot
                  </ShadButton>
                )}
                {ready.htmlArtifactId && (
                  <ShadButton
                    type="button"
                    onClick={() => void openArtifactDownload(ready.htmlArtifactId, true)}
                    disabled={Boolean(exportBusy[ready.htmlArtifactId])}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-semibold border border-black/10 hover:border-brand/20 h-auto disabled:opacity-60"
                  >
                    {exportBusy[ready.htmlArtifactId] ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5" />
                    )}
                    Open live
                  </ShadButton>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {onSuggestEdit && (
        <div className="mt-4 flex flex-wrap gap-1.5 max-h-[2.75rem] overflow-y-auto">
          {QUICK_EDITS.map((prompt) => (
            <ShadButton
              key={prompt}
              type="button"
              disabled={disabled}
              onClick={() => onSuggestEdit(prompt)}
              aria-label={`Suggest edit: ${prompt}`}
              className="px-2.5 py-1 rounded-full text-[10px] font-medium border border-brand/15 bg-brand/[0.04] text-brand-deep hover:bg-brand/10 hover:border-brand/25 shrink-0 max-w-[280px] truncate"
            >
              {prompt}
            </ShadButton>
          ))}
        </div>
      )}
    </div>
  );
}
