import { Link } from "react-router-dom";
import { ArrowLeft, CreditCard, Receipt, ShieldCheck } from "lucide-react";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import StripeBillingCard from "../components/StripeBillingCard";
import ConversationBalanceCard from "../components/ConversationBalanceCard";
import { PRODUCT_VERSATILITY } from "../lib/product-copy";

export default function BillingSettings() {
  return (
    <WorkspaceShell
      eyebrow={PRODUCT_VERSATILITY.eyebrow}
      title="Billing & plans"
      contentClassName="pt-6"
      action={
        <Button asChild variant="secondary" size="sm">
          <Link to="/settings">
            <ArrowLeft size={16} />
            Back to Settings
          </Link>
        </Button>
      }
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[1080px] flex-1 flex-col gap-6 pb-6">
        <section className="studio-card">
          <p className="studio-kicker">Stripe-secured</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-[var(--radius-lg)] border border-border bg-secondary p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                <ShieldCheck className="size-4" />
                Payments
              </div>
              <p className="font-[var(--wireline-font-family-display)] text-lg font-semibold text-foreground">
                PCI DSS via Stripe
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Subscriptions and Conversation Balance top-ups are vaulted by Stripe.
              </p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <CreditCard className="size-4 text-primary" />
                Personal assistants
              </div>
              <p className="font-[var(--wireline-font-family-display)] text-lg font-semibold text-foreground">
                Pay as you go
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Free to build. Add balance only when you want live conversations handled.
              </p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Receipt className="size-4 text-primary" />
                Business agents
              </div>
              <p className="font-[var(--wireline-font-family-display)] text-lg font-semibold text-foreground">
                Monthly plans
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Numbers, routing, and team tools — upgrade or cancel anytime in the Stripe portal.
              </p>
            </div>
          </div>
        </section>

        <ConversationBalanceCard />

        <section>
          <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
            <h2 className="flex items-center gap-2 font-[var(--wireline-font-family-display)] text-xl font-semibold tracking-[-.03em] text-foreground">
              <CreditCard className="size-5 text-primary" />
              Business workspace plan
            </h2>
          </div>
          <StripeBillingCard />
        </section>

        <StatusNotice tone="info" title="Invoices & receipts">
          Past invoices and usage receipts are available in the secure Stripe billing portal. Update
          payment methods, download PDFs, or change your plan without leaving Wireline.
        </StatusNotice>
      </div>
    </WorkspaceShell>
  );
}
