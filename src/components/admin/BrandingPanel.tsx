/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useId } from "react";
import { Bot, Zap } from "lucide-react";
import { Input } from "../atoms/Input";
import { AdminSaveBar } from "./AdminSaveBar";
import { OPS_ADMIN, WL_ADMIN_CLASSES } from "../../lib/wireline-ops-design";
import { BRAND } from "../../constants/brand-colors";

interface BrandingPanelProps {
  settings: any;
  onUpdate: (s: any) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

export function BrandingPanel({ settings, onUpdate, onSave, isSaving }: BrandingPanelProps) {
  const baseId = useId();
  const nameId = `${baseId}-brand-name`;
  const logoId = `${baseId}-brand-logo`;
  const colorId = `${baseId}-brand-color`;
  const colorTextId = `${baseId}-brand-color-text`;

  return (
    <div className="flex flex-col gap-5">
      <div
        className={`client-panel rounded-md wl-panel border border-input ${WL_ADMIN_CLASSES.panel}`}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 text-primary shadow-sm shadow-primary/10 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="app-form-eyebrow text-primary">Appearance</p>
            <h3 className="font-display text-lg text-foreground leading-tight">Brand Identity</h3>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label htmlFor={nameId} className="app-field-label">
                Platform Name
              </label>
              <Input
                id={nameId}
                type="text"
                placeholder="Wireline OS"
                className="app-input-soft py-3 h-auto"
                value={settings.brand_name || ""}
                onChange={(e) => onUpdate({ ...settings, brand_name: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor={logoId} className="app-field-label">
                Brand Logo URL
              </label>
              <Input
                id={logoId}
                type="text"
                placeholder="https://assets.yoursite.com/logo.png"
                className="app-input-soft py-3 h-auto"
                value={settings.brand_logo_url || ""}
                onChange={(e) => onUpdate({ ...settings, brand_logo_url: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor={colorId} className="app-field-label">
                Primary Color
              </label>
              <div className="flex gap-2.5">
                <Input
                  id={colorId}
                  type="color"
                  aria-label="Primary color swatch"
                  className="brand-color-swatch w-11 h-11 rounded-md bg-transparent border-input cursor-pointer p-0"
                  value={settings.primary_color || BRAND.colors.primary}
                  onChange={(e) => onUpdate({ ...settings, primary_color: e.target.value })}
                />
                <Input
                  id={colorTextId}
                  type="text"
                  aria-label="Primary color hex value"
                  className="app-input-soft flex-1 py-3 h-auto font-mono"
                  value={settings.primary_color || BRAND.colors.primary}
                  onChange={(e) => onUpdate({ ...settings, primary_color: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="preview-panel flex flex-col items-center justify-center p-5 border border-input bg-white/25 rounded-md">
            <p className="app-form-eyebrow text-foreground mb-5">Preview</p>
            <div
              className="brand-preview-card w-full p-5 rounded-md bg-card relative overflow-hidden group"
              data-brand-color={settings.primary_color}
            >
              <div className="absolute inset-0 opacity-10 pointer-events-none brand-preview-accent-bg" />
              <div className="flex items-center gap-3 mb-4">
                {settings.brand_logo_url ? (
                  <img
                    src={settings.brand_logo_url}
                    className="w-6 h-6 object-contain"
                    alt="Logo"
                    loading="lazy"
                    decoding="async"
                    width={24}
                    height={24}
                  />
                ) : (
                  <Zap className="w-6 h-6 wl-brand-text" />
                )}
                <span className="font-display uppercase tracking-widest text-sm wl-brand-text">
                  {settings.brand_name || "WIRELINE"}
                </span>
              </div>
              <div className="space-y-2">
                <div className="h-2 w-full rounded-full bg-ink/5" />
                <div className="h-2 w-2/3 rounded-full bg-ink/5" />
              </div>
              <div className="mt-6 flex justify-end">
                <div className="px-3.5 py-2 rounded-full wl-label font-bold wl-brand-bg">
                  Action
                </div>
              </div>
            </div>
          </div>
        </div>

        {onSave && (
          <AdminSaveBar
            onClick={onSave}
            isSaving={!!isSaving}
            label={OPS_ADMIN.saveLabels.branding}
            fullWidth
          />
        )}
      </div>
    </div>
  );
}
