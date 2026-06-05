/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CreateCampaignModal — Modal form for creating new outbound campaigns.
 * Extracted from the monolithic OutboundDialer.tsx.
 */
import { useState, useEffect } from "react";
import { Plus, Bot, Loader2, AlertTriangle, Clock } from "lucide-react";
import { authFetch } from "../../lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/shadcn/Dialog";
import { Input } from "../ui/shadcn/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/Select";
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
      <DialogContent className="sm:max-w-md border border-white/10 dark:border-white/5 shadow-2xl p-0 wl-modal-surface rounded-md overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-white/10 dark:border-white/5 flex flex-col space-y-0 text-left">
          <DialogDescription className="text-[9px] uppercase tracking-[0.4em] text-brand mb-0.5 font-bold">
            Signal · Campaigns
          </DialogDescription>
          <DialogTitle className="font-display italic lowercase text-2xl text-ink dark:text-foreground leading-none">
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
              className="bg-black/10 dark:bg-white/10 border-white/10 dark:border-white/10 text-sm text-ink dark:text-foreground focus-visible:ring-brand/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="app-section-title">Goal (optional)</label>
            <Input
              placeholder="Re-engage churned users from past 90 days"
              value={form.goal}
              onChange={(e) => set("goal", e.target.value)}
              className="bg-black/10 dark:bg-white/10 border-white/10 dark:border-white/10 text-sm text-ink dark:text-foreground focus-visible:ring-brand/40"
            />
          </div>
          {agents.length > 0 && (
            <div className="space-y-1.5">
              <label className="app-section-title flex items-center gap-1.5">
                <Bot className="w-2.5 h-2.5 text-brand" /> Default Agent
              </label>
              <Select
                value={form.agent_id || "__unassigned__"}
                onValueChange={(v) => set("agent_id", v === "__unassigned__" ? "" : v)}
              >
                <SelectTrigger
                  aria-label="Default agent"
                  className="w-full h-9 pl-3 pr-3 rounded-md border border-input bg-transparent dark:bg-white/5 text-sm text-ink dark:text-foreground"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                className="bg-black/10 dark:bg-white/10 border-white/10 dark:border-white/10 text-sm text-ink dark:text-foreground focus-visible:ring-brand/40"
              />
            </div>
            <div className="space-y-1.5">
              <label className="app-section-title">Window end</label>
              <Input
                type="time"
                value={form.call_window_end}
                onChange={(e) => set("call_window_end", e.target.value)}
                className="bg-black/10 dark:bg-white/10 border-white/10 dark:border-white/10 text-sm text-ink dark:text-foreground focus-visible:ring-brand/40"
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
              className="bg-black/10 dark:bg-white/10 border-white/10 dark:border-white/10 text-sm text-ink dark:text-foreground focus-visible:ring-brand/40"
            />
          </div>

          {err && (
            <div
              role="alert"
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/30"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
              <p className="text-[11px] text-destructive">{err}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/10 dark:border-white/5 flex items-center justify-end gap-2 bg-black/20 dark:bg-white/5">
          <ShadButton
            variant="outline"
            onClick={onClose}
            className="rounded-md h-9 border-white/10 dark:border-white/10 hover:bg-white/5 dark:hover:bg-white/10 uppercase tracking-[0.2em] text-[10px] font-bold text-muted hover:text-ink dark:text-foreground"
          >
            Cancel
          </ShadButton>
          <ShadButton
            onClick={save}
            disabled={saving}
            className="rounded-md h-9 bg-brand/15 hover:bg-brand/25 border border-brand/50 text-brand uppercase tracking-[0.2em] text-[10px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
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
