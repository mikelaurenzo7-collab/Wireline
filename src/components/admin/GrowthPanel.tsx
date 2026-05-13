import React, { useState } from "react";
import { Zap, Plus, Trash2, Save, Loader2 } from "lucide-react";
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
    setSettings({ ...settings, [field]: (settings[field] || []).filter((v: string) => v !== value) });
  };

  return (
    <div className="space-y-4">
      <Panel title="Autonomous Growth Engine" hint="GROWTH ENGINE" icon={Zap} scroll>
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 rounded-2xl bg-brand/5 border border-brand/20">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-ink">Enable Autonomous Prospecting</h4>
              <p className="text-[10px] text-muted">Allow the AI to proactively source leads based on your ICP.</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, prospecting_enabled: !settings.prospecting_enabled })}
              className={cn(
                "w-12 h-6 rounded-full transition-all relative",
                settings.prospecting_enabled ? "bg-brand" : "bg-black/20"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-all",
                settings.prospecting_enabled ? "left-7" : "left-1"
              )} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Target Titles */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.3em] text-muted font-bold">Target Job Titles</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag('target_titles', newTitle, setNewTitle)}
                  placeholder="e.g. CEO, Founder"
                  className="flex-1 text-xs bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50"
                />
                <button onClick={() => addTag('target_titles', newTitle, setNewTitle)} className="p-2 bg-brand/10 text-brand rounded-lg hover:bg-brand/20">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(settings.target_titles || []).map((t: string) => (
                  <span key={t} className="px-2 py-1 bg-black/5 border border-black/10 rounded-md text-[10px] flex items-center gap-1.5">
                    {t}
                    <button onClick={() => removeTag('target_titles', t)}><Trash2 className="w-3 h-3 text-muted hover:text-rose-500" /></button>
                  </span>
                ))}
              </div>
            </div>

            {/* Target Industries */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.3em] text-muted font-bold">Target Industries</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newIndustry}
                  onChange={(e) => setNewIndustry(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag('target_industries', newIndustry, setNewIndustry)}
                  placeholder="e.g. Software, Real Estate"
                  className="flex-1 text-xs bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50"
                />
                <button onClick={() => addTag('target_industries', newIndustry, setNewIndustry)} className="p-2 bg-brand/10 text-brand rounded-lg hover:bg-brand/20">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(settings.target_industries || []).map((t: string) => (
                  <span key={t} className="px-2 py-1 bg-black/5 border border-black/10 rounded-md text-[10px] flex items-center gap-1.5">
                    {t}
                    <button onClick={() => removeTag('target_industries', t)}><Trash2 className="w-3 h-3 text-muted hover:text-rose-500" /></button>
                  </span>
                ))}
              </div>
            </div>

            {/* Target States */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.3em] text-muted font-bold">Target States (US)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newState}
                  onChange={(e) => setNewState(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addTag('target_states', newState, setNewState)}
                  placeholder="e.g. California, NY"
                  className="flex-1 text-xs bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50"
                />
                <button onClick={() => addTag('target_states', newState, setNewState)} className="p-2 bg-brand/10 text-brand rounded-lg hover:bg-brand/20">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(settings.target_states || []).map((t: string) => (
                  <span key={t} className="px-2 py-1 bg-black/5 border border-black/10 rounded-md text-[10px] flex items-center gap-1.5">
                    {t}
                    <button onClick={() => removeTag('target_states', t)}><Trash2 className="w-3 h-3 text-muted hover:text-rose-500" /></button>
                  </span>
                ))}
              </div>
            </div>

            {/* Employee Ranges */}
            <div className="space-y-3">
              <label className="text-[10px] uppercase tracking-[0.3em] text-muted font-bold">Company Size (Employees)</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "1-10", value: "1,10" },
                  { label: "11-50", value: "11,50" },
                  { label: "51-200", value: "51,200" },
                  { label: "201-500", value: "201,500" },
                  { label: "501-1000", value: "501,1000" },
                  { label: "1001+", value: "1001,1000000" },
                ].map((range) => (
                  <button
                    key={range.value}
                    onClick={() => {
                      const current = settings.target_employee_ranges || [];
                      if (current.includes(range.value)) {
                        setSettings({ ...settings, target_employee_ranges: current.filter((v: string) => v !== range.value) });
                      } else {
                        setSettings({ ...settings, target_employee_ranges: [...current, range.value] });
                      }
                    }}
                    className={cn(
                      "px-3 py-2 rounded-lg border text-[10px] transition-all",
                      (settings.target_employee_ranges || []).includes(range.value)
                        ? "bg-brand/10 border-brand/30 text-brand"
                        : "bg-black/5 border-black/10 text-muted"
                    )}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/10">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="brutal-btn w-full md:w-auto !px-8 !py-3 !text-xs !tracking-[0.4em] flex items-center justify-center gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Growth Configuration
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
