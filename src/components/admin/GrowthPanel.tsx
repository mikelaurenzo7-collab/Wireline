/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState } from "react";
import {
  Zap,
  Plus,
  Trash2,
  Target,
  Users,
  Building2,
  MapPin,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { Panel } from "../organisms";
import { Input } from "../atoms/Input";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { AdminSaveBar } from "./AdminSaveBar";
import { OPS_ADMIN } from "../../lib/wireline-ops-design";

interface GrowthPanelProps {
  settings: any;
  setSettings: any;
  onSave: () => void;
  isSaving: boolean;
}

/** Honest ICP completeness score from saved targeting fields (not fabricated funnel stats). */
function computeIcpInsights(settings: GrowthPanelProps["settings"]) {
  const titles = settings.target_titles || [];
  const industries = settings.target_industries || [];
  const states = settings.target_states || [];
  const sizes = settings.target_employee_ranges || [];
  const filledBuckets = [titles, industries, states, sizes].filter((b) => b.length > 0).length;
  const tagCount = titles.length + industries.length + states.length + sizes.length;
  const completeness = settings.prospecting_enabled
    ? Math.min(95, 40 + filledBuckets * 12 + Math.min(tagCount * 2, 20))
    : Math.min(60, filledBuckets * 15 + tagCount * 2);

  const industryLabel =
    industries.length > 0
      ? industries.slice(0, 2).join(industries.length > 2 ? ", …" : "")
      : "your target industries";

  let advice = "Turn on Autonomous Prospecting and save ICP tags to start sourcing leads.";
  if (settings.prospecting_enabled && titles.length === 0) {
    advice =
      "Add at least one decision-maker title (e.g. Owner, CEO) so Apollo searches stay focused.";
  } else if (settings.prospecting_enabled && industries.length === 0) {
    advice =
      "Add target industries so prospecting matches businesses that fit Wireline's sweet spot.";
  } else if (settings.prospecting_enabled && states.length === 0) {
    advice = "Geographic filters reduce wasted dials — start with your primary state or region.";
  } else if (settings.prospecting_enabled) {
    advice = `ICP targets ${industryLabel} — queue a prospecting run from Recaps when you're ready to ingest leads.`;
  }

  return { completeness, industryLabel, advice };
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

  const icp = computeIcpInsights(settings);

  return (
    <div className="h-full grid grid-cols-1 xl:grid-cols-3 gap-3 min-h-0 scroll-viewport pb-6">
      <div className="xl:col-span-2 space-y-3">
        <Panel title="Growth Engine" hint="AUTONOMOUS OUTREACH" icon={TrendingUp} scroll>
          <div className="space-y-8">
            {/* Master Control */}
            <div className="relative group overflow-hidden rounded-md wl-panel border border-brand/30 bg-brand/5 p-6 transition-all hover:bg-brand/10">
              <div className="relative z-10 flex items-center justify-between">
                <div className="flex gap-4">
                  <div
                    className={cn(
                      "w-12 h-12 rounded-md flex items-center justify-center shrink-0 transition-all",
                      settings.prospecting_enabled
                        ? "bg-brand/20 text-brand shadow-[var(--wireline-elevation-sm)]"
                        : "bg-black/10 text-muted",
                    )}
                  >
                    <Zap
                      className={cn("w-6 h-6", settings.prospecting_enabled && "animate-pulse")}
                    />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-base font-bold text-foreground">
                      Autonomous Prospecting Protocol
                    </h4>
                    <p className="text-[length:var(--wireline-typography-caption-size)] text-[var(--wireline-color-text-secondary)] leading-relaxed max-w-sm">
                      Enable Wireline to autonomously search, qualify, and ingest leads based on
                      your specified Ideal Customer Profile (ICP).
                    </p>
                  </div>
                </div>
                <ShadButton
                  type="button"
                  variant="ghost"
                  disableAnimations
                  onClick={() =>
                    setSettings({ ...settings, prospecting_enabled: !settings.prospecting_enabled })
                  }
                  className={cn(
                    "w-14 h-7 rounded-full p-0 min-h-0 transition-all relative flex items-center px-1",
                    settings.prospecting_enabled ? "bg-brand hover:bg-brand" : "bg-black/20",
                  )}
                  aria-pressed={settings.prospecting_enabled}
                  aria-label="Toggle autonomous prospecting"
                >
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full bg-card transition-all shadow-lg",
                      settings.prospecting_enabled ? "translate-x-7" : "translate-x-0",
                    )}
                  />
                </ShadButton>
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
                      <label className="wl-label text-foreground font-bold">Job Titles</label>
                    </div>
                    <span className="wl-label text-muted">Role Density</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && addTag("target_titles", newTitle, setNewTitle)
                      }
                      placeholder="e.g. CEO, Sales VP"
                      className="flex-1 text-sm bg-black/5 border border-input rounded-md px-4 py-2.5 outline-none focus-visible:ring-brand/40 transition-all placeholder:text-muted/70 h-auto"
                    />
                    <ShadButton
                      onClick={() => addTag("target_titles", newTitle, setNewTitle)}
                      variant="outline"
                      className="p-2.5 bg-brand/10 text-brand rounded-md hover:bg-brand/20 transition-all border-input w-10 h-10 shrink-0 p-0"
                    >
                      <Plus className="w-4 h-4" />
                    </ShadButton>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {(settings.target_titles || []).map((t: string) => (
                      <span
                        key={t}
                        className="px-2.5 py-1 wl-panel border border-brand/20 bg-brand/5 rounded-md wl-label font-bold text-foreground flex items-center gap-2 hover:border-brand/40 transition-all"
                      >
                        {t}
                        <ShadButton
                          type="button"
                          variant="ghost"
                          size="icon"
                          disableAnimations
                          onClick={() => removeTag("target_titles", t)}
                          className="min-h-0 h-auto w-auto p-0 text-muted hover:text-rose-500"
                          aria-label={`Remove ${t}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </ShadButton>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Target Industries */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-muted" />
                      <label className="wl-label text-foreground font-bold">Industries</label>
                    </div>
                    <span className="wl-label text-muted">Market Scope</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={newIndustry}
                      onChange={(e) => setNewIndustry(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        addTag("target_industries", newIndustry, setNewIndustry)
                      }
                      placeholder="e.g. Fintech, SaaS"
                      className="flex-1 text-sm bg-black/5 border border-input rounded-md px-4 py-2.5 outline-none focus-visible:ring-brand/40 transition-all placeholder:text-muted/70 h-auto"
                    />
                    <ShadButton
                      onClick={() => addTag("target_industries", newIndustry, setNewIndustry)}
                      variant="outline"
                      className="p-2.5 bg-brand-3/10 text-brand-3 rounded-md hover:bg-brand-3/20 transition-all border-input w-10 h-10 shrink-0 p-0"
                    >
                      <Plus className="w-4 h-4" />
                    </ShadButton>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {(settings.target_industries || []).map((t: string) => (
                      <span
                        key={t}
                        className="px-2.5 py-1 wl-panel border border-brand/20 bg-brand/5 rounded-md wl-label font-bold text-foreground flex items-center gap-2 hover:border-brand/40 transition-all"
                      >
                        {t}
                        <ShadButton
                          type="button"
                          variant="ghost"
                          size="icon"
                          disableAnimations
                          onClick={() => removeTag("target_industries", t)}
                          className="min-h-0 h-auto w-auto p-0 text-muted hover:text-rose-500"
                          aria-label={`Remove ${t}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </ShadButton>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Target States */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-muted" />
                      <label className="wl-label text-foreground font-bold">
                        Geographic Target
                      </label>
                    </div>
                    <span className="wl-label text-muted">Legal Nexus</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={newState}
                      onChange={(e) => setNewState(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && addTag("target_states", newState, setNewState)
                      }
                      placeholder="e.g. CA, NY, Texas"
                      className="flex-1 text-sm bg-black/5 border border-input rounded-md px-4 py-2.5 outline-none focus-visible:ring-brand/40 transition-all placeholder:text-muted/70 h-auto"
                    />
                    <ShadButton
                      onClick={() => addTag("target_states", newState, setNewState)}
                      variant="outline"
                      className="p-2.5 bg-brand/10 text-brand rounded-md hover:bg-brand/20 transition-all border-input w-10 h-10 shrink-0 p-0"
                    >
                      <Plus className="w-4 h-4" />
                    </ShadButton>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {(settings.target_states || []).map((t: string) => (
                      <span
                        key={t}
                        className="px-2.5 py-1 wl-panel border border-white/20 bg-black/5 rounded-md wl-label font-bold text-foreground flex items-center gap-2 hover:border-white/30 transition-all"
                      >
                        {t}
                        <ShadButton
                          type="button"
                          variant="ghost"
                          size="icon"
                          disableAnimations
                          onClick={() => removeTag("target_states", t)}
                          className="min-h-0 h-auto w-auto p-0 text-muted hover:text-rose-500"
                          aria-label={`Remove ${t}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </ShadButton>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Employee Ranges */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-muted" />
                      <label className="wl-label text-foreground font-bold">Company Size</label>
                    </div>
                    <span className="wl-label text-muted">Org Scale</span>
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
                      <ShadButton
                        key={range.value}
                        type="button"
                        variant="ghost"
                        disableAnimations
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
                          "px-2 py-2 rounded-md border wl-label font-bold h-auto min-h-0",
                          (settings.target_employee_ranges || []).includes(range.value)
                            ? "bg-brand/10 border-brand/40 text-brand shadow-[var(--wireline-elevation-sm)]"
                            : "bg-black/5 border-input text-muted/70 hover:border-white/20",
                        )}
                      >
                        {range.label}
                      </ShadButton>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <AdminSaveBar
              onClick={onSave}
              isSaving={isSaving}
              label={OPS_ADMIN.saveLabels.growth}
            />
          </div>
        </Panel>
      </div>

      <div className="space-y-3">
        <Panel title="Growth Intelligence" hint="COGNITIVE FEEDBACK" icon={Sparkles} scroll>
          <div className="space-y-4">
            <div className="p-5 rounded-md wl-panel border border-input bg-brand/5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="wl-label font-black text-brand">ICP Efficiency</span>
                <Sparkles className="w-4 h-4 text-brand animate-pulse" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-display text-foreground">
                  {icp.completeness}
                  <span className="text-lg text-muted">%</span>
                </span>
                <TrendingUp className="w-4 h-4 text-brand mb-1" />
              </div>
              <p className="wl-micro-meta--muted leading-relaxed">
                ICP configuration completeness for{" "}
                {settings.prospecting_enabled ? "autonomous prospecting" : "saved targeting"} —{" "}
                {icp.industryLabel}.
              </p>
              <div className="w-full h-1.5 bg-black/10 rounded-full overflow-hidden">
                <div className="h-full bg-brand" data-pct={`${icp.completeness}%`} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="wl-label text-muted font-bold">ICP tags</span>
                <span className="wl-micro-badge font-mono text-muted">SAVED</span>
              </div>
              {[
                { label: "Titles", value: (settings.target_titles || []).length },
                { label: "Industries", value: (settings.target_industries || []).length },
                { label: "States", value: (settings.target_states || []).length },
                { label: "Size bands", value: (settings.target_employee_ranges || []).length },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-3 rounded-md wl-panel border border-input flex items-center justify-between"
                >
                  <span className="wl-label-muted">{stat.label}</span>
                  <span
                    className={cn(
                      "text-sm font-display",
                      stat.value > 0 ? "text-brand" : "text-muted",
                    )}
                  >
                    {stat.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-4 rounded-md bg-brand/5 border border-brand/15">
              <p className="wl-label text-brand/70 mb-2">Strategy Advice</p>
              <p className="wl-micro-meta italic text-muted leading-relaxed">"{icp.advice}"</p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
