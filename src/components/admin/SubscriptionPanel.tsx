/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React from "react";
import {
  CreditCard,
  AlertTriangle,
  Loader2,
  Save,
  Activity,
  CheckCircle2,
  Trash2,
  ServerCog,
} from "lucide-react";
import { Panel } from "../PageShell";
import StripeBillingCard from "../StripeBillingCard";
import { cn } from "../../lib/utils";
import { Link } from "react-router-dom";
import { Input } from "../ui/shadcn/Input";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { Slider } from "../ui/shadcn/Slider";

interface SubscriptionPanelProps {
  settings: any;
  agents?: any[];
  isSaving: boolean;
  onUpdateSettings: (s: any) => void;
  onSaveSettings: () => void;
  onDeleteAccount: (confirm: string) => Promise<void>;
}

export function SubscriptionPanel({
  settings,
  agents = [],
  isSaving,
  onUpdateSettings,
  onSaveSettings,
  onDeleteAccount,
}: SubscriptionPanelProps) {
  const [deletingAccount, setDeletingAccount] = React.useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = React.useState("");

  const handleDelete = async () => {
    if (deleteConfirmText !== "DELETE MY ACCOUNT") return;
    setDeletingAccount(true);
    try {
      await onDeleteAccount(deleteConfirmText);
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-hide space-y-3 pb-4">
      <StripeBillingCard />

      <Panel title="subscription state" hint="SIMULATOR" icon={CreditCard}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div className="rounded-md wl-panel border border-rose-500/20 p-3 space-y-3 relative">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-rose-500" />
                <label className="text-[10px] uppercase tracking-[0.3em] text-rose-500">
                  Operational state
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <ShadButton
                  type="button"
                  variant="outline"
                  disableAnimations
                  onClick={() => onUpdateSettings({ ...settings, subscription_status: "active" })}
                  className={cn(
                    "h-auto w-full gap-1.5 rounded-md py-3 text-[10px] uppercase tracking-[0.25em]",
                    settings.subscription_status === "active"
                      ? "border-brand/40 bg-brand/15 text-brand"
                      : "border-white/10 bg-white/5 text-ink/40 hover:border-white/20",
                  )}
                >
                  {settings.subscription_status === "active" && (
                    <CheckCircle2 className="w-3 h-3" />
                  )}
                  Active
                </ShadButton>
                <ShadButton
                  type="button"
                  variant="outline"
                  disableAnimations
                  onClick={() => onUpdateSettings({ ...settings, subscription_status: "past_due" })}
                  className={cn(
                    "h-auto w-full gap-1.5 rounded-md py-3 text-[10px] uppercase tracking-[0.25em]",
                    settings.subscription_status === "past_due"
                      ? "bg-rose-500/15 border-rose-500/40 text-rose-500"
                      : "border-white/10 bg-white/5 text-ink/40 hover:border-white/20",
                  )}
                >
                  {settings.subscription_status === "past_due" && (
                    <Activity className="w-3 h-3 animate-pulse" />
                  )}
                  Suspended
                </ShadButton>
              </div>
              <p className="text-[10px] text-muted/80 leading-relaxed">
                Suspending an account locks fleet routing and disables carrier webhooks immediately.
              </p>
            </div>

            <div className="rounded-md wl-panel border border-white/10 p-3 space-y-3">
              <label className="text-[10px] uppercase tracking-[0.3em] text-ink/40">
                Max agents
              </label>
              <div className="flex items-center gap-3">
                <Slider
                  min="1"
                  max="20"
                  value={settings.max_agents}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, max_agents: parseInt(e.target.value) })
                  }
                  className="flex-1 accent-brand"
                />
                <div className="w-12 h-12 rounded-md wl-panel border border-brand/40 text-brand flex items-center justify-center font-display italic text-2xl tabular-nums">
                  {settings.max_agents}
                </div>
              </div>
            </div>

            <ShadButton
              onClick={onSaveSettings}
              disabled={isSaving}
              variant="outline"
              disableAnimations
              className="app-primary-action w-full disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save billing
            </ShadButton>
          </div>

          <div className="rounded-md wl-panel border border-input p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-white/8">
              <ServerCog className="w-3.5 h-3.5 text-brand" />
              <h4 className="font-display italic lowercase text-base text-ink">
                developer terminal
              </h4>
            </div>
            <div className="space-y-2 text-[11px] font-mono">
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-ink/40 uppercase tracking-[0.2em] text-[9px]">Core</span>
                <span className="text-ink">v2.0.4</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-ink/40 uppercase tracking-[0.2em] text-[9px]">State</span>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded-full border text-[9px] uppercase tracking-[0.25em] leading-none",
                    settings.subscription_status === "active"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                      : "bg-rose-500/10 border-rose-500/30 text-rose-500",
                  )}
                >
                  {settings.subscription_status}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-white/5">
                <span className="text-ink/40 uppercase tracking-[0.2em] text-[9px]">Agents</span>
                <span className="text-ink tabular-nums">{agents.length} deployed</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-ink/40 uppercase tracking-[0.2em] text-[9px]">Quota</span>
                <span className="text-brand tabular-nums">
                  {Math.max(0, settings.max_agents - agents.length)} free
                </span>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Danger Zone" hint="Irreversible actions" icon={AlertTriangle} scroll>
        <div className="space-y-5">
          <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-rose-500 uppercase tracking-[0.2em]">
                  Delete account
                </p>
                <p className="text-xs text-muted/80">
                  Permanently deletes your account and all associated data.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE MY ACCOUNT"
                className="w-full h-9 px-3 rounded-md bg-black/5 border border-rose-500/20 text-xs font-mono text-ink outline-none focus-visible:ring-rose-500/50 transition-all"
              />
              <ShadButton
                onClick={handleDelete}
                disabled={deletingAccount || deleteConfirmText !== "DELETE MY ACCOUNT"}
                variant="outline"
                disableAnimations
                className="w-full h-9 rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-500 text-[11px] uppercase tracking-[0.2em] hover:bg-rose-500/20 disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {deletingAccount ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                {deletingAccount ? "Deleting…" : "Delete my account"}
              </ShadButton>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-ink/40 border-t border-white/5 pt-3">
            <Link to="/privacy" className="hover:text-muted">
              Privacy Policy
            </Link>
            <span>·</span>
            <Link to="/terms" className="hover:text-muted">
              Terms of Service
            </Link>
          </div>
        </div>
      </Panel>
    </div>
  );
}
