/**
 * AccountsPanel — manage personal/business accounts and switch between them.
 * Lives under Settings > Accounts tab.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building, Check, Loader2, Plus, User } from "lucide-react";
import { useAccount, type Account } from "../../contexts/AccountContext";
import { cn } from "../../lib/utils";

function AccountCard({
  account,
  isActive,
  onSwitch,
}: {
  account: Account;
  isActive: boolean;
  onSwitch: () => void;
}) {
  const Icon = account.type === "personal" ? User : Building;

  return (
    <button
      onClick={onSwitch}
      className={cn(
        "relative flex w-full min-w-0 items-start gap-3 overflow-hidden rounded-xl border p-4 text-left transition-all sm:gap-4 sm:p-5",
        isActive
          ? "border-primary bg-primary/[0.03] shadow-sm"
          : "border-border bg-card hover:border-primary/30 hover:bg-primary/[0.01]",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
          isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 break-words text-sm font-semibold text-foreground">
            {account.label ?? (account.type === "personal" ? "Personal" : "Business")}
          </span>
          {account.isPrimary && (
            <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[var(--wireline-typography-overline-size)] uppercase tracking-wider font-medium text-[var(--wireline-color-action-primary-default)] bg-[var(--wireline-color-action-primary-container)] border border-[var(--wireline-color-action-primary-default)]/20">
              Primary
            </span>
          )}
          {isActive && (
            <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[var(--wireline-typography-overline-size)] uppercase tracking-wider font-medium text-[var(--wireline-color-action-primary-default)] bg-[var(--wireline-color-action-primary-container)] border border-[var(--wireline-color-action-primary-default)]/20">
              <Check className="h-2.5 w-2.5" /> Active
            </span>
          )}
        </div>
        <p className="mt-1 break-words text-xs text-muted-foreground">
          {account.type === "personal"
            ? "A personal agent for everyday calls, scheduling, and follow-up."
            : "Shared agents with recaps, analytics, and connected accounts."}
        </p>
      </div>
    </button>
  );
}

export function AccountsPanel() {
  const { activeAccount, accounts, switchAccount, addAccount, loading } = useAccount();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<"personal" | "business" | null>(null);

  const canAddPersonal = !accounts.some((a) => a.type === "personal");
  const canAddBusiness = !accounts.some((a) => a.type === "business");

  const handleSwitch = (account: Account) => {
    switchAccount(account.id);
    navigate("/overview", { replace: true });
  };

  const handleAdd = async (type: "personal" | "business") => {
    setCreating(type);
    const created = await addAccount(type);
    setCreating(null);
    if (created) {
      navigate("/overview", { replace: true });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading accounts…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {accounts.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            isActive={account.id === activeAccount?.id}
            onSwitch={() => handleSwitch(account)}
          />
        ))}
      </div>

      {(canAddPersonal || canAddBusiness) && (
        <div>
          <p className="text-xs text-muted-foreground mb-3">One personal, one business.</p>
          <div className="flex flex-wrap gap-3">
            {canAddPersonal && (
              <button
                onClick={() => handleAdd("personal")}
                disabled={creating !== null}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border border-border bg-card text-foreground hover:border-primary/30 hover:bg-primary/[0.01] transition-colors disabled:opacity-50"
              >
                {creating === "personal" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add personal account
              </button>
            )}
            {canAddBusiness && (
              <button
                onClick={() => handleAdd("business")}
                disabled={creating !== null}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium border border-border bg-card text-foreground hover:border-primary/30 hover:bg-primary/[0.01] transition-colors disabled:opacity-50"
              >
                {creating === "business" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add business account
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
