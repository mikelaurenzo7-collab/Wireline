/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CreateCampaignModal — Modal form for creating new outbound campaigns.
 * Extracted from the monolithic OutboundDialer.tsx.
 */
import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Plus, Bot, Loader2, AlertTriangle, ChevronDown, Clock, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { authFetch } from "../../lib/api";

export default function CreateCampaignModal({
  agents,
  onClose,
  onCreated,
}: {
  agents: any[];
  onClose: () => void;
  onCreated: (c: any) => void;
}) {
  const [form, setForm] = useState({
    name: "",
    goal: "",
    agent_id: "",
    call_window_start: "09:00",
    call_window_end: "17:00",
    max_attempts: "3",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const inputCls =
    "w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/70 transition-all";

  const save = async () => {
    if (!form.name.trim()) {
      setErr("Campaign name is required.");
      return;
    }
    setSaving(true);
    setErr("");
    try {
      const res = await authFetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, max_attempts: parseInt(form.max_attempts) || 3 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create campaign");
      onCreated(data.campaign);
    } catch (e: any) {
      setErr(e.message);
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 16 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] rounded-2xl glass-strong border border-white/15 shadow-2xl overflow-hidden"
      >
        <header className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.4em] text-brand mb-0.5">
              Signal · Campaigns
            </p>
            <h2 className="font-display italic lowercase text-2xl text-ink">new campaign</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg glass border border-white/10 flex items-center justify-center text-muted hover:text-ink transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh] scrollbar-hide">
          <div className="space-y-1.5">
            <label className="app-section-title">Campaign Name</label>
            <input
              className={inputCls}
              placeholder="Q4 Win-Back Drive"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="app-section-title">Goal (optional)</label>
            <input
              className={inputCls}
              placeholder="Re-engage churned users from past 90 days"
              value={form.goal}
              onChange={(e) => set("goal", e.target.value)}
            />
          </div>
          {agents.length > 0 && (
            <div className="space-y-1.5">
              <label className="app-section-title flex items-center gap-1.5">
                <Bot className="w-2.5 h-2.5 text-brand" /> Default Agent
              </label>
              <div className="relative">
                <select
                  aria-label="Default agent"
                  className={cn(inputCls, "appearance-none cursor-pointer pr-8")}
                  value={form.agent_id}
                  onChange={(e) => set("agent_id", e.target.value)}
                >
                  <option value="">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="app-section-title flex items-center gap-1.5">
                <Clock className="w-2.5 h-2.5 text-brand" /> Window start
              </label>
              <input
                type="time"
                className={inputCls}
                value={form.call_window_start}
                onChange={(e) => set("call_window_start", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="app-section-title">Window end</label>
              <input
                type="time"
                className={inputCls}
                value={form.call_window_end}
                onChange={(e) => set("call_window_end", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="app-section-title">Max retry attempts</label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="10"
              className={inputCls}
              value={form.max_attempts}
              onChange={(e) => set("max_attempts", e.target.value)}
            />
          </div>

          {err && (
            <div
              role="alert"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <p className="text-[11px] text-rose-500">{err}</p>
            </div>
          )}
        </div>

        <footer className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 px-4 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.28em] text-muted hover:text-ink transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="h-9 px-5 rounded-full bg-brand/15 border border-brand/50 text-brand text-[10px] uppercase tracking-[0.28em] hover:bg-brand/25 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Create
          </button>
        </footer>
      </motion.div>
    </div>
  );
}
