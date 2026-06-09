/**
 * Wireline Design — Painter studio with split chat + immersive live preview.
 */
import React, { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutTemplate, Loader2, Paintbrush, Trash2 } from "lucide-react";
import ClientRouteViewport from "../components/layout/ClientRouteViewport";
import PainterWorkspace from "../components/PainterWorkspace";
import type { PainterStudioBridge } from "../components/DirectorWorkspace";
import DirectorStitchPreviewStudio from "../components/director/DirectorStitchPreviewStudio";
import type { DirectorPreviewMeta } from "../lib/director-message-metadata";
import { ROUTE_ACCENTS } from "../constants/brand-colors";
import {
  PAINTER_EMPTY_COPY,
  PAINTER_STARTER_PROMPTS,
  WIRELINE_PAINTER_UI,
} from "../lib/wireline-painter-design";
import { useVisualViewportVar } from "../lib/use-visual-viewport";
import { cn } from "../lib/utils";
import { ShadButton } from "../components/ui/shadcn/ShadButton";
import { SignalOrbFrame } from "../components/ui/SignalOrbFrame";

const PREVIEW_STARTER_PROMPTS = PAINTER_STARTER_PROMPTS.slice(0, 3);

export default function Design() {
  const [searchParams] = useSearchParams();
  const initialPrompt = searchParams.get("prompt")?.trim() || undefined;
  const [activePreview, setActivePreview] = useState<DirectorPreviewMeta | null>(null);
  const [mobilePane, setMobilePane] = useState<"chat" | "preview">("chat");
  const [studioBridge, setStudioBridge] = useState<PainterStudioBridge | null>(null);
  useVisualViewportVar();

  const previewTitle = useMemo(
    () => activePreview?.title || WIRELINE_PAINTER_UI.previewEmptyTitle,
    [activePreview?.title],
  );

  const handleActiveStitchPreview = useCallback((preview: DirectorPreviewMeta | null) => {
    setActivePreview(preview);
    if (preview) setMobilePane("preview");
  }, []);

  const handlePreviewPrompt = useCallback(
    (label: string) => {
      studioBridge?.queuePrompt(label);
      setMobilePane("chat");
    },
    [studioBridge],
  );

  return (
    <ClientRouteViewport className="bg-paper dark:bg-velvet">
      <div
        className="wl-painter-studio flex flex-col h-full min-h-0"
        data-accent={ROUTE_ACCENTS["/design"][0]}
      >
        <header className="wl-painter-studio-header shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-brand/10">
          <div className="flex items-center gap-3 min-w-0">
            <span className="wl-painter-studio-mark flex w-9 h-9 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/20">
              <Paintbrush className="w-4 h-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink leading-tight flex items-center gap-2 flex-wrap">
                {WIRELINE_PAINTER_UI.personaName}
                <span className="wl-composer-design-beta">{WIRELINE_PAINTER_UI.betaLabel}</span>
              </p>
              <p className="wl-label text-muted truncate">{WIRELINE_PAINTER_UI.pageSubtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(studioBridge?.messageCount ?? 0) > 0 && (
              <ShadButton
                type="button"
                variant="ghost"
                size="sm"
                disableAnimations
                onClick={() => studioBridge?.clearThread()}
                disabled={studioBridge?.isClearing}
                className="touch-press inline-flex h-8 wl-label text-muted-foreground hover:text-rose-600 hover:bg-rose-500/8 px-2 sm:px-2.5"
                aria-label={WIRELINE_PAINTER_UI.clearThreadLabel}
              >
                {studioBridge?.isClearing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" aria-hidden />
                )}
                <span className="hidden sm:inline">{WIRELINE_PAINTER_UI.clearThreadLabel}</span>
              </ShadButton>
            )}

            <div
              className="lg:hidden wl-painter-pane-toggle flex gap-1 p-0.5 rounded-full"
              role="tablist"
              aria-label="Studio panes"
            >
              <ShadButton
                type="button"
                size="sm"
                variant={mobilePane === "chat" ? "default" : "ghost"}
                role="tab"
                aria-selected={mobilePane === "chat"}
                className="h-8 rounded-full px-3 text-[11px] font-semibold touch-press"
                onClick={() => setMobilePane("chat")}
              >
                {WIRELINE_PAINTER_UI.mobileChatTab}
              </ShadButton>
              <ShadButton
                type="button"
                size="sm"
                variant={mobilePane === "preview" ? "default" : "ghost"}
                role="tab"
                aria-selected={mobilePane === "preview"}
                className="h-8 rounded-full px-3 text-[11px] font-semibold touch-press"
                onClick={() => setMobilePane("preview")}
              >
                {WIRELINE_PAINTER_UI.mobilePreviewTab}
              </ShadButton>
            </div>
          </div>
        </header>

        <div className="wl-painter-studio-body flex flex-1 min-h-0">
          <section
            className={cn(
              "wl-painter-studio-chat flex flex-col min-h-0 min-w-0 border-r border-brand/8",
              "w-full lg:w-[min(100%,26rem)] xl:w-[min(100%,30rem)]",
              mobilePane !== "chat" && "hidden lg:flex",
            )}
            aria-label="Painter chat"
          >
            <PainterWorkspace
              initialPrompt={initialPrompt}
              onActiveStitchPreview={handleActiveStitchPreview}
              onPainterStudioBridge={setStudioBridge}
            />
          </section>

          {/* Glassmorphic resize divider — desktop only */}
          <div
            className="wl-painter-divider hidden lg:flex items-center justify-center shrink-0 cursor-col-resize select-none group"
            aria-hidden="true"
          >
            <div className="wl-painter-divider-handle" />
          </div>

          <section
            className={cn(
              "wl-painter-studio-preview flex-1 min-h-0 min-w-0 flex flex-col",
              mobilePane !== "preview" && "hidden lg:flex",
            )}
            aria-label="Live design preview"
          >
            <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-brand/8 flex items-center gap-2 min-w-0 wl-painter-preview-header">
              <LayoutTemplate className="w-4 h-4 text-brand shrink-0" aria-hidden />
              <h2 className="text-[13px] font-semibold text-ink truncate flex-1">{previewTitle}</h2>
              {activePreview?.deviceType && activePreview.deviceType !== "AGNOSTIC" && (
                <span className="wl-label text-muted capitalize ml-auto shrink-0">
                  {activePreview.deviceType.toLowerCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4">
              {activePreview ? (
                <DirectorStitchPreviewStudio
                  preview={activePreview}
                  layout="immersive"
                  defaultTab="preview"
                  className="h-full"
                />
              ) : (
                <div className="wl-painter-preview-empty h-full min-h-[min(60vh,480px)] flex flex-col items-center justify-center text-center gap-4 px-6 py-8">
                  <SignalOrbFrame size="md" withBloom className="wl-painter-preview-orb">
                    <span className="flex w-12 h-12 items-center justify-center rounded-md bg-gradient-to-br from-brand/90 to-brand-deep text-on-brand shadow-md shadow-brand/20 ring-1 ring-white/10">
                      <LayoutTemplate className="w-6 h-6" aria-hidden />
                    </span>
                  </SignalOrbFrame>
                  <div className="space-y-1.5 max-w-sm">
                    <p className="text-[13px] font-semibold text-ink">
                      {WIRELINE_PAINTER_UI.previewEmptyTitle}
                    </p>
                    <p className="wl-micro-meta--muted-foreground leading-relaxed">
                      {WIRELINE_PAINTER_UI.previewEmptyBody}
                    </p>
                  </div>
                  <div className="w-full max-w-md space-y-2">
                    <p className="wl-label text-brand/60">{PAINTER_EMPTY_COPY.previewStarterEyebrow}</p>
                    <div className="flex flex-col gap-2">
                      {PREVIEW_STARTER_PROMPTS.map((prompt) => (
                        <ShadButton
                          key={prompt.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          disableAnimations
                          onClick={() => handlePreviewPrompt(prompt.label)}
                          className="wl-painter-preview-starter touch-press h-auto min-h-10 justify-between gap-2 px-3 py-2.5 text-left text-[12px] font-medium leading-snug"
                        >
                          <span className="line-clamp-2">{prompt.label}</span>
                        </ShadButton>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </ClientRouteViewport>
  );
}
