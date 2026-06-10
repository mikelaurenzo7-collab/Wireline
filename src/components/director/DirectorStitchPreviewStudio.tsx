/**
 * Full Wireline Design preview surface — device frame, live HTML, screenshot, export.
 * Used on /design/preview (not inlined in the main Director chat thread).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  Check,
  Code2,
  Copy,
  Download,
  Expand,
  ExternalLink,
  Github,
  LayoutTemplate,
  Link2,
  Loader2,
  Monitor,
  RefreshCw,
  Sparkles,
  Smartphone,
  Tablet,
  Layers,
  Eye,
  EyeOff,
} from "lucide-react";
import type { DirectorPreviewMeta } from "../../lib/director-message-metadata";
import { fetchDirectorArtifactSignedUrl } from "../../hooks/useDirectorArtifactInlineSrc";
import { useStitchPreviewReady } from "../../hooks/useStitchPreviewReady";
import { authFetch, readApiJson } from "../../lib/api";
import { cn } from "../../lib/utils";
import { WL_DIRECTOR_CLASSES, WIRELINE_STITCH_UI } from "../../lib/wireline-director-design";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Input } from "../ui/shadcn/Input";
import { useToast } from "../../contexts/ToastContext";
import {
  useDesignIntegrations,
  type DesignIntegrationProvider,
} from "../../hooks/useDesignIntegrations";

export interface DirectorStitchPreviewStudioProps {
  preview: DirectorPreviewMeta;
  onSuggestEdit?: (prompt: string) => void;
  disabled?: boolean;
  /** First tab when the studio opens — screenshot matches Stitch web fidelity. */
  defaultTab?: "preview" | "screenshot" | "export";
  /** Immersive fills the Painter preview pane — larger iframe, desktop width. */
  layout?: "default" | "immersive";
  className?: string;
}

type StitchTab = "preview" | "screenshot" | "code" | "export";

interface GithubRepoSummary {
  fullName: string;
  defaultBranch: string;
}

const CONNECT_LABEL_BY_PROVIDER: Record<DesignIntegrationProvider, string> = {
  figma: WIRELINE_STITCH_UI.connectFigmaLabel,
  canva: WIRELINE_STITCH_UI.connectCanvaLabel,
  github: WIRELINE_STITCH_UI.connectGithubLabel,
};

function parseContentDispositionFilename(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = header.match(/filename="([^"]+)"/i);
  return match?.[1];
}

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
  immersive,
}: {
  device?: DirectorPreviewMeta["deviceType"];
  children: React.ReactNode;
  fullHeight?: boolean;
  immersive?: boolean;
}) {
  const isMobile = !immersive && device === "MOBILE";
  const isTablet = !immersive && device === "TABLET";
  const isDesktop = !immersive && device === "DESKTOP";
  return (
    <div
      className={cn(
        "wl-stitch-device mx-auto transition-all duration-300",
        isMobile && "wl-stitch-device--mobile",
        isTablet && "wl-stitch-device--tablet",
        isDesktop && "wl-stitch-device--desktop",
        !isMobile && !isTablet && !isDesktop && !immersive && "wl-stitch-device--desktop",
        fullHeight && "wl-stitch-device--studio",
        immersive && "wl-stitch-device--immersive",
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
        className={cn(
          "wl-stitch-device-screen",
          fullHeight && "wl-stitch-device-screen--studio",
          immersive && "wl-stitch-device-screen--immersive",
        )}
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
        <p className="wl-micro-meta--muted mt-1">{timeLabel} elapsed</p>
      </div>
      {elapsedMs > 15_000 && (
        <p className="wl-micro-meta--muted">{WIRELINE_STITCH_UI.loadingHint}</p>
      )}
    </div>
  );
}

export default function DirectorStitchPreviewStudio({
  preview,
  onSuggestEdit,
  disabled,
  defaultTab,
  layout = "default",
  className,
}: DirectorStitchPreviewStudioProps) {
  const immersive = layout === "immersive";
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
  const [githubRepos, setGithubRepos] = useState<GithubRepoSummary[]>([]);
  const [selectedRepo, setSelectedRepo] = useState("");
  const [iframeFailed, setIframeFailed] = useState(false);
  const [deviceOverride, setDeviceOverride] = useState<DirectorPreviewMeta["deviceType"] | "AUTO">(
    "AUTO",
  );
  const [wireframeMode, setWireframeMode] = useState(false);
  const [codeSource, setCodeSource] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const effectiveDeviceType = useMemo(() => {
    if (deviceOverride === "AUTO") {
      return preview.deviceType;
    }
    return deviceOverride;
  }, [deviceOverride, preview.deviceType]);
  const iframeFailTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { error: toastError, success: toastSuccess, warning: toastWarning } = useToast();
  const reduceMotion = useReducedMotion();

  const hasExportableArtifact = Boolean(ready.htmlArtifactId || ready.imageArtifactId);

  const handleIntegrationConnected = useCallback(
    (provider: DesignIntegrationProvider) => {
      toastSuccess(
        "Connected",
        `${CONNECT_LABEL_BY_PROVIDER[provider] ?? provider} is ready for export.`,
      );
    },
    [toastSuccess],
  );
  const handleConnectError = useCallback(
    (_provider: DesignIntegrationProvider, message: string) => {
      toastError("Connection failed", message);
    },
    [toastError],
  );
  const handlePopupBlocked = useCallback(() => {
    toastWarning("Popup blocked", "Allow popups for this site to connect your account.");
  }, [toastWarning]);

  const { integrations, connectBusy, connectIntegration } = useDesignIntegrations({
    onConnected: handleIntegrationConnected,
    onConnectError: handleConnectError,
    onPopupBlocked: handlePopupBlocked,
  });
  const githubConnected = integrations.some((i) => i.provider === "github" && i.connected);

  const refreshGithubRepos = useCallback(async () => {
    try {
      const r = await authFetch("/api/design/github/repos");
      const out = await readApiJson<{ repos?: GithubRepoSummary[] }>(r);
      if (out.ok === false) return;
      const repos = out.data.repos ?? [];
      setGithubRepos(repos);
      setSelectedRepo((prev) => prev || repos[0]?.fullName || "");
    } catch {
      setGithubRepos([]);
    }
  }, []);

  useEffect(() => {
    if (!githubConnected) {
      setGithubRepos([]);
      setSelectedRepo("");
      return;
    }
    void refreshGithubRepos();
  }, [githubConnected, refreshGithubRepos]);

  const buildExportPayload = useCallback(() => {
    return {
      title: preview.title,
      deviceType: preview.deviceType,
      htmlArtifactId: ready.htmlArtifactId,
      imageArtifactId: ready.imageArtifactId,
      renderId: preview.renderId,
      conceptId: preview.conceptId,
    };
  }, [preview, ready]);

  const downloadZipExport = useCallback(
    async (endpoint: string, busyKey: string, fallbackFileName: string) => {
      setExportBusy((prev) => ({ ...prev, [busyKey]: true }));
      try {
        const r = await authFetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildExportPayload()),
        });
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
          throw new Error(body.error || body.message || "Export failed");
        }
        const blob = await r.blob();
        const fileName =
          parseContentDispositionFilename(r.headers.get("Content-Disposition")) || fallbackFileName;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        URL.revokeObjectURL(url);
        toastSuccess("Export ready", fileName);
      } catch (e) {
        toastError("Export failed", e instanceof Error ? e.message : "Could not export design.");
      } finally {
        setExportBusy((prev) => {
          const next = { ...prev };
          delete next[busyKey];
          return next;
        });
      }
    },
    [buildExportPayload, toastError, toastSuccess],
  );

  const sendToCanva = useCallback(async () => {
    const busyKey = "canva";
    setExportBusy((prev) => ({ ...prev, [busyKey]: true }));
    try {
      const r = await authFetch("/api/design/export/canva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildExportPayload()),
      });
      const out = await readApiJson<{ message?: string; editUrl?: string; error?: string }>(r);
      if (out.ok === false) throw new Error(out.error);
      toastSuccess("Sent to Canva", out.data.message || "Marketing creative is ready in Canva.");
      if (out.data.editUrl) {
        window.open(out.data.editUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      toastError(
        "Canva export failed",
        e instanceof Error ? e.message : "Could not send to Canva.",
      );
    } finally {
      setExportBusy((prev) => {
        const next = { ...prev };
        delete next[busyKey];
        return next;
      });
    }
  }, [buildExportPayload, toastError, toastSuccess]);

  const createGithubPr = useCallback(async () => {
    if (!selectedRepo) {
      toastError("Repository required", "Connect GitHub and pick a repository first.");
      return;
    }
    const busyKey = "github-pr";
    setExportBusy((prev) => ({ ...prev, [busyKey]: true }));
    try {
      const r = await authFetch("/api/design/export/github-pr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildExportPayload(),
          repoFullName: selectedRepo,
          prTitle: `Wireline Design: ${preview.title}`,
        }),
      });
      const out = await readApiJson<{ prUrl?: string; error?: string; message?: string }>(r);
      if (out.ok === false) throw new Error(out.error);
      toastSuccess("Pull request created", "Your design handoff PR is ready on GitHub.");
      if (out.data.prUrl) {
        window.open(out.data.prUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      toastError(
        "GitHub PR failed",
        e instanceof Error ? e.message : "Could not create pull request.",
      );
    } finally {
      setExportBusy((prev) => {
        const next = { ...prev };
        delete next[busyKey];
        return next;
      });
    }
  }, [buildExportPayload, preview.title, selectedRepo, toastError, toastSuccess]);

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
    if (iframeFailTimerRef.current) clearTimeout(iframeFailTimerRef.current);
    iframeFailTimerRef.current = setTimeout(() => {
      setIframeFailed(true);
    }, 25_000);
    return () => {
      if (iframeFailTimerRef.current) clearTimeout(iframeFailTimerRef.current);
    };
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

  // Reset cached source when the underlying render changes.
  useEffect(() => {
    setCodeSource(null);
    setCodeError(false);
    setCodeCopied(false);
  }, [preview.conceptId, ready.htmlSrc]);

  // Lazily fetch HTML source the first time the Code tab is opened.
  useEffect(() => {
    if (tab !== "code") return;
    if (codeSource !== null || codeLoading) return;
    const src = ready.htmlSrc;
    if (!src) return;
    let cancelled = false;
    setCodeLoading(true);
    setCodeError(false);
    void (async () => {
      try {
        // Only attach cookies for first-party URLs; blob:/data:/cross-origin
        // signed URLs must not send credentials (avoids CORS credential errors).
        const sameOrigin =
          src.startsWith("/") ||
          (typeof window !== "undefined" && src.startsWith(window.location.origin));
        const res = await fetch(src, sameOrigin ? { credentials: "include" } : {});
        if (!res.ok) throw new Error(`Source fetch failed (${res.status})`);
        const text = await res.text();
        if (!cancelled) setCodeSource(text);
      } catch {
        if (!cancelled) setCodeError(true);
      } finally {
        if (!cancelled) setCodeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, codeSource, codeLoading, ready.htmlSrc]);

  const copyCode = useCallback(async () => {
    if (!codeSource) return;
    try {
      await navigator.clipboard.writeText(codeSource);
      setCodeCopied(true);
      toastSuccess("Code copied", "HTML source is on your clipboard.");
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      toastError("Copy failed", "Select the code and copy manually.");
    }
  }, [codeSource, toastError, toastSuccess]);

  const openFullScreen = useCallback(() => {
    const src = tab === "screenshot" ? ready.imageSrc : ready.htmlSrc;
    if (!src) return;
    window.open(src, "_blank", "noopener,noreferrer");
  }, [ready.htmlSrc, ready.imageSrc, tab]);

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
      list.push({ id: "code", label: WIRELINE_STITCH_UI.codeTabLabel, icon: Code2 });
    }
    list.push({ id: "export", label: "Export", icon: Download });
    return list;
  }, [hasRenderableHtml, hasRenderableImage]);

  const canExpand =
    (tab === "preview" && Boolean(ready.htmlSrc)) ||
    (tab === "screenshot" && Boolean(ready.imageSrc));

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
            className="h-auto px-2.5 py-1 wl-label text-brand hover:text-brand-deep"
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
          <span className="wl-micro-meta--muted/60 font-mono tabular-nums">
            {deviceLabel(preview.deviceType)}
          </span>
        </span>
        <p className="text-[12px] text-ink font-medium truncate max-w-[min(100%,20rem)]">
          {preview.title}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex flex-nowrap gap-1 p-1 rounded-md bg-black/[0.03] dark:bg-white/[0.04] border border-brand/10 overflow-x-auto">
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
                  "h-auto shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md wl-micro-meta font-semibold transition-all",
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

        {/* Viewport & Wireframe Toolbar */}
        {(tab === "preview" || tab === "screenshot") && (
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-md bg-black/[0.03] dark:bg-white/[0.04] border border-brand/10 self-start sm:self-auto">
            {/* Viewport override buttons */}
            <div className="flex items-center gap-0.5">
              {(
                [
                  { id: "AUTO", label: "Auto", icon: Layers },
                  { id: "DESKTOP", label: "Desktop", icon: Monitor },
                  { id: "TABLET", label: "Tablet", icon: Tablet },
                  { id: "MOBILE", label: "Mobile", icon: Smartphone },
                ] as const
              ).map((d) => {
                const Icon = d.icon;
                const selected = deviceOverride === d.id;
                return (
                  <ShadButton
                    key={d.id}
                    type="button"
                    variant="ghost"
                    onClick={() => setDeviceOverride(d.id)}
                    title={`View as ${d.label}`}
                    className={cn(
                      "h-7 w-7 p-0 shrink-0 flex items-center justify-center rounded-md transition-all",
                      selected
                        ? "bg-paper dark:bg-velvet/80 text-brand shadow-sm border border-brand/20"
                        : "text-muted hover:text-ink hover:bg-paper/60",
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="sr-only">{d.label}</span>
                  </ShadButton>
                );
              })}
            </div>

            {/* Separator */}
            <div className="w-[1px] h-4 bg-brand/20" />

            {/* Wireframe toggle */}
            <ShadButton
              type="button"
              variant="ghost"
              onClick={() => setWireframeMode(!wireframeMode)}
              title={
                wireframeMode
                  ? "Switch to Interactive Prototype Mode"
                  : "Switch to Low-Fidelity Wireframe Mode"
              }
              className={cn(
                "h-7 px-2 shrink-0 flex items-center gap-1.5 rounded-md transition-all wl-micro-meta font-semibold",
                wireframeMode
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                  : "text-muted hover:text-ink hover:bg-paper/60",
              )}
            >
              {wireframeMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{wireframeMode ? "Wireframe" : "Prototype"}</span>
            </ShadButton>

            {/* Separator */}
            <div className="w-[1px] h-4 bg-brand/20" />

            {/* Expand to full screen */}
            <ShadButton
              type="button"
              variant="ghost"
              disableAnimations
              onClick={openFullScreen}
              disabled={!canExpand}
              title={WIRELINE_STITCH_UI.expandLabel}
              className="h-7 w-7 p-0 shrink-0 flex items-center justify-center rounded-md text-muted hover:text-ink hover:bg-paper/60 transition-all disabled:opacity-40"
            >
              <Expand className="w-3.5 h-3.5" />
              <span className="sr-only">{WIRELINE_STITCH_UI.expandLabel}</span>
            </ShadButton>
          </div>
        )}
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
            <DeviceChrome device={effectiveDeviceType} fullHeight immersive={immersive}>
              <div
                className={cn(
                  "relative flex items-center justify-center p-2",
                  immersive ? "min-h-[min(78vh,920px)]" : "min-h-[min(70vh,640px)]",
                )}
              >
                <img
                  src={ready.imageSrc}
                  alt={preview.title}
                  className={cn(
                    "max-h-[min(70vh,640px)] w-full object-contain object-top transition-all duration-300",
                    wireframeMode && "grayscale contrast-[1.1] brightness-[1.05]",
                  )}
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
            <DeviceChrome device={effectiveDeviceType} fullHeight immersive={immersive}>
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
                    className="h-auto px-2.5 py-1 wl-label text-brand hover:text-brand-deep"
                  >
                    View screenshot instead
                  </ShadButton>
                </div>
              ) : (
                <iframe
                  title={`${WIRELINE_STITCH_UI.previewTabLabel} — ${preview.title}`}
                  src={ready.htmlSrc}
                  className={cn(
                    "wl-stitch-live-iframe wl-stitch-live-iframe--studio transition-all duration-300",
                    immersive && "wl-stitch-live-iframe--immersive",
                    wireframeMode && "grayscale contrast-[1.1] brightness-[1.05]",
                  )}
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  referrerPolicy="no-referrer"
                  allow="fullscreen"
                  onLoad={() => {
                    if (iframeFailTimerRef.current) {
                      clearTimeout(iframeFailTimerRef.current);
                      iframeFailTimerRef.current = null;
                    }
                  }}
                />
              )}
            </DeviceChrome>
          )}

          {tab === "code" && hasRenderableHtml && (
            <div className="wl-stitch-code">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-brand/12 bg-black/[0.03] dark:bg-white/[0.04]">
                <span className="inline-flex items-center gap-1.5 wl-micro-meta--muted font-mono">
                  <Code2 className="w-3.5 h-3.5 text-brand/70" aria-hidden />
                  {WIRELINE_STITCH_UI.codeSourceFileName}
                </span>
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  disableAnimations
                  onClick={() => void copyCode()}
                  disabled={!codeSource}
                  className="h-7 px-2.5 gap-1.5 wl-micro-meta font-semibold text-brand hover:text-brand-deep hover:bg-brand/8 disabled:opacity-40"
                >
                  {codeCopied ? (
                    <Check className="w-3.5 h-3.5" aria-hidden />
                  ) : (
                    <Copy className="w-3.5 h-3.5" aria-hidden />
                  )}
                  {codeCopied ? WIRELINE_STITCH_UI.copiedLabel : WIRELINE_STITCH_UI.copyCodeLabel}
                </ShadButton>
              </div>
              <div
                className={cn(
                  "wl-stitch-code-scroll overflow-auto",
                  immersive ? "max-h-[min(78vh,920px)]" : "max-h-[min(70vh,640px)]",
                )}
              >
                {codeLoading ? (
                  <div className="flex items-center justify-center gap-2 py-16 text-muted">
                    <Loader2 className="w-4 h-4 animate-spin text-brand/60" aria-hidden />
                    <span className="text-[12px]">{WIRELINE_STITCH_UI.codeLoadingLabel}</span>
                  </div>
                ) : codeError || !codeSource ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
                    <p className="text-[12px] text-muted max-w-xs leading-relaxed">
                      {WIRELINE_STITCH_UI.codeErrorLabel}
                    </p>
                    <ShadButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disableAnimations
                      onClick={() => {
                        setCodeSource(null);
                        setCodeError(false);
                      }}
                      className="h-auto px-2.5 py-1 wl-label text-brand hover:text-brand-deep"
                    >
                      <RefreshCw className="w-3 h-3" aria-hidden />
                      {WIRELINE_STITCH_UI.codeRetryLabel}
                    </ShadButton>
                  </div>
                ) : (
                  <ol
                    className="wl-stitch-code-pre"
                    aria-label={WIRELINE_STITCH_UI.codeSourceFileName}
                  >
                    {codeSource.split("\n").map((line, i) => (
                      <li key={i} className="wl-stitch-code-line">
                        <span className="wl-stitch-code-ln" aria-hidden>
                          {i + 1}
                        </span>
                        <code className="wl-stitch-code-text">{line || "\u00A0"}</code>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}

          {tab === "export" && (
            <div className="p-4 sm:p-5 space-y-4">
              <div>
                <p className="text-[12px] text-ink font-medium">{preview.title}</p>
                <p className="wl-micro-meta--muted leading-relaxed mt-1">
                  {WIRELINE_STITCH_UI.exportBlurb}
                </p>
              </div>

              <div className="space-y-2">
                <p
                  className={cn(
                    WL_DIRECTOR_CLASSES.metaCaption,
                    "text-muted-foreground font-medium uppercase tracking-wide",
                  )}
                >
                  Connected apps
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["figma", "canva", "github"] as const).map((provider) => {
                    const status = integrations.find((i) => i.provider === provider);
                    const connected = Boolean(status?.connected);
                    const label = CONNECT_LABEL_BY_PROVIDER[provider];
                    return (
                      <ShadButton
                        key={provider}
                        type="button"
                        variant={connected ? "outline" : "default"}
                        size="sm"
                        disableAnimations
                        disabled={connectBusy === provider || connected}
                        onClick={() => void connectIntegration(provider)}
                        className="h-auto gap-1.5 touch-press"
                      >
                        {connectBusy === provider ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                        ) : provider === "github" ? (
                          <Github className="w-3.5 h-3.5" aria-hidden />
                        ) : (
                          <Link2 className="w-3.5 h-3.5" aria-hidden />
                        )}
                        {connected
                          ? `${label} · ${status?.connectedAccount || "connected"}`
                          : label}
                      </ShadButton>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p
                  className={cn(
                    WL_DIRECTOR_CLASSES.metaCaption,
                    "text-muted-foreground font-medium uppercase tracking-wide",
                  )}
                >
                  Handoff lanes
                </p>
                <div className="flex flex-wrap gap-2">
                  <ShadButton
                    type="button"
                    onClick={() =>
                      void downloadZipExport(
                        "/api/design/export/figma",
                        "figma",
                        "wireline-figma-export.zip",
                      )
                    }
                    disabled={!hasExportableArtifact || Boolean(exportBusy.figma)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md wl-micro-meta font-semibold bg-brand text-white hover:bg-brand-deep transition-colors h-auto disabled:opacity-60"
                  >
                    {exportBusy.figma ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    {WIRELINE_STITCH_UI.exportFigmaLabel}
                  </ShadButton>
                  <ShadButton
                    type="button"
                    onClick={() =>
                      void downloadZipExport(
                        "/api/design/export/react",
                        "react",
                        "wireline-react-export.zip",
                      )
                    }
                    disabled={!hasExportableArtifact || Boolean(exportBusy.react)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md wl-micro-meta font-semibold border border-brand/25 text-brand bg-brand/5 hover:bg-brand/10 h-auto disabled:opacity-60"
                  >
                    {exportBusy.react ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    {WIRELINE_STITCH_UI.exportReactLabel}
                  </ShadButton>
                  <ShadButton
                    type="button"
                    onClick={() => void sendToCanva()}
                    disabled={!ready.imageArtifactId || Boolean(exportBusy.canva)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md wl-micro-meta font-semibold border border-black/10 hover:border-brand/20 h-auto disabled:opacity-60"
                  >
                    {exportBusy.canva ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5" />
                    )}
                    {WIRELINE_STITCH_UI.exportCanvaLabel}
                  </ShadButton>
                </div>
                <p className="wl-micro-meta--muted">{WIRELINE_STITCH_UI.exportCanvaHint}</p>
                {githubConnected && (
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <label className="sr-only" htmlFor="design-github-repo">
                      GitHub repository
                    </label>
                    <Input
                      id="design-github-repo"
                      value={selectedRepo}
                      onChange={(e) => setSelectedRepo(e.target.value)}
                      list="design-github-repo-options"
                      placeholder="owner/repo"
                      className="h-9 text-[12px] sm:max-w-xs"
                    />
                    <datalist id="design-github-repo-options">
                      {githubRepos.map((repo) => (
                        <option key={repo.fullName} value={repo.fullName} />
                      ))}
                    </datalist>
                    <ShadButton
                      type="button"
                      variant="outline"
                      size="sm"
                      disableAnimations
                      onClick={() => void createGithubPr()}
                      disabled={
                        !hasExportableArtifact || !selectedRepo || Boolean(exportBusy["github-pr"])
                      }
                      className="h-auto gap-1.5 touch-press shrink-0"
                    >
                      {exportBusy["github-pr"] ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Github className="w-3.5 h-3.5" aria-hidden />
                      )}
                      {WIRELINE_STITCH_UI.exportGithubPrLabel}
                    </ShadButton>
                  </div>
                )}
              </div>

              <div className="space-y-2 pt-1 border-t border-brand/10">
                <p
                  className={cn(
                    WL_DIRECTOR_CLASSES.metaCaption,
                    "text-muted-foreground font-medium uppercase tracking-wide",
                  )}
                >
                  Raw artifacts
                </p>
                <div className="flex flex-wrap gap-2">
                  {ready.htmlArtifactId && (
                    <ShadButton
                      type="button"
                      onClick={() => void openArtifactDownload(ready.htmlArtifactId, false)}
                      disabled={Boolean(exportBusy[ready.htmlArtifactId])}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md wl-micro-meta font-semibold border border-brand/25 text-brand bg-brand/5 hover:bg-brand/10 h-auto disabled:opacity-60"
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
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md wl-micro-meta font-semibold border border-black/10 hover:border-brand/20 h-auto disabled:opacity-60"
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
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md wl-micro-meta font-semibold border border-black/10 hover:border-brand/20 h-auto disabled:opacity-60"
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
              className="px-2.5 py-1 rounded-full wl-micro-meta font-medium border border-brand/15 bg-brand/[0.04] text-brand-deep hover:bg-brand/10 hover:border-brand/25 shrink-0 max-w-[280px] truncate"
            >
              {prompt}
            </ShadButton>
          ))}
        </div>
      )}
    </div>
  );
}
