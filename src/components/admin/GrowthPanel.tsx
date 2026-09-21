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
import { Panel } from "../PageShell";
import { Input } from "../ui/shadcn/Input";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Switch } from "../atoms/Switch";
import { AdminSaveBar } from "./AdminSaveBar";
import { OPS_ADMIN } from "../../lib/wireline-ops-design";

interface GrowthPanelProps {
  settings: any;
  setSettings: any;
  onSave: () => void;
  isSaving: boolean;
}

type TargetTagField = "target_titles" | "target_industries" | "target_states";
const MAX_TARGET_TAGS = 20;
const MAX_TARGET_TAG_LENGTH = 120;

function asTargetTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, MAX_TARGET_TAG_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_TARGET_TAGS);
}

/** Honest ICP completeness score from saved targeting fields (not fabricated funnel stats). */
function computeIcpInsights(settings: GrowthPanelProps["settings"]) {
  const titles = asTargetTags(settings.target_titles);
  const industries = asTargetTags(settings.target_industries);
  const states = asTargetTags(settings.target_states);
  const sizes = asTargetTags(settings.target_employee_ranges);
  const filledBuckets = [titles, industries, states, sizes].filter((b) => b.length > 0).length;
  const tagCount = titles.length + industries.length + states.length + sizes.length;
  const completeness = settings.prospecting_enabled
    ? Math.min(95, 40 + filledBuckets * 12 + Math.min(tagCount * 2, 20))
    : Math.min(60, filledBuckets * 15 + tagCount * 2);

  const industryLabel =
    industries.length > 0
      ? industries.slice(0, 2).join(industries.length > 2 ? ", …" : "")
      : "your target industries";

  let advice = "Turn on Lead Hunt and save ICP tags to start sourcing leads.";
  if (settings.prospecting_enabled && titles.length === 0) {
    advice =
      "Add at least one decision-maker title (e.g. Owner, CEO) so Apollo searches stay focused.";
  } else if (settings.prospecting_enabled && industries.length === 0) {
    advice =
      "Add target industries so prospecting matches businesses that fit BotBound's sweet spot.";
  } else if (settings.prospecting_enabled && states.length === 0) {
    advice = "Geographic filters reduce wasted dials. Start with your primary state or region.";
  } else if (settings.prospecting_enabled) {
    advice = `ICP targets ${industryLabel}. Open Phone → Outbound → Lead Hunt when you're ready to search.`;
  }

  return { completeness, industryLabel, advice };
}

export function GrowthPanel({ settings, setSettings, onSave, isSaving }: GrowthPanelProps) {
  const [newTitle, setNewTitle] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [newState, setNewState] = useState("");
  const targetTitles = asTargetTags(settings.target_titles);
  const targetIndustries = asTargetTags(settings.target_industries);
  const targetStates = asTargetTags(settings.target_states);
  const targetEmployeeRanges = asTargetTags(settings.target_employee_ranges);

  const addTag = (field: TargetTagField, value: string, setter: (v: string) => void) => {
    const next = value.trim().slice(0, MAX_TARGET_TAG_LENGTH);
    if (!next) return;
    const current = asTargetTags(settings[field]);
    const duplicate = current.some(
      (entry) => entry.toLocaleLowerCase("en-US") === next.toLocaleLowerCase("en-US"),
    );
    if (!duplicate && current.length < MAX_TARGET_TAGS) {
      setSettings({ ...settings, [field]: [...current, next] });
    }
    setter("");
  };

  const removeTag = (field: TargetTagField, value: string) => {
    setSettings({
      ...settings,
      [field]: asTargetTags(settings[field]).filter((entry) => entry !== value),
    });
  };

  const icp = computeIcpInsights(settings);

  return (
    <div className="h-full grid grid-cols-1 xl:grid-cols-3 gap-3 min-h-0 scroll-viewport pb-6">
      <div className="xl:col-span-2 space-y-3">
        <Panel title="Growth Engine" hint="LEAD DISCOVERY" icon={TrendingUp} scroll>
          <div className="space-y-8">
            {/* Master Control */}
            <div className="relative group overflow-hidden rounded-md wl-panel border border-brand/30 bg-brand/5 p-4 transition-colors hover:bg-brand/10">
              <div className="relative z-10 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={cn(
                      "w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition-colors",
                      settings.prospecting_enabled
                        ? "bg-brand/20 text-brand shadow-[var(--wireline-elevation-sm)]"
                        : "bg-black/10 text-muted",
                    )}
                  >
                    <Zap className="w-4 h-4" />
                  </div>
                  <h4 className="text-base font-bold text-foreground">Lead Hunt</h4>
                </div>
                <Switch
                  checked={settings.prospecting_enabled}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, prospecting_enabled: checked })
                  }
                  aria-label="Toggle Lead Hunt"
                />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Find phone-ready Apollo leads that match your target profile. Review them before
                adding them to a campaign.
              </p>
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
                      <label
                        htmlFor="growth-target-titles"
                        className="wl-label text-foreground font-bold"
                      >
                        Job Titles
                      </label>
                    </div>
                    <span className="wl-label text-muted">Role Density</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id="growth-target-titles"
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && addTag("target_titles", newTitle, setNewTitle)
                      }
                      maxLength={MAX_TARGET_TAG_LENGTH}
                      placeholder="e.g. CEO, Sales VP"
                      className="flex-1 text-sm bg-black/5 border border-input rounded-md px-4 py-2.5 outline-none focus-visible:ring-brand/40 transition-all placeholder:text-muted/70 h-auto"
                    />
                    <ShadButton
                      type="button"
                      aria-label="Add job title"
                      onClick={() => addTag("target_titles", newTitle, setNewTitle)}
                      variant="outline"
                      className="p-2.5 bg-brand/10 text-brand rounded-md hover:bg-brand/20 transition-all border-input w-10 h-10 shrink-0 p-0"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                    </ShadButton>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {targetTitles.map((t) => (
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
                      <label
                        htmlFor="growth-target-industries"
                        className="wl-label text-foreground font-bold"
                      >
                        Industries
                      </label>
                    </div>
                    <span className="wl-label text-muted">Market Scope</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id="growth-target-industries"
                      type="text"
                      value={newIndustry}
                      onChange={(e) => setNewIndustry(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" &&
                        addTag("target_industries", newIndustry, setNewIndustry)
                      }
                      maxLength={MAX_TARGET_TAG_LENGTH}
                      placeholder="e.g. Fintech, SaaS"
                      className="flex-1 text-sm bg-black/5 border border-input rounded-md px-4 py-2.5 outline-none focus-visible:ring-brand/40 transition-all placeholder:text-muted/70 h-auto"
                    />
                    <ShadButton
                      type="button"
                      aria-label="Add industry"
                      onClick={() => addTag("target_industries", newIndustry, setNewIndustry)}
                      variant="outline"
                      className="p-2.5 bg-brand-3/10 text-brand-3 rounded-md hover:bg-brand-3/20 transition-all border-input w-10 h-10 shrink-0 p-0"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                    </ShadButton>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {targetIndustries.map((t) => (
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
                      <label
                        htmlFor="growth-target-geography"
                        className="wl-label text-foreground font-bold"
                      >
                        Geographic Target
                      </label>
                    </div>
                    <span className="wl-label text-muted">Legal Nexus</span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      id="growth-target-geography"
                      type="text"
                      value={newState}
                      onChange={(e) => setNewState(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && addTag("target_states", newState, setNewState)
                      }
                      maxLength={MAX_TARGET_TAG_LENGTH}
                      placeholder="e.g. CA, NY, Texas"
                      className="flex-1 text-sm bg-black/5 border border-input rounded-md px-4 py-2.5 outline-none focus-visible:ring-brand/40 transition-all placeholder:text-muted/70 h-auto"
                    />
                    <ShadButton
                      type="button"
                      aria-label="Add geographic target"
                      onClick={() => addTag("target_states", newState, setNewState)}
                      variant="outline"
                      className="p-2.5 bg-brand/10 text-brand rounded-md hover:bg-brand/20 transition-all border-input w-10 h-10 shrink-0 p-0"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                    </ShadButton>
                  </div>
                  <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {targetStates.map((t) => (
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
                      <span
                        id="growth-target-company-size"
                        className="wl-label text-foreground font-bold"
                      >
                        Company Size
                      </span>
                    </div>
                    <span className="wl-label text-muted">Org Scale</span>
                  </div>
                  <div
                    className="grid grid-cols-3 gap-1.5"
                    role="group"
                    aria-labelledby="growth-target-company-size"
                  >
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
                        aria-pressed={targetEmployeeRanges.includes(range.value)}
                        variant="ghost"
                        disableAnimations
                        onClick={() => {
                          const current = targetEmployeeRanges;
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
                          targetEmployeeRanges.includes(range.value)
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
                <span className="wl-label font-black text-brand">ICP Completeness</span>
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
                {settings.prospecting_enabled ? "Lead Hunt" : "saved targeting"},{" "}
                {icp.industryLabel}.
              </p>
              <div
                className="w-full h-1.5 bg-black/10 rounded-full overflow-hidden"
                role="progressbar"
                aria-label="ICP completeness"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={icp.completeness}
              >
                <div className="h-full bg-brand" style={{ width: `${icp.completeness}%` }} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="wl-label text-muted font-bold">ICP tags</span>
                <span className="wl-micro-badge font-mono text-muted">SAVED</span>
              </div>
              {[
                { label: "Titles", value: targetTitles.length },
                { label: "Industries", value: targetIndustries.length },
                { label: "States", value: targetStates.length },
                { label: "Size bands", value: targetEmployeeRanges.length },
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
