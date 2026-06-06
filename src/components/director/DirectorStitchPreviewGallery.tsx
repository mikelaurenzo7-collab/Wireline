/**
 * In-chat Google Stitch render — device frame, live HTML iframe, variants carousel.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  LayoutTemplate,
  Loader2,
  Monitor,
  Smartphone,
  Sparkles,
} from "lucide-react";
import type { DirectorPreviewMeta } from "../../lib/director-message-metadata";
import {
  artifactIdFromDirectorSignedUrl,
  fetchDirectorArtifactSignedUrl,
  useDirectorArtifactBlobSrc,
} from "../../hooks/useDirectorArtifactInlineSrc";
import { cn } from "../../lib/utils";
import { WL_DIRECTOR_CLASSES } from "../../lib/wireline-director-design";
import { ShadButton } from "../ui/shadcn/ShadButton";

export interface DirectorStitchPreviewGalleryProps {
  previews: DirectorPreviewMeta[];
  onSuggestEdit: (prompt: string) => void;
  disabled?: boolean;
}

type StitchTab = "design" | "live" | "export";

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

function resolveImageArtifactId(preview: DirectorPreviewMeta): string | undefined {
  return preview.imageArtifactId ?? artifactIdFromDirectorSignedUrl(preview.imageDownloadUrl);
}

function resolveHtmlArtifactId(preview: DirectorPreviewMeta): string | undefined {
  return preview.htmlArtifactId ?? artifactIdFromDirectorSignedUrl(preview.htmlDownloadUrl);
}

function hasEmbeddedImageData(preview: DirectorPreviewMeta): boolean {
  return Boolean(preview.previewDataUrl?.startsWith("data:"));
}

function DeviceChrome({
  device,
  children,
}: {
  device?: DirectorPreviewMeta["deviceType"];
  children: React.ReactNode;
}) {
  const mobile = device === "MOBILE" || device === "TABLET";
  return (
    <div
      className={cn(
        "wl-stitch-device mx-auto",
        mobile ? "wl-stitch-device--mobile" : "wl-stitch-device--desktop",
      )}
    >
      <div className="wl-stitch-device-chrome">
        <span className="wl-stitch-device-dot" />
        <span className="wl-stitch-device-dot wl-stitch-device-dot--mid" />
        <span className="wl-stitch-device-dot wl-stitch-device-dot--dim" />
        <span className="wl-stitch-device-url">stitch.withgoogle.com</span>
      </div>
      <div className="wl-stitch-device-screen">{children}</div>
    </div>
  );
}

function StitchPreviewLoading({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-muted/60">
      <Loader2 className="w-8 h-8 text-brand/40 animate-spin" aria-hidden />
      <p className="text-[11px]">{label}</p>
    </div>
  );
}

function StitchPreviewPane({ preview }: { preview: DirectorPreviewMeta }) {
  const imageArtifactId = resolveImageArtifactId(preview);
  const htmlArtifactId = resolveHtmlArtifactId(preview);
  const embeddedImage = hasEmbeddedImageData(preview);

  const imageBlob = useDirectorArtifactBlobSrc(imageArtifactId, {
    inline: true,
    enabled: !embeddedImage && Boolean(imageArtifactId),
  });
  const htmlBlob = useDirectorArtifactBlobSrc(htmlArtifactId, {
    inline: true,
    enabled: Boolean(htmlArtifactId),
  });

  const imageSrc = embeddedImage
    ? preview.previewDataUrl
    : (imageBlob.src ?? (imageBlob.error ? preview.imageDownloadUrl : undefined));

  const htmlSrc = htmlBlob.src ?? (htmlBlob.error ? preview.htmlDownloadUrl : undefined);

  const hasRenderableImage = Boolean(imageSrc);
  const hasRenderableHtml = Boolean(htmlSrc);
  const imageLoading = !embeddedImage && imageArtifactId && imageBlob.loading;
  const htmlLoading = htmlArtifactId && htmlBlob.loading;

  const [tab, setTab] = useState<StitchTab>("design");
  const autoTabbedRef = useRef<string | null>(null);

  useEffect(() => {
    if (autoTabbedRef.current === preview.conceptId) return;
    if (hasRenderableHtml && !hasRenderableImage && !imageLoading) {
      autoTabbedRef.current = preview.conceptId;
      setTab("live");
    }
  }, [preview.conceptId, hasRenderableHtml, hasRenderableImage, imageLoading]);

  const openArtifactDownload = async (artifactId: string | undefined, inline: boolean) => {
    if (!artifactId) return;
    const url = await fetchDirectorArtifactSignedUrl(artifactId, inline);
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const tabs = useMemo(() => {
    const list: { id: StitchTab; label: string; icon: React.ElementType }[] = [
      { id: "design", label: "Screenshot", icon: LayoutTemplate },
    ];
    if (hasRenderableHtml || htmlArtifactId || preview.htmlDownloadUrl) {
      list.push({ id: "live", label: "Live HTML", icon: Monitor });
    }
    list.push({ id: "export", label: "Export", icon: Download });
    return list;
  }, [hasRenderableHtml, htmlArtifactId, preview.htmlDownloadUrl]);

  return (
    <>
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
          {tab === "design" && (
            <DeviceChrome device={preview.deviceType}>
              <div className="relative wl-checkerboard min-h-[280px] flex items-center justify-center p-2">
                {imageLoading ? (
                  <StitchPreviewLoading label="Loading screenshot…" />
                ) : hasRenderableImage ? (
                  <img
                    src={imageSrc}
                    alt={preview.title}
                    className="max-h-[min(52vh,520px)] w-full object-contain object-top"
                    loading="lazy"
                    onError={() => {
                      if (hasRenderableHtml || htmlArtifactId) setTab("live");
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 py-16 text-muted/60">
                    <Smartphone className="w-10 h-10 text-brand/25" />
                    <p className="text-[11px]">
                      {hasRenderableHtml || htmlLoading
                        ? "Screenshot unavailable — switch to Live HTML"
                        : "Preview assets still processing…"}
                    </p>
                    {(hasRenderableHtml || htmlLoading) && (
                      <ShadButton
                        type="button"
                        className="text-[10px] h-7 px-2.5"
                        onClick={() => setTab("live")}
                      >
                        Open Live HTML
                      </ShadButton>
                    )}
                  </div>
                )}
              </div>
            </DeviceChrome>
          )}

          {tab === "live" && (hasRenderableHtml || htmlLoading || htmlArtifactId) && (
            <DeviceChrome device={preview.deviceType}>
              {htmlLoading && !htmlSrc ? (
                <StitchPreviewLoading label="Loading live HTML…" />
              ) : htmlSrc ? (
                <iframe
                  title={`Stitch live preview — ${preview.title}`}
                  src={htmlSrc}
                  className="wl-stitch-live-iframe"
                  sandbox="allow-scripts allow-same-origin"
                  loading="lazy"
                />
              ) : (
                <StitchPreviewLoading label="HTML preview unavailable" />
              )}
            </DeviceChrome>
          )}

          {tab === "export" && (
            <div className="p-4 sm:p-5 space-y-3">
              <p className="text-[12px] text-ink font-medium">{preview.title}</p>
              <p className="text-[11px] text-muted leading-relaxed">
                Production HTML/CSS from Stitch — hand off to your dev team or keep iterating in
                chat.
              </p>
              <div className="flex flex-wrap gap-2">
                {(htmlArtifactId || preview.htmlDownloadUrl) && (
                  <ShadButton
                    type="button"
                    onClick={() => void openArtifactDownload(htmlArtifactId, false)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-semibold bg-brand text-white hover:bg-brand-deep transition-colors h-auto"
                  >
                    <Download className="w-3.5 h-3.5" />
                    HTML prototype
                  </ShadButton>
                )}
                {(imageArtifactId || preview.imageDownloadUrl) && (
                  <ShadButton
                    type="button"
                    onClick={() => void openArtifactDownload(imageArtifactId, false)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-[11px] font-semibold border border-brand/25 text-brand bg-brand/5 hover:bg-brand/10 h-auto"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PNG screenshot
                  </ShadButton>
                )}
                {(htmlArtifactId || preview.htmlDownloadUrl) && (
                  <ShadButton
                    type="button"
                    onClick={() => void openArtifactDownload(htmlArtifactId, true)}
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
    </>
  );
}

export default function DirectorStitchPreviewGallery({
  previews,
  onSuggestEdit,
  disabled,
}: DirectorStitchPreviewGalleryProps) {
  const [index, setIndex] = useState(0);
  const active = previews[index] ?? previews[0];

  if (!active) return null;

  const goPrev = () => setIndex((i) => (i - 1 + previews.length) % previews.length);
  const goNext = () => setIndex((i) => (i + 1) % previews.length);

  return (
    <div className="w-full wl-stitch-gallery">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-brand/12 to-brand-deep/10 border border-brand/25 shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          <span
            className={cn(WL_DIRECTOR_CLASSES.microLabel, "text-brand font-bold tracking-[0.14em]")}
          >
            Google Stitch
          </span>
          <span className="text-[10px] text-muted/60 font-mono tabular-nums">
            {deviceLabel(active.deviceType)}
          </span>
        </span>
        {previews.length > 1 && (
          <div className="flex items-center gap-1">
            <ShadButton
              type="button"
              aria-label="Previous variant"
              onClick={goPrev}
              className="h-8 w-8 p-0 rounded-full border border-brand/15 bg-paper/80"
              disabled={disabled}
            >
              <ChevronLeft className="w-4 h-4" />
            </ShadButton>
            <span className="text-[10px] font-mono text-muted/70 tabular-nums px-1">
              {index + 1}/{previews.length}
            </span>
            <ShadButton
              type="button"
              aria-label="Next variant"
              onClick={goNext}
              className="h-8 w-8 p-0 rounded-full border border-brand/15 bg-paper/80"
              disabled={disabled}
            >
              <ChevronRight className="w-4 h-4" />
            </ShadButton>
          </div>
        )}
      </div>

      <StitchPreviewPane key={active.conceptId} preview={active} />

      <div className="mt-3 flex flex-wrap gap-1.5">
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
    </div>
  );
}
