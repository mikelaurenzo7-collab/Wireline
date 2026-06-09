import React, { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, LayoutTemplate } from "lucide-react";
import ClientRouteViewport from "../components/layout/ClientRouteViewport";
import DirectorStitchPreviewStudio from "../components/director/DirectorStitchPreviewStudio";
import { parseStitchPreviewPageSearch } from "../lib/design-preview-route";
import { WIRELINE_STITCH_UI } from "../lib/wireline-director-design";
import { ShadButton } from "../components/ui/shadcn/ShadButton";
import { useVisualViewportVar } from "../lib/use-visual-viewport";

export default function DesignPreviewPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  useVisualViewportVar();

  const preview = useMemo(() => parseStitchPreviewPageSearch(searchParams), [searchParams]);

  return (
    <ClientRouteViewport scroll className="bg-paper dark:bg-velvet">
      <div className="wl-design-preview-page mx-auto w-full max-w-5xl px-4 sm:px-6 py-5 sm:py-8">
        <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <ShadButton
              type="button"
              variant="ghost"
              onClick={() => navigate(-1)}
              className="h-auto px-2.5 py-1.5 text-[11px] font-semibold text-muted hover:text-ink"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {WIRELINE_STITCH_UI.previewPageBackLabel}
            </ShadButton>
            <div className="min-w-0">
              <p className="wl-label font-bold text-brand flex items-center gap-1.5">
                <LayoutTemplate className="w-3.5 h-3.5" />
                {WIRELINE_STITCH_UI.previewPageTitle}
              </p>
              <h1 className="text-lg sm:text-xl font-semibold text-ink tracking-[-0.02em] truncate">
                {preview?.title ?? "Design preview"}
              </h1>
            </div>
          </div>
        </header>

        {!preview ? (
          <div className="rounded-md border border-brand/15 bg-paper/90 dark:bg-velvet/60 p-8 text-center space-y-3">
            <p className="text-[13px] text-ink font-medium">
              This preview link is incomplete or expired.
            </p>
            <p className="text-[12px] text-muted">
              Run a new design in Director chat, then open preview from the design card or thread
              header.
            </p>
            <ShadButton
              type="button"
              onClick={() => navigate("/chat")}
              className="mt-2 h-auto px-4 py-2 text-[12px] font-semibold"
            >
              Go to chat
            </ShadButton>
          </div>
        ) : (
          <DirectorStitchPreviewStudio
            preview={preview}
            defaultTab="screenshot"
            onSuggestEdit={(prompt) => {
              navigate(`/chat?prompt=${encodeURIComponent(prompt)}`);
            }}
          />
        )}
      </div>
    </ClientRouteViewport>
  );
}
