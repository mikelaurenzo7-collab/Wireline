/**
 * AccountsPanel — manage personal/business accounts and switch between them.
 * Lives under Settings > Accounts tab.
 */
import { useState } from "react";
import { useNavigate } from "react-router";
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
        "relative flex w-full min-w-0 items-start gap-3 overflow-hidden rounded-2xl border p-4 text-left transition-all sm:items-center sm:gap-4 sm:p-5",
        isActive
          ? "border-primary bg-primary/[0.03] shadow-sm"
          : "border-border bg-card hover:border-primary/30 hover:bg-primary/[0.01]",
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 break-words text-sm font-semibold leading-5 text-foreground">
            {account.label ?? (account.type === "personal" ? "Personal" : "Business")}
          </span>
          {account.isPrimary && (
            <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-[var(--wireline-color-action-primary-default)]/20 bg-[var(--wireline-color-action-primary-container)] px-2 py-0.5 text-[length:var(--wireline-typography-overline-size)] font-medium uppercase tracking-wider text-[var(--wireline-color-action-primary-default)]">
              Primary
            </span>
          )}
          {isActive && (
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-[var(--wireline-color-action-primary-default)]/20 bg-[var(--wireline-color-action-primary-container)] px-2 py-0.5 text-[length:var(--wireline-typography-overline-size)] font-medium uppercase tracking-wider text-[var(--wireline-color-action-primary-default)]">
              <Check className="h-2.5 w-2.5 shrink-0" /> Active
            </span>
          )}
        </div>
        <p className="mt-1 max-w-2xl break-words text-xs leading-5 text-muted-foreground">
          {account.type === "personal"
            ? "Personal context for everyday calls, scheduling, and follow-up."
            : "Shared agents, recaps, analytics, and connected accounts."}
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
      <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading accounts…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 sm:space-y-6">
      <header className="max-w-2xl">
        <p className="text-eyebrow text-primary">Account profile</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          Keep personal and business work separate
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Switch personalization and defaults between personal and business context. Every agent
          stays under your account, with its own training, rules, and history.
        </p>
      </header>

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
        <section className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
          <p className="text-sm font-semibold text-foreground">Add another context</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            One personal, one business.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {canAddPersonal && (
              <button
                onClick={() => handleAdd("personal")}
                disabled={creating !== null}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/[0.01] disabled:opacity-50"
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
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/[0.01] disabled:opacity-50"
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
        </section>
      )}
    </div>
  );
}
