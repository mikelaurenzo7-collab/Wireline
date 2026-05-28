/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState } from "react";
import {
  Zap,
  Plus,
  Trash2,
  Save,
  Loader2,
  Target,
  Users,
  Building2,
  MapPin,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Panel } from "../PageShell";

interface GrowthPanelProps {
  settings: any;
  setSettings: any;
  onSave: () => void;
  isSaving: boolean;
}

export function GrowthPanel({ settings, setSettings, onSave, isSaving }: GrowthPanelProps) {
  const [newTitle, setNewTitle] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [newState, setNewState] = useState("");

  const addTag = (field: string, value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    const current = settings[field] || [];
    if (!current.includes(value.trim())) {
      setSettings({ ...settings, [field]: [...current, value.trim()] });
    }
    setter("");
  };

  const removeTag = (field: string, value: string) => {
    setSettings({
      ...settings,
      [field]: (settings[field] || []).filter((v: string) => v !== value),
    });
  };

  return (
    <div className="h-full grid grid-cols-1 xl:grid-cols-3 gap-3 min-h-0 overflow-y-auto scrollbar-hide pb-6">
      <div className="xl:col-span-2 space-y-3">
        <Panel title="Growth Engine" hint="AUTONOMOUS OUTREACH" icon={TrendingUp} scroll>
          <div className="space-y-8">
            {/* Master Control */}
            <div className="relative group overflow-hidden rounded-2xl glass border border-brand/30 bg-brand/5 p-6 transition-all hover:bg-brand/10">
              <div
                className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-20 blur-3xl group-hover:opacity-40 transition-opacity"
                style={{ background: "radial-gradient(circle, #4F1E7B, transparent)" }}
              />
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex gap-4">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all",
                      settings.prospecting_enabled
                        ? "bg-brand/20 text-brand shadow-[0_0_15px_rgba(79, 30, 123 ,0.3)]"
                        : "bg-black/10 text-muted",
                    )}
                  >
                    <Zap
                      className={cn("w-6 h-6", settings.prospecting_enabled && "animate-pulse")}
                    />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base font-bold text-ink">
                      Autonomous Prospecting Protocol
                    </h4>
                    <p className="text-[11px] text-muted leading-relaxed max-w-sm">
                      Enable Wireline to autonomously search, qualify, and ingest leads based on
                      your specified Ideal Customer Profile (ICP).
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    setSettings({ ...settings, prospecting_enabled: !settings.prospecting_enabled })
                  }
                  className={cn(
                    "w-14 h-7 rounded-full transition-all relative flex items-center px-1",
                    settings.prospecting_enabled ? "bg-brand" : "bg-black/20",
                  )}
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full bg-[#FFFFFF] transition-all shadow-lg",
                      settings.prospecting_enabled ? "translate-x-7" : "translate-x-0",
                    )}
                  />
                </button>
              </div>
            </div>

            {/* ICP Configuration */}
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-brand" />
                <h5 className="app-section-title font-black">Target Profile Parameters</h5>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-10">
                {/* Target Titles */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-muted" />
                      <label className="text-[10px] uppercase tracking-[0.2em] text-ink font-bold">
                        Job Titles
                      </label>
                    </div>
                    <span className="text-[8px] uppercase tracking-widest text-muted">
                      Role Density
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && addTag("target_titles", newTitle, setNewTitle)
                      }
                      placeholder="e.g. CEO, Sales VP"
                      className="flex-1 text-sm bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 outline-none focus:border-brand/50 transition-all placeholder:text-muted/60"
                    />
                    <button
                      onClick={() => addTag("target_titles", newTitle, setNewTitle)}
                      className="p-2.5 bg-brand/10 text-brand rounded-xl hover:bg-brand/20 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {(settings.target_titles || []).map((t: string) => (
                      <span
                        key={t}
                        className="px-2.5 py-1 glass border border-brand/20 bg-brand/5 rounded-lg text-[10px] font-bold text-ink flex items-center gap-2 hover:border-brand/40 transition-all"
                      >
                        {t}
                        <button
                          onClick={() => removeTag("target_titles", t)}
                          className="text-muted hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Target Industries */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-muted" />
                      <label className="text-[10px] uppercase tracking-[0.2em] text-ink font-bold">
                        Industries
                      </label>
                    </div>
                    <span className="text-[8px] uppercase tracking-widest text-muted">
                      Market Scope
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newIndustry}
                      onChange={(e) => setNewIndustry(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        addTag("target_industries", newIndustry, setNewIndustry)
                      }
                      placeholder="e.g. Fintech, SaaS"
                      className="flex-1 text-sm bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 outline-none focus:border-brand/50 transition-all placeholder:text-muted/60"
                    />
                    <button
                      onClick={() => addTag("target_industries", newIndustry, setNewIndustry)}
                      className="p-2.5 bg-brand-3/10 text-brand-3 rounded-xl hover:bg-brand-3/20 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {(settings.target_industries || []).map((t: string) => (
                      <span
                        key={t}
                        className="px-2.5 py-1 glass border border-brand-3/20 bg-brand-3/5 rounded-lg text-[10px] font-bold text-ink flex items-center gap-2 hover:border-brand-3/40 transition-all"
                      >
                        {t}
                        <button
                          onClick={() => removeTag("target_industries", t)}
                          className="text-muted hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Target States */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-muted" />
                      <label className="text-[10px] uppercase tracking-[0.2em] text-ink font-bold">
                        Geographic Target
                      </label>
                    </div>
                    <span className="text-[8px] uppercase tracking-widest text-muted">
                      Legal Nexus
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newState}
                      onChange={(e) => setNewState(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && addTag("target_states", newState, setNewState)
                      }
                      placeholder="e.g. CA, NY, Texas"
                      className="flex-1 text-sm bg-black/5 border border-black/10 rounded-xl px-4 py-2.5 outline-none focus:border-brand/50 transition-all placeholder:text-muted/60"
                    />
                    <button
                      onClick={() => addTag("target_states", newState, setNewState)}
                      className="p-2.5 bg-brand/10 text-brand rounded-xl hover:bg-brand/20 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {(settings.target_states || []).map((t: string) => (
                      <span
                        key={t}
                        className="px-2.5 py-1 glass border border-black/20 bg-black/5 rounded-lg text-[10px] font-bold text-ink flex items-center gap-2 hover:border-black/30 transition-all"
                      >
                        {t}
                        <button
                          onClick={() => removeTag("target_states", t)}
                          className="text-muted hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Employee Ranges */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-muted" />
                      <label className="text-[10px] uppercase tracking-[0.2em] text-ink font-bold">
                        Company Size
                      </label>
                    </div>
                    <span className="text-[8px] uppercase tracking-widest text-muted">
                      Org Scale
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { label: "1-10", value: "1,10" },
                      { label: "11-50", value: "11,50" },
                      { label: "51-200", value: "51,200" },
                      { label: "201-500", value: "201,500" },
                      { label: "501-1k", value: "501,1000" },
                      { label: "1k+", value: "1001,1000000" },
                    ].map((range) => (
                      <button
                        key={range.value}
                        onClick={() => {
                          const current = settings.target_employee_ranges || [];
                          if (current.includes(range.value)) {
                            setSettings({
                              ...settings,
                              target_employee_ranges: current.filter(
                                (v: string) => v !== range.value,
                              ),
                            });
                          } else {
                            setSettings({
                              ...settings,
                              target_employee_ranges: [...current, range.value],
                            });
                          }
                        }}
                        className={cn(
                          "px-2 py-2 rounded-xl border text-[10px] font-bold transition-all",
                          (settings.target_employee_ranges || []).includes(range.value)
                            ? "bg-brand/10 border-brand/40 text-brand shadow-[0_0_10px_rgba(79, 30, 123 ,0.1)]"
                            : "bg-black/5 border-black/10 text-muted/60 hover:border-black/20",
                        )}
                      >
                        {range.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-white/8 flex justify-end">
              <button
                onClick={onSave}
                disabled={isSaving}
                className="disabled:opacity-50 disabled:cursor-not-allowed brutal-btn !px-12 !py-3.5 !text-[11px] !tracking-[0.45em] flex items-center justify-center gap-3 shadow-xl"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>Sync Growth Protocol</span>
              </button>
            </div>
          </div>
        </Panel>
      </div>

      <div className="space-y-3">
        <Panel title="Growth Intelligence" hint="COGNITIVE FEEDBACK" icon={Sparkles} scroll>
          <div className="space-y-4">
            <div className="p-5 rounded-2xl glass border border-brand/20 bg-brand/5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.3em] font-black text-brand">
                  ICP Efficiency
                </span>
                <Sparkles className="w-4 h-4 text-brand animate-pulse" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-display text-ink">
                  92<span className="text-lg text-muted">%</span>
                </span>
                <TrendingUp className="w-4 h-4 text-emerald-500 mb-1" />
              </div>
              <p className="text-[10px] text-muted leading-relaxed">
                Your current configuration has a 92% match rate with high-intent decision makers in
                the fintech sector.
              </p>
              <div className="w-full h-1.5 bg-black/10 rounded-full overflow-hidden">
                <div className="h-full bg-brand" style={{ width: "92%" }} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[9px] uppercase tracking-widest text-muted font-bold">
                  Lead Funnel
                </span>
                <span className="text-[9px] font-mono text-muted">LIVE</span>
              </div>
              {[
                { label: "Sourced", value: "1,284", color: "text-ink" },
                { label: "Qualified", value: "412", color: "text-brand-3" },
                { label: "In-Call", value: "28", color: "text-brand" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-3 rounded-xl glass border border-white/8 flex items-center justify-between"
                >
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted">
                    {stat.label}
                  </span>
                  <span className={cn("text-sm font-display", stat.color)}>{stat.value}</span>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-xl bg-black/20 border border-white/5">
              <p className="text-[9px] uppercase tracking-widest text-muted/60 mb-2">
                Strategy Advice
              </p>
              <p className="text-[10px] italic text-muted leading-relaxed">
                "Increasing target titles to include 'Director of Innovation' could expand market
                reach by 14% without compromising lead quality."
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
