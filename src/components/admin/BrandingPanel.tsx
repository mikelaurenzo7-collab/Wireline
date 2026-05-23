/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React from "react";
import { Bot, Zap, Save, Loader2 } from "lucide-react";

interface BrandingPanelProps {
  settings: any;
  onUpdate: (s: any) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

export function BrandingPanel({ settings, onUpdate, onSave, isSaving }: BrandingPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="p-6 rounded-2xl glass border border-white/10">
        <h3 className="text-[9px] uppercase tracking-[0.4em] text-muted mb-6 flex items-center gap-2">
          <Bot className="w-3.5 h-3.5" /> Brand Identity
        </h3>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[9px] uppercase tracking-[0.2em] text-muted mb-1.5 ml-1">
                Platform Name
              </label>
              <input
                type="text"
                placeholder="Wireline OS"
                className="input-field"
                value={settings.brand_name || ""}
                onChange={(e) => onUpdate({ ...settings, brand_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-[0.2em] text-muted mb-1.5 ml-1">
                Brand Logo URL
              </label>
              <input
                type="text"
                placeholder="https://assets.yoursite.com/logo.png"
                className="input-field"
                value={settings.brand_logo_url || ""}
                onChange={(e) => onUpdate({ ...settings, brand_logo_url: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-[9px] uppercase tracking-[0.2em] text-muted mb-1.5 ml-1">
                Primary Color
              </label>
              <div className="flex gap-3">
                <input
                  type="color"
                  className="w-12 h-12 rounded-xl bg-transparent border-none cursor-pointer"
                  value={settings.primary_color || "#4F1E7B"}
                  onChange={(e) => onUpdate({ ...settings, primary_color: e.target.value })}
                />
                <input
                  type="text"
                  className="flex-1 input-field font-mono"
                  value={settings.primary_color || "#4F1E7B"}
                  onChange={(e) => onUpdate({ ...settings, primary_color: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center p-6 border border-white/5 bg-white/5 rounded-2xl">
            <p className="text-[9px] uppercase tracking-[0.32em] text-muted/60 mb-6">Preview</p>
            <div className="w-full p-6 rounded-3xl brutal-border bg-paper relative overflow-hidden group">
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
                  className="px-4 py-2 rounded-full text-[8px] uppercase tracking-widest font-bold text-white"
                  style={{ backgroundColor: settings.primary_color }}
                >
                  Action
                </div>
              </div>
            </div>
          </div>
        </div>

        {onSave && (
          <div className="mt-8 pt-6 border-t border-white/5">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="disabled:opacity-50 disabled:cursor-not-allowed brutal-btn w-full md:w-auto !px-8 !py-3 !text-[10px] !tracking-[0.4em] flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Branding Settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
