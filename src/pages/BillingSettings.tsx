import { Link } from "react-router-dom";
import { ArrowLeft, CreditCard, Receipt, ShieldCheck } from "lucide-react";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import StripeBillingCard from "../components/StripeBillingCard";
import ConversationBalanceCard from "../components/ConversationBalanceCard";

export default function BillingSettings() {
  return (
    <WorkspaceShell
      eyebrow="Workspace"
      title="Billing"
      contentClassName="pt-6"
      action={<Button asChild variant="secondary" size="sm"><Link to="/settings"><ArrowLeft size={16} />Settings</Link></Button>}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[1080px] flex-1 flex-col gap-6 pb-6">
        <section className="studio-card">
          <p className="studio-kicker">How billing works</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-[var(--radius-lg)] border border-border bg-secondary p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary"><ShieldCheck className="size-4" />Payments</div>
              <p className="font-[var(--wireline-font-family-display)] text-lg font-semibold text-foreground">Protected by Stripe</p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><CreditCard className="size-4 text-primary" />Personal</div>
              <p className="font-[var(--wireline-font-family-display)] text-lg font-semibold text-foreground">Build free. Fund live work.</p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Receipt className="size-4 text-primary" />Business</div>
              <p className="font-[var(--wireline-font-family-display)] text-lg font-semibold text-foreground">Plans for team coverage.</p>
            </div>
          </div>
        </section>

        <ConversationBalanceCard />

        <section>
          <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
            <CreditCard className="size-5 text-primary" />
            <h2 className="font-[var(--wireline-font-family-display)] text-xl font-semibold tracking-[-.03em] text-foreground">Business plan</h2>
          </div>
          <StripeBillingCard />
        </section>

        <StatusNotice tone="info" title="Invoices and receipts">
          Manage payment methods, plan changes, and downloads in the secure Stripe portal.
        </StatusNotice>
      </div>
    </WorkspaceShell>
  );
}
