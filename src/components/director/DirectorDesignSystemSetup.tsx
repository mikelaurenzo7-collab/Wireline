/**
 * Design system setup panel — company blurb, style notes, and brand assets.
 * WORLD-CLASS PREMIUM EDITION (Aurora Cream style system).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Trash2,
  Figma,
  Globe,
  SwatchBook,
  CheckCircle2,
  FileCode,
  Type,
  UploadCloud,
  Lock,
  Sparkles,
  Image,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { authFetch } from "../../lib/api";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Input } from "../ui/shadcn/Input";
import { Textarea } from "../ui/shadcn/Textarea";
import { Medallion } from "../ui/Medallion";
import { WIRELINE_STITCH_UI } from "../../lib/wireline-director-design";

export interface DesignProfileAsset {
  id: string;
  name: string;
  mimeType: string;
  role: string;
  sizeBytes: number;
  previewUrl?: string;
}

export interface DesignProfileState {
  companyBlurb: string;
  styleNotes: string;
  assets: DesignProfileAsset[];
  tokenManifest?: Record<string, unknown>;
  configured: boolean;
}

interface DirectorDesignSystemSetupProps {
  onConfiguredChange?: (configured: boolean) => void;
}

const EMPTY_PROFILE: DesignProfileState = {
  companyBlurb: "",
  styleNotes: "",
  assets: [],
  configured: false,
};

const STYLE_NOTES_PRESETS = [
  {
    label: "Glassmorphism",
    value: "with a glassmorphic aesthetic, subtle backdrop blurs, and translucent panels",
  },
  {
    label: "Neobrutalism",
    value: "styled with high-contrast neobrutalist layout, thick borders, and stark shadows",
  },
  {
    label: "Dark Luxury",
    value: "designed as a premium dark mode dashboard with gold accents and high-end typography",
  },
  {
    label: "Minimalist SaaS",
    value: "in a clean, modern SaaS aesthetic, ample whitespace, and thin neutral dividers",
  },
  {
    label: "Editorial Luxe",
    value:
      "with magazine-grade editorial typography, oversized serif display headlines, and generous asymmetric whitespace",
  },
];

const FIGMA_STEPS = [
  "Connecting to Figma API...",
  "Retrieving document nodes...",
  "Compiling color and text styles...",
  "Vectorizing logo components...",
];

const CRAWL_STEPS = [
  "Establishing secure connection...",
  "Crawling HTML structure...",
  "Extracting asset endpoints...",
  "Parsing style variable configurations...",
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getAssetIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "css") return <FileCode className="w-4 h-4 text-brand" />;
  if (ext === "woff2" || ext === "woff" || ext === "ttf")
    return <Type className="w-4 h-4 text-brand" />;
  return <Image className="w-4 h-4 text-brand" />;
}

export function DirectorDesignSystemSetup({ onConfiguredChange }: DirectorDesignSystemSetupProps) {
  const [profile, setProfile] = useState<DesignProfileState>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importingFigma, setImportingFigma] = useState(false);
  const [importingWebsite, setImportingWebsite] = useState(false);
  const [figmaImportUrl, setFigmaImportUrl] = useState("");
  const [websiteImportUrl, setWebsiteImportUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSavedFeedback, setShowSavedSuccess] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Status sequence feedback steps
  const [figmaStepIndex, setFigmaStepIndex] = useState(0);
  const [crawlStepIndex, setCrawlStepIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const blurbRef = useRef(profile.companyBlurb);
  const notesRef = useRef(profile.styleNotes);

  // Rotation timers for high-fidelity loaders
  useEffect(() => {
    if (!importingFigma) {
      setFigmaStepIndex(0);
      return;
    }
    const id = setInterval(() => {
      setFigmaStepIndex((prev) => (prev + 1) % FIGMA_STEPS.length);
    }, 2000);
    return () => clearInterval(id);
  }, [importingFigma]);

  useEffect(() => {
    if (!importingWebsite) {
      setCrawlStepIndex(0);
      return;
    }
    const id = setInterval(() => {
      setCrawlStepIndex((prev) => (prev + 1) % CRAWL_STEPS.length);
    }, 2000);
    return () => clearInterval(id);
  }, [importingWebsite]);

  const applyProfile = useCallback(
    (next: DesignProfileState) => {
      setProfile(next);
      blurbRef.current = next.companyBlurb;
      notesRef.current = next.styleNotes;
      onConfiguredChange?.(next.configured);
    },
    [onConfiguredChange],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await authFetch("/api/design/profile");
        if (!r.ok) throw new Error("Failed to load design profile");
        const data = (await r.json()) as { profile: DesignProfileState };
        if (!cancelled) applyProfile(data.profile);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyProfile]);

  const persistPatch = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await authFetch("/api/design/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyBlurb: blurbRef.current,
          styleNotes: notesRef.current,
        }),
      });
      if (!r.ok) throw new Error("Failed to save design profile");
      const data = (await r.json()) as { profile: DesignProfileState };
      applyProfile(data.profile);
      setShowSavedSuccess(true);
      const timer = setTimeout(() => setShowSavedSuccess(false), 2000);
      return () => clearTimeout(timer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [applyProfile]);

  const onBlurbBlur = () => {
    if (blurbRef.current !== profile.companyBlurb) void persistPatch();
  };

  const onNotesBlur = () => {
    if (notesRef.current !== profile.styleNotes) void persistPatch();
  };

  const processAndUploadFile = async (file: File) => {
    if (/\.fig$/i.test(file.name)) {
      setError("Figma .fig files are not uploaded — export PNG/SVG instead.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          const comma = result.indexOf(",");
          resolve(comma >= 0 ? result.slice(comma + 1) : result);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });

      const r = await authFetch("/api/design/profile/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: base64,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
        }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(body.error || body.message || "Upload failed");
      }
      const data = (await r.json()) as { profile: DesignProfileState };
      applyProfile(data.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onFilePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void processAndUploadFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processAndUploadFile(file);
    }
  };

  const importFromFigma = async () => {
    const fileKeyOrUrl = figmaImportUrl.trim();
    if (!fileKeyOrUrl) return;
    setImportingFigma(true);
    setError(null);
    try {
      const r = await authFetch("/api/design/import/figma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileKeyOrUrl }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(body.error || body.message || "Figma import failed");
      }
      const profileRes = await authFetch("/api/design/profile");
      if (!profileRes.ok) throw new Error("Imported tokens but could not refresh profile");
      const data = (await profileRes.json()) as { profile: DesignProfileState };
      applyProfile(data.profile);
      setFigmaImportUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Figma import failed");
    } finally {
      setImportingFigma(false);
    }
  };

  const importFromWebsite = async () => {
    const url = websiteImportUrl.trim();
    if (!url) return;
    setImportingWebsite(true);
    setError(null);
    try {
      const r = await authFetch("/api/design/import/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
        throw new Error(body.error || body.message || "Website import failed");
      }
      const profileRes = await authFetch("/api/design/profile");
      if (!profileRes.ok) throw new Error("Imported brand but could not refresh profile");
      const data = (await profileRes.json()) as { profile: DesignProfileState };
      applyProfile(data.profile);
      setWebsiteImportUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Website import failed");
    } finally {
      setImportingWebsite(false);
    }
  };

  const removeAsset = async (assetId: string) => {
    setError(null);
    try {
      const r = await authFetch(`/api/design/profile/assets/${encodeURIComponent(assetId)}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("Failed to remove asset");
      const data = (await r.json()) as { profile: DesignProfileState };
      applyProfile(data.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove asset");
    }
  };

  const handleAppendStyleNote = (noteValue: string) => {
    const current = notesRef.current.trim();
    const delimiter = current ? (current.endsWith(".") ? " " : ". ") : "";
    const nextValue = `${current}${delimiter}${noteValue}`;
    notesRef.current = nextValue;
    setProfile((prev) => ({ ...prev, styleNotes: nextValue }));
    void persistPatch();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-brand" aria-hidden />
        <span className="wl-micro-meta text-brand font-medium animate-pulse">
          Synchronizing Brand Kit…
        </span>
      </div>
    );
  }

  return (
    <div className="wl-design-setup-panel space-y-4">
      {/* Editorial Header */}
      <div className="flex flex-col gap-3 pb-2 border-b border-brand/10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Medallion size="md" withHalo variant="signature" shimmer className="shrink-0">
              <SwatchBook className="w-4 h-4 text-white" />
            </Medallion>
            <div className="min-w-0">
              <p className="font-display italic text-base text-ink font-semibold tracking-tight">
                {WIRELINE_STITCH_UI.brandKitTitle}
              </p>
              <p className="wl-micro-meta--muted-foreground mt-0.5 leading-relaxed">
                {WIRELINE_STITCH_UI.designSystemSetupHint}
              </p>
            </div>
          </div>
        </div>

        {profile.configured && (
          <div
            className="inline-flex self-start items-center gap-1.5 px-2.5 py-1 rounded-full wl-label bg-brand/8 text-brand border border-brand/15 shadow-sm shadow-brand/5 animate-in fade-in zoom-in-95 duration-300"
            role="status"
          >
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/50 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand"></span>
            </span>
            {WIRELINE_STITCH_UI.designSystemSetupConfiguredLabel}
          </div>
        )}
      </div>

      {/* Figma and Website Crawl Deck — Dual viewport layout optimization */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:grid-cols-1">
        {/* Figma card */}
        <div className="group relative rounded-md border border-brand/10 p-3 bg-paper/40 dark:bg-velvet/20 transition-all duration-200 hover:border-brand/20 hover:shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-md bg-brand/8 text-brand">
              <Figma className="w-3.5 h-3.5" />
            </span>
            <p className="wl-label text-ink font-bold">{WIRELINE_STITCH_UI.importFigmaLabel}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={figmaImportUrl}
              onChange={(e) => setFigmaImportUrl(e.target.value)}
              placeholder={WIRELINE_STITCH_UI.importFigmaPlaceholder}
              className="h-9 text-xs flex-1 bg-white/40 border-brand/8 focus-visible:ring-brand/40"
              disabled={importingFigma || importingWebsite || uploading || saving}
            />
            <ShadButton
              type="button"
              variant="ghost"
              size="sm"
              disableAnimations
              disabled={!figmaImportUrl.trim() || importingFigma || importingWebsite}
              onClick={() => void importFromFigma()}
              className={cn(
                "touch-press shrink-0 h-9 px-3.5 wl-label font-bold rounded-md border border-brand/15 text-brand bg-brand/5 hover:bg-brand/10 hover:border-brand/35",
                importingFigma && "opacity-80",
              )}
            >
              {importingFigma ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                  Syncing…
                </>
              ) : (
                "Sync"
              )}
            </ShadButton>
          </div>
          {importingFigma && (
            <p className="wl-micro-meta text-brand font-medium animate-pulse mt-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {FIGMA_STEPS[figmaStepIndex]}
            </p>
          )}
        </div>

        {/* Website crawler card */}
        <div className="group relative rounded-md border border-brand/10 p-3 bg-paper/40 dark:bg-velvet/20 transition-all duration-200 hover:border-brand/20 hover:shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex w-6 h-6 shrink-0 items-center justify-center rounded-md bg-brand/8 text-brand">
              <Globe className="w-3.5 h-3.5" />
            </span>
            <p className="wl-label text-ink font-bold">{WIRELINE_STITCH_UI.importWebsiteLabel}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={websiteImportUrl}
              onChange={(e) => setWebsiteImportUrl(e.target.value)}
              placeholder={WIRELINE_STITCH_UI.importWebsitePlaceholder}
              className="h-9 text-xs flex-1 bg-white/40 border-brand/8 focus-visible:ring-brand/40"
              disabled={importingFigma || importingWebsite || uploading || saving}
            />
            <ShadButton
              type="button"
              variant="ghost"
              size="sm"
              disableAnimations
              disabled={!websiteImportUrl.trim() || importingFigma || importingWebsite}
              onClick={() => void importFromWebsite()}
              className={cn(
                "touch-press shrink-0 h-9 px-3.5 wl-label font-bold rounded-md border border-brand/15 text-brand bg-brand/5 hover:bg-brand/10 hover:border-brand/35",
                importingWebsite && "opacity-80",
              )}
            >
              {importingWebsite ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                  Crawling…
                </>
              ) : (
                "Crawl"
              )}
            </ShadButton>
          </div>
          {importingWebsite && (
            <p className="wl-micro-meta text-brand font-medium animate-pulse mt-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {CRAWL_STEPS[crawlStepIndex]}
            </p>
          )}
        </div>
      </div>

      {/* Inputs (Blurb & Notes) — Dual viewport layout optimization */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:grid-cols-1">
        {/* Company Blurb card */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="wl-label text-muted-foreground font-bold">
              {WIRELINE_STITCH_UI.designSystemSetupBlurbLabel}
            </span>
            <span className="wl-micro-meta font-mono text-muted-foreground/60">
              {profile.companyBlurb.length} characters
            </span>
          </div>
          <Textarea
            value={profile.companyBlurb}
            onChange={(e) => {
              blurbRef.current = e.target.value;
              setProfile((prev) => ({ ...prev, companyBlurb: e.target.value }));
            }}
            onBlur={onBlurbBlur}
            rows={3}
            placeholder={WIRELINE_STITCH_UI.designSystemSetupBlurbPlaceholder}
            className="text-xs bg-white/40 border-brand/10 focus-visible:ring-brand/40 rounded-md focus-visible:outline-none placeholder:text-muted-foreground/40 leading-relaxed"
          />
        </div>

        {/* Style Notes card */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="wl-label text-muted-foreground font-bold">
              {WIRELINE_STITCH_UI.designSystemSetupNotesLabel}
            </span>
            <span className="wl-micro-meta font-mono text-muted-foreground/60">
              {profile.styleNotes.length} characters
            </span>
          </div>
          <Textarea
            value={profile.styleNotes}
            onChange={(e) => {
              notesRef.current = e.target.value;
              setProfile((prev) => ({ ...prev, styleNotes: e.target.value }));
            }}
            onBlur={onNotesBlur}
            rows={2}
            placeholder={WIRELINE_STITCH_UI.designSystemSetupNotesPlaceholder}
            className="text-xs bg-white/40 border-brand/10 focus-visible:ring-brand/40 rounded-md focus-visible:outline-none placeholder:text-muted-foreground/40 leading-relaxed"
          />

          {/* Quick Style Chips */}
          <div className="pt-0.5 space-y-1">
            <p className="wl-label text-brand/60 font-bold">Quick Aesthetic Additions</p>
            <div className="flex flex-wrap gap-1">
              {STYLE_NOTES_PRESETS.map((preset) => (
                <ShadButton
                  key={preset.label}
                  type="button"
                  variant="ghost"
                  disableAnimations
                  onClick={() => handleAppendStyleNote(preset.value)}
                  className="h-auto px-2 py-1 wl-micro-meta font-medium rounded-md bg-brand/5 hover:bg-brand/10 border border-brand/8 text-ink hover:text-brand transition-colors shrink-0 touch-press hover:scale-[1.03]"
                >
                  + {preset.label}
                </ShadButton>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Asset Manager Dropzone */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="wl-label text-muted-foreground font-bold">
            {WIRELINE_STITCH_UI.designSystemSetupAssetsLabel}
          </span>
          {profile.assets.length > 0 && (
            <span className="wl-micro-meta font-mono text-muted-foreground/60">
              {profile.assets.length} file{profile.assets.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {/* Drag and Drop Container */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "group relative rounded-md border border-dashed p-4 text-center flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-200",
            dragActive
              ? "border-brand bg-brand/10 scale-[1.02] shadow-sm"
              : "border-brand/20 bg-brand/[0.01] hover:bg-brand/[0.03] hover:border-brand/40",
          )}
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 text-brand animate-spin" />
          ) : (
            <UploadCloud className="w-5 h-5 text-brand/40 group-hover:text-brand/70 group-hover:scale-110 transition-all duration-200" />
          )}
          <div className="space-y-0.5">
            <p className="wl-label text-ink font-bold">
              {uploading ? "Ingesting Brand Asset…" : "Drop brand files here or click"}
            </p>
            <p className="wl-micro-meta text-muted-foreground/80">
              {WIRELINE_STITCH_UI.designSystemSetupAssetsHint}
            </p>
          </div>
          <Input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg,.woff2,.css,text/css,image/*"
            className="hidden"
            onChange={onFilePick}
            disabled={uploading || saving}
          />
        </div>

        {/* Uploaded items — Responsive List */}
        {profile.assets.length > 0 && (
          <ul className="wl-design-setup-asset-list divide-y divide-brand/10">
            {profile.assets.map((asset) => (
              <li
                key={asset.id}
                className="wl-design-setup-asset-row group flex items-center justify-between gap-3 p-2 bg-paper/50 dark:bg-velvet/40 border border-brand/10 hover:border-brand/20 rounded-md transition-all"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-brand/5 border border-brand/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {asset.previewUrl ? (
                      <img src={asset.previewUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      getAssetIcon(asset.name)
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink truncate max-w-[140px] sm:max-w-[180px]">
                      {asset.name}
                    </p>
                    <p className="wl-micro-meta uppercase tracking-wider font-mono">
                      {asset.role} • {formatBytes(asset.sizeBytes)}
                    </p>
                  </div>
                </div>
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  disableAnimations
                  aria-label={`${WIRELINE_STITCH_UI.designSystemSetupRemoveAssetLabel}: ${asset.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeAsset(asset.id);
                  }}
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 rounded-md transition-all touch-press"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </ShadButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer Status and Feedback bar */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-brand/10">
        <div className="flex items-center gap-1.5 min-w-0">
          <Lock className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
          {error ? (
            <p className="wl-micro-meta text-rose-600 dark:text-rose-400 truncate" role="alert">
              {error}
            </p>
          ) : showSavedFeedback ? (
            <p className="wl-micro-meta font-bold text-brand flex items-center gap-1 animate-pulse shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Brand database updated
            </p>
          ) : (
            <span className="wl-micro-meta text-muted-foreground/60 truncate">
              Auto-saves on blur
            </span>
          )}
        </div>
        <ShadButton
          type="button"
          size="sm"
          disableAnimations
          disabled={saving || uploading}
          onClick={() => void persistPatch()}
          className="touch-press h-8 wl-label font-bold bg-brand text-white hover:bg-brand-deep border-0 px-3.5"
        >
          {saving ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
              {WIRELINE_STITCH_UI.designSystemSetupSavingLabel}
            </>
          ) : (
            WIRELINE_STITCH_UI.designSystemSetupSaveLabel
          )}
        </ShadButton>
      </div>
    </div>
  );
}
