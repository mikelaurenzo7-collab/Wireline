import {
  CalendarDays,
  CreditCard,
  Mail,
  MessageSquareText,
  ShoppingBag,
  Workflow,
} from "lucide-react";

import { Button } from "../components/atoms";
import WorkspaceShell from "../components/WorkspaceShell";

const connectedTools = [
  {
    icon: CalendarDays,
    name: "Google Calendar",
    detail: "Book, reschedule, and check availability.",
  },
  {
    icon: MessageSquareText,
    name: "SMS Messages",
    detail: "Send confirmations and follow-ups via text.",
  },
  {
    icon: Workflow,
    name: "CRM Notes",
    detail: "Log call outcomes and contact updates.",
  },
] as const;

const availableTools = [
  {
    icon: Mail,
    name: "Gmail",
    detail: "Read and send emails on behalf of your agents.",
  },
  {
    icon: Mail,
    name: "Outlook",
    detail: "Microsoft email and calendar integration.",
  },
  {
    icon: ShoppingBag,
    name: "Shopify",
    detail: "Order lookup, returns, and inventory queries.",
  },
  {
    icon: CreditCard,
    name: "Stripe",
    detail: "Billing, invoices, and payment status lookup.",
  },
  {
    icon: Workflow,
    name: "Salesforce",
    detail: "Full CRM sync — contacts, leads, opportunities.",
  },
  {
    icon: Workflow,
    name: "Zapier",
    detail: "Connect Wireline to 5,000+ apps via Zap triggers.",
  },
] as const;

function ConnectedCard({ tool }: { tool: (typeof connectedTools)[number] }) {
  const Icon = tool.icon;
  return (
    <article className="min-h-[190px] rounded-[16px] border border-[var(--wireline-color-feedback-success-border)] bg-card p-6 shadow-[var(--wireline-elevation-sm)]">
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
          <Icon size={17} aria-hidden="true" />
        </span>
        <span className="rounded-md bg-[var(--wireline-color-feedback-success-surface)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-primary">
          Connected
        </span>
      </div>
      <h2 className="mt-7 text-sm font-semibold text-foreground">{tool.name}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{tool.detail}</p>
      <button
        type="button"
        className="mt-5 text-sm font-semibold text-[var(--wireline-color-status-warning)]"
      >
        Disconnect
      </button>
    </article>
  );
}

function AvailableCard({ tool }: { tool: (typeof availableTools)[number] }) {
  const Icon = tool.icon;
  return (
    <article className="min-h-[190px] rounded-[16px] border border-border bg-card p-6 transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-[var(--wireline-elevation-md)]">
      <span className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-muted text-muted-foreground">
        <Icon size={17} aria-hidden="true" />
      </span>
      <h2 className="mt-7 text-sm font-semibold text-foreground">{tool.name}</h2>
      <p className="mt-2 min-h-[48px] text-sm leading-6 text-muted-foreground">{tool.detail}</p>
      <Button type="button" variant="secondary" size="sm" className="mt-4">
        Connect
      </Button>
    </article>
  );
}

export default function ConnectionsPage() {
  return (
    <WorkspaceShell title="" eyebrow="" contentClassName="pt-8 pb-10 lg:pt-10">
      <div className="mx-auto flex w-full max-w-[940px] flex-col gap-7 pb-10">
        <section>
          <h1 className="wl-display-3">Connections</h1>
          <p className="mt-5 max-w-[48ch] text-sm leading-7 text-muted-foreground">
            Tools your agents can use when handling a call. Connect once — any agent can use them.
          </p>
        </section>

        <section aria-label="Connected tools">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
            • Connected
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {connectedTools.map((tool) => (
              <ConnectedCard key={tool.name} tool={tool} />
            ))}
          </div>
        </section>

        <section aria-label="Available to connect">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Available to connect
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            {availableTools.map((tool) => (
              <AvailableCard key={tool.name} tool={tool} />
            ))}
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
