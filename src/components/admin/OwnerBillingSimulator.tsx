/* eslint-disable @typescript-eslint/no-explicit-any -- Account Holder settings payloads are loosely typed. */
import { useState } from "react";
import { CreditCard, AlertTriangle, Activity, CheckCircle2, ServerCog } from "lucide-react";
import { Panel } from "../PageShell";
import { cn } from "../../lib/utils";
import { AdminSaveBar } from "./AdminSaveBar";
import { OPS_ADMIN } from "../../lib/wireline-ops-design";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Slider } from "../ui/shadcn/Slider";
import { authFetch } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";

interface OwnerBillingSimulatorProps {
  settings: any;
  agents: any[];
  onSettingsChange: (s: any) => void;
}

/** Internal-only billing state overrides — founder dashboard, never customer Settings. */
export function OwnerBillingSimulator({
  settings,
  agents,
  onSettingsChange,
}: OwnerBillingSimulatorProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const res = await authFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Save failed");
      toastSuccess("Simulator saved", "Subscription state updated for this tenant.");
    } catch (e: any) {
      toastError("Save failed", e.message);
    }
    setIsSaving(false);
  };

  return (
    <Panel title="subscription state" hint="SIMULATOR" icon={CreditCard}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="rounded-md wl-panel border border-rose-500/20 p-3 space-y-3 relative">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-rose-500" />
              <label className="wl-label text-rose-500">Operational state</label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ShadButton
                type="button"
                variant="outline"
                disableAnimations
                onClick={() => onSettingsChange({ ...settings, subscription_status: "active" })}
                className={cn(
                  "h-auto w-full gap-1.5 rounded-md py-3 wl-label",
                  settings.subscription_status === "active"
                    ? "border-brand/40 bg-brand/15 text-brand"
                    : "border-white/10 bg-white/5 text-foreground/55 hover:border-white/20",
                )}
              >
                {settings.subscription_status === "active" && <CheckCircle2 className="w-3 h-3" />}
                Active
              </ShadButton>
              <ShadButton
                type="button"
                variant="outline"
                disableAnimations
                onClick={() => onSettingsChange({ ...settings, subscription_status: "past_due" })}
                className={cn(
                  "h-auto w-full gap-1.5 rounded-md py-3 wl-label",
                  settings.subscription_status === "past_due"
                    ? "bg-rose-500/15 border-rose-500/40 text-rose-500"
                    : "border-white/10 bg-white/5 text-foreground/55 hover:border-white/20",
                )}
              >
                {settings.subscription_status === "past_due" && (
                  <Activity className="w-3 h-3 animate-pulse" />
                )}
                Suspended
              </ShadButton>
            </div>
            <p className="wl-micro-meta--muted leading-relaxed">
              Suspending an account locks Assistants routing and disables carrier webhooks immediately.
            </p>
          </div>

          <div className="rounded-md wl-panel border border-white/10 p-3 space-y-3">
            <label className="wl-label text-foreground/55">Max agents</label>
            <div className="flex items-center gap-3">
              <Slider
                min="1"
                max="20"
                value={settings.max_agents}
                onChange={(e) =>
                  onSettingsChange({ ...settings, max_agents: parseInt(e.target.value) })
                }
                className="flex-1 accent-brand"
              />
              <div className="w-12 h-12 rounded-md wl-panel border border-brand/40 text-brand flex items-center justify-center font-display italic text-2xl tabular-nums">
                {settings.max_agents}
              </div>
            </div>
          </div>

          <AdminSaveBar
            onClick={saveSettings}
            isSaving={isSaving}
            label={OPS_ADMIN.saveLabels.subscription}
            fullWidth
          />
        </div>

        <div className="rounded-md wl-panel border border-input p-4 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-white/8">
            <ServerCog className="w-3.5 h-3.5 text-brand" />
            <h4 className="font-display italic text-base text-foreground">Developer terminal</h4>
          </div>
          <div className="space-y-2 text-[11px] font-mono">
            <div className="flex items-center justify-between py-1 border-b border-white/5">
              <span className="wl-label text-foreground/55">Core</span>
              <span className="text-foreground">v2.0.4</span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-white/5">
              <span className="wl-label text-foreground/55">State</span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-full border wl-label leading-none",
                  settings.subscription_status === "active"
                    ? "wl-status-success border wl-text-success"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-500",
                )}
              >
                {settings.subscription_status}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-white/5">
              <span className="wl-label text-foreground/55">Agents</span>
              <span className="text-foreground tabular-nums">{agents.length} deployed</span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="wl-label text-foreground/55">Quota</span>
              <span className="text-brand tabular-nums">
                {Math.max(0, settings.max_agents - agents.length)} free
              </span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
