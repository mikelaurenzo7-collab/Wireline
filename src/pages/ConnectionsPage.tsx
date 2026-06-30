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
    name: "SMS",
    detail: "Send confirmations and follow-ups by text.",
  },
  {
    icon: Workflow,
    name: "CRM notes",
    detail: "Log call outcomes and contact updates.",
  },
] as const;

const availableTools = [
  {
    icon: Mail,
    name: "Gmail",
    detail: "Read and send emails for approved agent workflows.",
  },
  {
    icon: Mail,
    name: "Outlook",
    detail: "Microsoft email and calendar integration.",
  },
  {
    icon: ShoppingBag,
    name: "Shopify",
    detail: "Order lookup, returns, and inventory context.",
  },
  {
    icon: CreditCard,
    name: "Stripe",
    detail: "Invoices, payment status, and billing context.",
  },
  {
    icon: Workflow,
    name: "Salesforce",
    detail: "Contacts, leads, opportunities, and call notes.",
  },
  {
    icon: Workflow,
    name: "Zapier",
    detail: "Connect Wireline to apps through approved triggers.",
  },
] as const;

function ConnectedCard({ tool }: { tool: (typeof connectedTools)[number] }) {
  const Icon = tool.icon;
  return (
    <article className="wl-card min-h-[190px] border-[var(--wireline-color-feedback-success-border)] shadow-[var(--wireline-elevation-sm)]">
      <div className="flex items-start justify-between gap-4">
        <span className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
          <Icon size={17} aria-hidden="true" />
        </span>
        <span className="rounded-md bg-[var(--wireline-color-feedback-success-surface)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-primary">
          Connected
        </span>
      </div>
      <h2 className="wl-card-heading mt-7">{tool.name}</h2>
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
    <article className="wl-card min-h-[190px] transition-all hover:-translate-y-px hover:border-primary/30 hover:shadow-[var(--wireline-elevation-md)]">
      <span className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-muted text-muted-foreground">
        <Icon size={17} aria-hidden="true" />
      </span>
      <h2 className="wl-card-heading mt-7">{tool.name}</h2>
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
          <p className="wl-eyebrow wl-eyebrow-primary">Connections</p>
          <h1 className="wl-display-3 mt-3">Tools your agents can use safely.</h1>
          <p className="wl-body mt-4 max-w-[52ch]">
            Connect once, then choose which agents may use calendar, SMS, CRM, email, and commerce context during approved workflows.
          </p>
        </section>

        <section aria-label="Connected tools">
          <p className="wl-eyebrow wl-eyebrow-primary mb-3">Connected</p>
          <div className="grid gap-4 md:grid-cols-3">
            {connectedTools.map((tool) => (
              <ConnectedCard key={tool.name} tool={tool} />
            ))}
          </div>
        </section>

        <section aria-label="Available to connect">
          <p className="wl-eyebrow mb-3">Available</p>
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
