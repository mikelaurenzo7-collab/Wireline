/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { Bot, Zap, Save, Loader2 } from "lucide-react";
import { Input } from "../ui/shadcn/Input";
import { ShadButton } from "../ui/shadcn/ShadButton";

interface BrandingPanelProps {
  settings: any;
  onUpdate: (s: any) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

export function BrandingPanel({ settings, onUpdate, onSave, isSaving }: BrandingPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      <div className="client-panel p-5 md:p-6 rounded-md wl-panel border border-input">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-md bg-brand/10 border border-brand/18 text-brand shadow-sm shadow-brand/10 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="app-form-eyebrow text-brand/70">Appearance</p>
            <h3 className="font-display italic text-lg text-ink leading-tight">Brand Identity</h3>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="app-field-label">Platform Name</label>
              <Input
                type="text"
                placeholder="Wireline OS"
                className="app-input-soft py-3 h-auto"
                value={settings.brand_name || ""}
                onChange={(e) => onUpdate({ ...settings, brand_name: e.target.value })}
              />
            </div>
            <div>
              <label className="app-field-label">Brand Logo URL</label>
              <Input
                type="text"
                placeholder="https://assets.yoursite.com/logo.png"
                className="app-input-soft py-3 h-auto"
                value={settings.brand_logo_url || ""}
                onChange={(e) => onUpdate({ ...settings, brand_logo_url: e.target.value })}
              />
            </div>
            <div>
              <label className="app-field-label">Primary Color</label>
              <div className="flex gap-2.5">
                <Input
                  type="color"
                  className="brand-color-swatch w-11 h-11 rounded-md bg-transparent border-input cursor-pointer p-0"
                  value={settings.primary_color || "#8B3FD6"}
                  onChange={(e) => onUpdate({ ...settings, primary_color: e.target.value })}
                />
                <Input
                  type="text"
                  className="app-input-soft flex-1 py-3 h-auto font-mono"
                  value={settings.primary_color || "#8B3FD6"}
                  onChange={(e) => onUpdate({ ...settings, primary_color: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="preview-panel flex flex-col items-center justify-center p-5 border border-input bg-white/25 rounded-md">
            <p className="app-form-eyebrow text-muted/70 mb-5">Preview</p>
            <div className="brand-preview-card w-full p-5 rounded-md bg-paper relative overflow-hidden group">
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at top right, ${settings.primary_color}, transparent)`,
                }}
              />
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
                  <Zap className="w-6 h-6" style={{ color: settings.primary_color }} />
                )}
                <span
                  className="font-display uppercase tracking-widest text-sm"
                  style={{ color: settings.primary_color }}
                >
                  {settings.brand_name || "WIRELINE"}
                </span>
              </div>
              <div className="space-y-2">
                <div className="h-2 w-full rounded-full bg-ink/5" />
                <div className="h-2 w-2/3 rounded-full bg-ink/5" />
              </div>
              <div className="mt-6 flex justify-end">
                <div
                  className="px-3.5 py-2 rounded-full text-[8px] uppercase tracking-[0.18em] font-bold text-white"
                  style={{ backgroundColor: settings.primary_color }}
                >
                  Action
                </div>
              </div>
            </div>
          </div>
        </div>

        {onSave && (
          <div className="app-soft-divider mt-7 pt-5 border-t">
            <ShadButton
              onClick={onSave}
              disabled={isSaving}
              variant="outline"
              className="disabled:opacity-50 disabled:cursor-not-allowed app-primary-action w-full md:w-auto flex items-center justify-center gap-2 border-input"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Branding Settings
            </ShadButton>
          </div>
        )}
      </div>
    </div>
  );
}
