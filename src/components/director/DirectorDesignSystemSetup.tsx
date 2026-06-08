/**
 * Design system setup panel — company blurb, style notes, and brand assets.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { authFetch } from "../../lib/api";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Input } from "../ui/shadcn/Input";
import { WIRELINE_STITCH_UI, WL_DIRECTOR_CLASSES } from "../../lib/wireline-director-design";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blurbRef = useRef(profile.companyBlurb);
  const notesRef = useRef(profile.styleNotes);

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

  const onFilePick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

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

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
        <span className="wl-micro-meta">Loading design profile…</span>
      </div>
    );
  }

  return (
    <div className="wl-design-setup-panel space-y-3">
      <div>
        <p className={cn(WL_DIRECTOR_CLASSES.metaCaption, "text-foreground font-semibold")}>
          {WIRELINE_STITCH_UI.brandKitTitle}
        </p>
        <p className="wl-micro-meta--muted-foreground mt-0.5">
          {WIRELINE_STITCH_UI.designSystemSetupHint}
        </p>
      </div>

      {profile.configured && (
        <div className="wl-design-setup-status" role="status">
          {WIRELINE_STITCH_UI.designSystemSetupConfiguredLabel}
        </div>
      )}

      <div className="space-y-2 rounded-md border border-brand/10 p-2.5 bg-brand/[0.03]">
        <p className={cn(WL_DIRECTOR_CLASSES.metaCaption, "text-muted-foreground font-medium")}>
          {WIRELINE_STITCH_UI.importFigmaLabel}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={figmaImportUrl}
            onChange={(e) => setFigmaImportUrl(e.target.value)}
            placeholder={WIRELINE_STITCH_UI.importFigmaPlaceholder}
            className="h-9 text-[12px] flex-1"
            disabled={importingFigma || importingWebsite || uploading || saving}
          />
          <ShadButton
            type="button"
            variant="outline"
            size="sm"
            disableAnimations
            disabled={!figmaImportUrl.trim() || importingFigma || importingWebsite}
            onClick={() => void importFromFigma()}
            className="touch-press shrink-0"
          >
            {importingFigma ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
            Import
          </ShadButton>
        </div>
        <p className={cn(WL_DIRECTOR_CLASSES.metaCaption, "text-muted-foreground font-medium")}>
          {WIRELINE_STITCH_UI.importWebsiteLabel}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={websiteImportUrl}
            onChange={(e) => setWebsiteImportUrl(e.target.value)}
            placeholder={WIRELINE_STITCH_UI.importWebsitePlaceholder}
            className="h-9 text-[12px] flex-1"
            disabled={importingFigma || importingWebsite || uploading || saving}
          />
          <ShadButton
            type="button"
            variant="outline"
            size="sm"
            disableAnimations
            disabled={!websiteImportUrl.trim() || importingFigma || importingWebsite}
            onClick={() => void importFromWebsite()}
            className="touch-press shrink-0"
          >
            {importingWebsite ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
            Import
          </ShadButton>
        </div>
      </div>

      <label className="block space-y-1">
        <span className={cn(WL_DIRECTOR_CLASSES.metaCaption, "text-muted-foreground font-medium")}>
          {WIRELINE_STITCH_UI.designSystemSetupBlurbLabel}
        </span>
        <textarea
          value={profile.companyBlurb}
          onChange={(e) => {
            blurbRef.current = e.target.value;
            setProfile((prev) => ({ ...prev, companyBlurb: e.target.value }));
          }}
          onBlur={onBlurbBlur}
          rows={3}
          placeholder={WIRELINE_STITCH_UI.designSystemSetupBlurbPlaceholder}
          className="wl-design-setup-textarea"
        />
      </label>

      <label className="block space-y-1">
        <span className={cn(WL_DIRECTOR_CLASSES.metaCaption, "text-muted-foreground font-medium")}>
          {WIRELINE_STITCH_UI.designSystemSetupNotesLabel}
        </span>
        <textarea
          value={profile.styleNotes}
          onChange={(e) => {
            notesRef.current = e.target.value;
            setProfile((prev) => ({ ...prev, styleNotes: e.target.value }));
          }}
          onBlur={onNotesBlur}
          rows={2}
          placeholder={WIRELINE_STITCH_UI.designSystemSetupNotesPlaceholder}
          className="wl-design-setup-textarea"
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className={cn(WL_DIRECTOR_CLASSES.metaCaption, "text-muted-foreground font-medium")}>
              {WIRELINE_STITCH_UI.designSystemSetupAssetsLabel}
            </p>
            <p className="wl-micro-meta--muted-foreground">
              {WIRELINE_STITCH_UI.designSystemSetupAssetsHint}
            </p>
          </div>
          <ShadButton
            type="button"
            variant="outline"
            size="sm"
            disableAnimations
            disabled={uploading || saving}
            onClick={() => fileInputRef.current?.click()}
            className="wl-ops-chip touch-press shrink-0"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="w-3.5 h-3.5" aria-hidden />
            )}
            {WIRELINE_STITCH_UI.designSystemSetupUploadLabel}
          </ShadButton>
          <Input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg,.woff2,.css,text/css,image/*"
            className="hidden"
            onChange={onFilePick}
          />
        </div>

        {profile.assets.length > 0 && (
          <ul className="wl-design-setup-asset-list">
            {profile.assets.map((asset) => (
              <li key={asset.id} className="wl-design-setup-asset-row">
                <div className="min-w-0">
                  <p className="wl-micro-meta font-semibold text-foreground truncate">
                    {asset.name}
                  </p>
                  <p className="wl-micro-meta--muted-foreground capitalize">{asset.role}</p>
                </div>
                <ShadButton
                  type="button"
                  variant="ghost"
                  size="icon"
                  disableAnimations
                  aria-label={`${WIRELINE_STITCH_UI.designSystemSetupRemoveAssetLabel}: ${asset.name}`}
                  onClick={() => void removeAsset(asset.id)}
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive touch-press"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </ShadButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        {error ? (
          <p className="wl-micro-meta text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <span className="wl-micro-meta--muted-foreground">Auto-saves on blur</span>
        )}
        <ShadButton
          type="button"
          size="sm"
          disableAnimations
          disabled={saving || uploading}
          onClick={() => void persistPatch()}
          className="touch-press"
        >
          {saving
            ? WIRELINE_STITCH_UI.designSystemSetupSavingLabel
            : WIRELINE_STITCH_UI.designSystemSetupSaveLabel}
        </ShadButton>
      </div>
    </div>
  );
}
