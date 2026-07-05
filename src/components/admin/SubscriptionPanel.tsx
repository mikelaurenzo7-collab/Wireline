import React from "react";
import { AlertTriangle, Trash2, Loader2 } from "lucide-react";
import { Panel } from "../PageShell";
import StripeBillingCard from "../StripeBillingCard";
import { Link } from "react-router-dom";
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
          <div className="max-w-xl rounded-[var(--wireline-radius-lg)] border border-rose-500/20 bg-rose-500/[0.04] p-5 space-y-4 transition-all hover:bg-rose-500/[0.06]">
            <div className="flex items-start gap-3.5">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5 transition-transform" />
              <div className="space-y-1">
                <p className="text-[var(--wireline-typography-overline-size)] font-semibold text-rose-500 uppercase tracking-[0.2em]">
                  Delete account
                </p>
                <p className="text-xs text-muted-foreground">
                  Permanently deletes your account and all associated data.
                </p>
              </div>
            </div>
            <div className="space-y-2.5">
              <Input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE MY ACCOUNT"
                className="w-full h-9 px-3 rounded-[var(--wireline-radius-md)] bg-surface-subtle border border-rose-500/30 text-xs font-mono text-foreground outline-none focus-visible:ring-2 focus-visible:ring-rose-500/50 transition-all placeholder:text-muted-foreground/50"
              />
              <ShadButton
                onClick={handleDelete}
                disabled={deletingAccount || deleteConfirmText !== "DELETE MY ACCOUNT"}
                variant="outline"
                disableAnimations
                className="w-full h-9 rounded-[var(--wireline-radius-md)] border border-rose-500/40 bg-rose-500/[0.08] text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.2em] text-rose-500 hover:bg-rose-500/[0.12] disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
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
          <div className="flex items-center gap-3 wl-micro-meta border-t border-border/40 pt-3">
            <Link to="/privacy" className="text-[var(--wireline-typography-caption-size)] text-muted-foreground hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <span className="text-border">·</span>
            <Link to="/terms" className="text-[var(--wireline-typography-caption-size)] text-muted-foreground hover:text-foreground transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </Panel>
    </div>
  );
}
