/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CreateCampaignModal — Modal form for creating new outbound campaigns.
 * Extracted from the monolithic OutboundDialer.tsx.
 */
import { useState, useEffect } from "react";
import { Plus, Bot, Loader2, AlertTriangle, ChevronDown, Clock, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { authFetch } from "../../lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/shadcn/Dialog";
import { Input } from "../ui/shadcn/Input";
import { ShadButton } from "../ui/shadcn/ShadButton";

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
    <Dialog open={true} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="sm:max-w-md border border-white/10 shadow-2xl p-0 bg-black/85 backdrop-blur-xl rounded-2xl overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-white/10 flex flex-col space-y-0 text-left">
          <DialogDescription className="text-[9px] uppercase tracking-[0.4em] text-brand mb-0.5 font-bold">
            Signal · Campaigns
          </DialogDescription>
          <DialogTitle className="font-display italic lowercase text-2xl text-ink leading-none">
            new campaign
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[60dvh] scrollbar-hide">
          <div className="space-y-1.5">
            <label className="app-section-title">Campaign Name</label>
            <Input
              placeholder="Q4 Win-Back Drive"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="bg-black/10 border-white/10 text-sm text-ink focus-visible:ring-brand/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="app-section-title">Goal (optional)</label>
            <Input
              placeholder="Re-engage churned users from past 90 days"
              value={form.goal}
              onChange={(e) => set("goal", e.target.value)}
              className="bg-black/10 border-white/10 text-sm text-ink focus-visible:ring-brand/40"
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
                  className={cn("w-full h-9 pl-3 pr-10 rounded-md border border-input bg-transparent text-sm text-ink focus:border-brand/50 focus:outline-none transition-all appearance-none cursor-pointer")}
                  value={form.agent_id}
                  onChange={(e) => set("agent_id", e.target.value)}
                >
                  <option value="" className="bg-black text-ink">Unassigned</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id} className="bg-black text-ink">
                      {a.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="app-section-title flex items-center gap-1.5">
                <Clock className="w-2.5 h-2.5 text-brand" /> Window start
              </label>
              <Input
                type="time"
                value={form.call_window_start}
                onChange={(e) => set("call_window_start", e.target.value)}
                className="bg-black/10 border-white/10 text-sm text-ink focus-visible:ring-brand/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="app-section-title">Window end</label>
              <Input
                type="time"
                value={form.call_window_end}
                onChange={(e) => set("call_window_end", e.target.value)}
                className="bg-black/10 border-white/10 text-sm text-ink focus-visible:ring-brand/40"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="app-section-title">Max retry attempts</label>
            <Input
              type="number"
              inputMode="numeric"
              min="1"
              max="10"
              value={form.max_attempts}
              onChange={(e) => set("max_attempts", e.target.value)}
              className="bg-black/10 border-white/10 text-sm text-ink focus-visible:ring-brand/40"
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

        <div className="px-5 py-4 border-t border-white/10 flex items-center justify-end gap-2 bg-black/20">
          <ShadButton
            variant="outline"
            onClick={onClose}
            className="rounded-xl h-9 border-white/10 hover:bg-white/5 uppercase tracking-[0.2em] text-[10px] font-bold text-muted hover:text-ink"
          >
            Cancel
          </ShadButton>
          <ShadButton
            onClick={save}
            disabled={saving}
            className="rounded-xl h-9 bg-brand/15 hover:bg-brand/25 border border-brand/50 text-brand uppercase tracking-[0.2em] text-[10px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Create
          </ShadButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
