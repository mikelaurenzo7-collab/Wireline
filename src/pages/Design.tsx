/**
 * Wireline Design — Painter studio with split chat + immersive live preview.
 */
import React, { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutTemplate, Paintbrush } from "lucide-react";
import ClientRouteViewport from "../components/layout/ClientRouteViewport";
import DirectorWorkspace from "../components/DirectorWorkspace";
import DirectorStitchPreviewStudio from "../components/director/DirectorStitchPreviewStudio";
import type { DirectorPreviewMeta } from "../lib/director-message-metadata";
import { WIRELINE_PAINTER_UI } from "../lib/wireline-painter-design";
import { useVisualViewportVar } from "../lib/use-visual-viewport";
import { cn } from "../lib/utils";
import { ShadButton } from "../components/ui/shadcn/ShadButton";

export default function Design() {
  const [searchParams] = useSearchParams();
  const initialPrompt = searchParams.get("prompt")?.trim() || undefined;
  const [activePreview, setActivePreview] = useState<DirectorPreviewMeta | null>(null);
  const [mobilePane, setMobilePane] = useState<"chat" | "preview">("chat");
  useVisualViewportVar();

  const previewTitle = useMemo(
    () => activePreview?.title || WIRELINE_PAINTER_UI.previewEmptyTitle,
    [activePreview?.title],
  );

  const handleActiveStitchPreview = useCallback((preview: DirectorPreviewMeta | null) => {
    setActivePreview(preview);
    if (preview) setMobilePane("preview");
  }, []);

  return (
    <ClientRouteViewport className="bg-paper dark:bg-velvet">
      <div className="wl-painter-studio flex flex-col h-full min-h-0">
        <header className="wl-painter-studio-header shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-brand/10">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex w-9 h-9 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/20">
              <Paintbrush className="w-4 h-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink leading-tight flex items-center gap-2">
                {WIRELINE_PAINTER_UI.personaName}
                <span className="wl-composer-design-beta">{WIRELINE_PAINTER_UI.betaLabel}</span>
              </p>
              <p className="wl-label text-muted truncate">{WIRELINE_PAINTER_UI.pageSubtitle}</p>
            </div>
          </div>
          <div className="lg:hidden flex gap-1 p-0.5 rounded-full bg-black/[0.04] border border-brand/10">
            <ShadButton
              type="button"
              size="sm"
              variant={mobilePane === "chat" ? "default" : "ghost"}
              className="h-8 rounded-full px-3 text-[11px] font-semibold"
              onClick={() => setMobilePane("chat")}
            >
              {WIRELINE_PAINTER_UI.mobileChatTab}
            </ShadButton>
            <ShadButton
              type="button"
              size="sm"
              variant={mobilePane === "preview" ? "default" : "ghost"}
              className="h-8 rounded-full px-3 text-[11px] font-semibold"
              onClick={() => setMobilePane("preview")}
            >
              {WIRELINE_PAINTER_UI.mobilePreviewTab}
            </ShadButton>
          </div>
        </header>

        <div className="wl-painter-studio-body flex flex-1 min-h-0">
          <section
            className={cn(
              "wl-painter-studio-chat flex flex-col min-h-0 min-w-0 border-r border-brand/8",
              "w-full lg:w-[min(100%,26rem)] xl:w-[min(100%,30rem)]",
              mobilePane !== "chat" && "hidden lg:flex",
            )}
          >
            <DirectorWorkspace
              surface="painter"
              initialPrompt={initialPrompt}
              onActiveStitchPreview={handleActiveStitchPreview}
            />
          </section>

          <section
            className={cn(
              "wl-painter-studio-preview flex-1 min-h-0 min-w-0 flex flex-col",
              mobilePane !== "preview" && "hidden lg:flex",
            )}
            aria-label="Live design preview"
          >
            <div className="shrink-0 px-4 sm:px-6 py-3 border-b border-brand/8 flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4 text-brand shrink-0" aria-hidden />
              <h2 className="text-[13px] font-semibold text-ink truncate">{previewTitle}</h2>
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
                <div className="wl-painter-preview-empty h-full min-h-[min(60vh,480px)] flex flex-col items-center justify-center text-center gap-2 px-6">
                  <LayoutTemplate className="w-8 h-8 text-brand/40" aria-hidden />
                  <p className="text-[13px] font-medium text-ink">
                    {WIRELINE_PAINTER_UI.previewEmptyTitle}
                  </p>
                  <p className="wl-micro-meta--muted-foreground max-w-sm">
                    {WIRELINE_PAINTER_UI.previewEmptyBody}
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </ClientRouteViewport>
  );
}
