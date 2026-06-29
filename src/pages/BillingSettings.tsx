import { PlayCircle, Receipt, ShieldCheck, WalletCards } from "lucide-react";

import { StatusNotice } from "../components/molecules";
import SettingsTabs from "../components/settings/SettingsTabs";
import WorkspaceShell from "../components/WorkspaceShell";
import StripeBillingCard from "../components/StripeBillingCard";
import ConversationBalanceCard from "../components/ConversationBalanceCard";

const BILLING_FLOW = [
  {
    label: "Fund",
    title: "Start free. Fund live work.",
    detail: "Balance, not clutter.",
    icon: WalletCards,
  },
  {
    label: "Run",
    title: "Use balance first.",
    detail: "Calls draw down cleanly.",
    icon: PlayCircle,
  },
  {
    label: "Reconcile",
    title: "Stripe receipts.",
    detail: "Plans stay in Stripe.",
    icon: Receipt,
  },
] as const;

export default function BillingSettings() {
  return (
    <WorkspaceShell eyebrow="Settings" title="Billing" contentClassName="pt-1 pb-8">
      <div className="mx-auto flex min-h-0 w-full max-w-[1080px] flex-1 flex-col gap-5 pb-10">
        <SettingsTabs />

        <section className="studio-card grid gap-5 p-5 sm:p-6 xl:grid-cols-[minmax(240px,.52fr)_minmax(0,1fr)] xl:items-center">
          <div>
            <p className="wl-overline">Billing</p>
            <h2 className="mt-3 font-[var(--wireline-font-family-display)] text-3xl font-normal tracking-[-.03em] text-foreground">
              Balance for calls. Stripe for receipts.
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {BILLING_FLOW.map(({ label, title, detail, icon: Icon }) => (
              <div key={label} className="studio-card p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="font-mono text-[var(--wireline-typography-overline-size)] font-semibold uppercase tracking-[.08em] text-muted-foreground">
                    {label}
                  </span>
                  <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-muted text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                </div>
                <p className="text-sm font-semibold tracking-[-.01em] text-foreground">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <ConversationBalanceCard />

        <section>
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-2">
            <h2 className="font-[var(--wireline-font-family-display)] text-xl font-normal tracking-[-.022em] text-foreground">
              Payment portal
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
