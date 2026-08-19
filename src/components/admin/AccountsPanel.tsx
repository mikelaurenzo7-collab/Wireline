/**
 * AccountsPanel — workspace list for legacy dual-account rows.
 * Lives under Settings > Accounts tab.
 *
 * New customers get one workspace. Existing personal/business account rows
 * can still switch; we do not offer adding a second branded workspace.
 */
import { useNavigate } from "react-router";
import { Check, Loader2 } from "lucide-react";
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
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 break-words text-sm font-semibold leading-5 text-foreground">
            {account.label ?? "Workspace"}
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
          Voice agents, recaps, analytics, and connected accounts in one place.
        </p>
      </div>
    </button>
  );
}

export function AccountsPanel() {
  const { activeAccount, accounts, switchAccount, loading } = useAccount();
  const navigate = useNavigate();

  const handleSwitch = (account: Account) => {
    switchAccount(account.id);
    navigate("/overview", { replace: true });
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
        <h2 className="text-base font-semibold tracking-tight text-foreground">One workspace</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Configure each voice agent for the job it should own. Training, rules, and history stay
          on the agent.
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
    </div>
  );
}
