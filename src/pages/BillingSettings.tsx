import { PlayCircle, Receipt, ShieldCheck, WalletCards } from "lucide-react";

import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import StripeBillingCard from "../components/StripeBillingCard";
import ConversationBalanceCard from "../components/ConversationBalanceCard";

const BILLING_FLOW = [
  {
    label: "Fund",
    title: "Start free. Fund live work.",
    detail: "Balance, not plans.",
    icon: WalletCards,
  },
  {
    label: "Run",
    title: "Use balance first.",
    detail: "Calls eat balance.",
    icon: PlayCircle,
  },
  {
    label: "Reconcile",
    title: "Stripe receipts.",
    detail: "Plans in Stripe.",
    icon: Receipt,
  },
] as const;

export default function BillingSettings() {
  return (
    <WorkspaceShell eyebrow="Workspace" title="Billing" contentClassName="pt-1 pb-8">
      <div className="mx-auto flex min-h-0 w-full max-w-[1080px] flex-1 flex-col gap-5 pb-6">
        <section className="studio-card grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(240px,.62fr)_minmax(0,1fr)] xl:items-center">
          <div className="text-center">
            <h2 className="text-sm font-semibold tracking-[-0.01em] text-foreground">Billing</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {BILLING_FLOW.map(({ label, title, detail, icon: Icon }) => (
              <div
                key={label}
                className="studio-card p-4 text-center"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="font-mono text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-[.06em] text-muted-foreground">
                    {label}
                  </span>
                  <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-muted text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                </div>
                <p className="font-[var(--wireline-font-family-display)] text-lg font-semibold leading-6 tracking-[-.025em] text-foreground">
                  {title}
                </p>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <ConversationBalanceCard />

        <section>
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-2">
            <h2 className="font-[var(--wireline-font-family-display)] text-xl font-semibold tracking-[-.03em] text-foreground">
              Team capacity
            </h2>
          </div>
          <StripeBillingCard />
        </section>

        <StatusNotice
          tone="info"
          title="Receipts."
          icon={<ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />}
        >
          Stripe portal. Outcomes in your ledger train the fleet.
        </StatusNotice>
      </div>
    </WorkspaceShell>
  );
}
