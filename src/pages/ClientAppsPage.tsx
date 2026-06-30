import { ArrowUpRight, Car, MessageSquareText, MonitorDown, Smartphone } from "lucide-react";

import { Badge, Button } from "../components/atoms";
import WorkspaceShell from "../components/WorkspaceShell";

const clientSurfaces = [
  {
    icon: MonitorDown,
    title: "Wireline Command",
    status: "Private preview",
    statusVariant: "warning" as const,
    description: "Bring the page you are on into Studio.",
    detail: "Selected text, title, URL, and linked numbers — only when you invoke it.",
    action: "Request preview",
    href: "mailto:support@trywireline.com?subject=Wireline%20Command%20Preview",
  },
  {
    icon: Smartphone,
    title: "Wireline for iPhone",
    status: "Release prep",
    statusVariant: "info" as const,
    description: "Run your line away from the desk.",
    detail: "Siri, Lock Screen widgets, CallKit, and approved CarPlay calling flows.",
    action: "Ask about access",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20iPhone",
  },
  {
    icon: Car,
    title: "Wireline for Android",
    status: "Release prep",
    statusVariant: "info" as const,
    description: "Control Wireline from any Android device.",
    detail: "Telecom integration, notifications, widgets, and Android Auto-ready call flows.",
    action: "Ask about access",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20Android",
  },
  {
    icon: MessageSquareText,
    title: "Wireline in ChatGPT",
    status: "Developer mode",
    statusVariant: "outline" as const,
    description: "Draft an agent in chat, finish setup here.",
    detail: "Account-bound drafts and private simulations only; launch stays in Wireline.",
    action: "Ask about access",
    href: "mailto:support@trywireline.com?subject=Wireline%20in%20ChatGPT",
  },
] as const;

export default function ClientAppsPage() {
  return (
    <WorkspaceShell title="" eyebrow="" contentClassName="pt-8 pb-10 lg:pt-10">
      <div className="mx-auto flex w-full max-w-[940px] flex-col gap-8 pb-8">
        <section>
          <p className="wl-eyebrow wl-eyebrow-primary">Control surfaces</p>
          <h1 className="wl-display-2 mt-4 max-w-[16ch]">
            One agent system, wherever the conversation starts.
          </h1>
          <p className="wl-lead mt-5 max-w-[54ch]">
            Same agents. Same rules. One protected workspace — on your desk, in your pocket, in the car, or inside the tools you already use.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2" aria-label="Wireline apps and companion surfaces">
          {clientSurfaces.map(({ icon: Icon, title, status, statusVariant, description, detail, action, href }) => (
            <article key={title} className="wl-card group flex min-h-[230px] flex-col transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--wireline-elevation-md)]">
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <Badge variant={statusVariant}>{status}</Badge>
              </div>
              <h2 className="wl-display-4 mt-6">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
              <p className="mt-3 text-xs font-medium leading-5 text-muted-foreground">{detail}</p>
              <Button asChild variant="link" className="mt-auto w-fit px-0 pt-6 text-sm text-primary">
                <a href={href}>
                  {action} <ArrowUpRight size={14} />
                </a>
              </Button>
            </article>
          ))}
        </section>

        <section className="rounded-[16px] border border-border bg-[var(--wireline-color-text-primary)] p-7 text-[var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm)]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="wl-eyebrow text-[var(--wireline-color-status-success)]">One continuous line</p>
              <p className="mt-3 font-[var(--wireline-font-family-display)] text-2xl leading-tight tracking-[-0.025em] sm:text-3xl">
                A call that starts in CarPlay finishes in your inbox.
              </p>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[rgba(247,246,243,0.72)]">
              Phone · Chat · Browser · Inbox
            </p>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
