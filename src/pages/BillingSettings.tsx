import { ArrowRight, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { Badge } from "../components/atoms";
import SettingsTabs from "../components/settings/SettingsTabs";
import WorkspaceShell from "../components/WorkspaceShell";
import { STRIPE_PLANS } from "../lib/plan-catalog";

const teamPlan = STRIPE_PLANS.find((plan) => plan.id === "team")!;

export default function BillingSettings() {
  const monthlyPrice = "$" + teamPlan.price_usd_monthly + "/mo";
  const invoiceTotal = "$" + teamPlan.price_usd_monthly + ".00";

  return (
    <WorkspaceShell title="" eyebrow="" contentClassName="pt-0 pb-10">
      <div className="mx-auto flex w-full max-w-[680px] flex-col gap-5 pb-10">
        <SettingsTabs />

        <h1 className="wl-display-3">Billing</h1>

        <section className="rounded-[16px] border border-primary/20 bg-primary p-6 text-primary-foreground shadow-[var(--wireline-elevation-md)] sm:p-7">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary-foreground/65">
            Current plan
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <h2 className="font-[var(--wireline-font-family-display)] text-[clamp(1.75rem,1.4rem+1.6vw,2.4rem)] font-normal leading-none tracking-[-0.035em]">
              Team
            </h2>
            <span className="pb-1 font-[var(--wireline-font-family-display)] text-[clamp(1.5rem,1.2rem+1.4vw,2rem)] leading-none tracking-[-0.035em]">
              — {monthlyPrice}
            </span>
          </div>
          <p className="mt-4 text-sm leading-6 text-primary-foreground/78">
            {teamPlan.max_agents} agents · {teamPlan.included_phone_numbers} lines · Routing ·
            Approvals · Shared inbox
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          <article className="studio-card p-5">
            <p className="wl-overline">Conversation Balance</p>
            <p className="wl-display-3 mt-4">$187</p>
            <div className="mt-5 h-2 rounded-full bg-muted">
              <div className="h-full w-[38%] rounded-full bg-primary" />
            </div>
          </article>
          <article className="studio-card p-5">
            <p className="wl-overline">Next invoice</p>
            <p className="wl-display-3 mt-4">{invoiceTotal}</p>
            <p className="mt-5 text-sm text-muted-foreground">Due July 1, 2026</p>
          </article>
        </section>

        <section className="studio-card p-5 sm:p-6">
          <p className="wl-overline">Recent invoices</p>
          <div className="mt-4 grid gap-2">
            {["June 2026", "May 2026"].map((month) => (
              <div
                key={month}
                className="flex items-center justify-between gap-4 rounded-xl bg-muted/35 px-4 py-3"
              >
                <p className="text-sm font-medium text-foreground">{month}</p>
                <p className="text-sm font-semibold text-foreground">{invoiceTotal}</p>
                <Badge variant="success">Paid</Badge>
              </div>
            ))}
          </div>
        </section>

        <section className="studio-card p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldCheck size={15} className="text-primary" aria-hidden="true" />
                Clear commercial model
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Plans add capacity. Conversation Balance pays for live calls, texts, and
                provider-backed actions.
              </p>
            </div>
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary"
            >
              View pricing <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
