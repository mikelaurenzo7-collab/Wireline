import React from "react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { Panel } from "../PageShell";
import StripeBillingCard from "../StripeBillingCard";
import { Link } from "react-router";
import { Input } from "../ui/shadcn/Input";
import { ShadButton } from "../ui/shadcn/ShadButton";

interface SubscriptionPanelProps {
  onDeleteAccount: (confirm: string) => Promise<void>;
}

/** Customer-facing billing: Stripe subscription, usage, and account deletion. */
export function SubscriptionPanel({ onDeleteAccount }: SubscriptionPanelProps) {
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
    <div className="h-full min-h-0 scroll-viewport space-y-3 pb-4">
      <StripeBillingCard />

      <Panel title="Danger Zone" hint="Irreversible actions" icon={AlertTriangle} scroll>
        <div className="space-y-5">
          <div className="max-w-xl rounded-md border border-rose-500/20 bg-rose-500/5 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-[length:var(--wireline-typography-overline-size)] font-medium text-rose-500 uppercase tracking-[0.2em]">
                  Delete account
                </p>
                <p className="text-xs text-muted/80">
                  Schedules permanent deletion after a 30-day grace period. Billing and numbers
                  continue until purge; contact support to cancel.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE MY ACCOUNT"
                className="w-full h-9 px-3 rounded-md bg-black/5 border border-rose-500/20 text-xs font-mono text-foreground outline-none focus-visible:ring-rose-500/50 transition-all"
              />
              <ShadButton
                onClick={handleDelete}
                disabled={deletingAccount || deleteConfirmText !== "DELETE MY ACCOUNT"}
                variant="outline"
                disableAnimations
                className="w-full h-9 rounded-md border border-rose-500/30 bg-rose-500/10 text-rose-500 text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.2em] hover:bg-rose-500/20 disabled:opacity-40 flex items-center justify-center gap-2"
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
          <div className="flex items-center gap-3 wl-micro-meta border-t border-white/5 pt-3">
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
