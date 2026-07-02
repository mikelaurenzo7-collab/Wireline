import { ArrowUpRight, Car, MessageSquareText, MonitorDown, Smartphone } from "lucide-react";

import { Badge, Button } from "../components/atoms";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

const clientSurfaces = [
  {
    icon: MonitorDown,
    title: "Browser Companion",
    status: "Private preview",
    statusVariant: "warning" as const,
    description: "Bring the page you're on into Studio.",
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
    detail: "Siri, Lock Screen widgets, CallKit, and CarPlay calling flows.",
    action: "Ask about access",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20iPhone",
  },
  {
    icon: Car,
    title: "Wireline for Android",
    status: "Release prep",
    statusVariant: "info" as const,
    description: "Control Wireline from any Android device.",
    detail: "Telecom integration, notifications, widgets, and Android Auto flows.",
    action: "Ask about access",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20Android",
  },
  {
    icon: MessageSquareText,
    title: "Wireline in ChatGPT",
    status: "Developer mode",
    statusVariant: "outline" as const,
    description: "Draft an agent in chat, finish setup here.",
    detail: "Requires a connected Wireline account and Developer Mode.",
    action: "Ask about access",
    href: "mailto:support@trywireline.com?subject=Wireline%20in%20ChatGPT",
  },
] as const;

export default function ClientAppsPage() {
  return (
    <WorkspaceShell
      eyebrow="Your control surfaces"
      title="Apps"
      description="Same agents. Same setup. One protected workspace — on your desk, in your pocket, in the car, or inside the tools you already use."
      contentClassName="pt-1 pb-10"
    >
      <WorkspacePageFrame>
        <section
          className="grid gap-4 md:grid-cols-2"
          aria-label="Wireline apps and companion surfaces"
        >
          {clientSurfaces.map(
            ({ icon: Icon, title, status, statusVariant, description, detail, action, href }) => (
              <article
                key={title}
                className="studio-card group flex min-h-[230px] flex-col p-6 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[var(--wireline-elevation-md)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <Badge variant={statusVariant}>{status}</Badge>
                </div>
                <h2 className="mt-6 font-[var(--wireline-font-family-display)] text-[26px] font-normal leading-tight tracking-[-0.02em] text-foreground">
                  {title}
                </h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
                <p className="mt-3 text-xs font-medium leading-5 text-muted-foreground/80">
                  {detail}
                </p>
                <Button
                  asChild
                  variant="link"
                  className="mt-auto w-fit px-0 pt-6 text-sm text-primary"
                >
                  <a href={href}>
                    {action} <ArrowUpRight size={14} />
                  </a>
                </Button>
              </article>
            ),
          )}
        </section>

        <section className="rounded-[16px] border border-border bg-[var(--wireline-color-text-primary)] p-7 text-center text-[var(--wireline-color-text-onAction)] shadow-[var(--wireline-elevation-sm)]">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--wireline-color-status-success)]">
            One continuous line
          </p>
          <p className="mx-auto mt-3 max-w-[28ch] font-[var(--wireline-font-family-display)] text-2xl leading-tight tracking-[-0.025em] sm:text-3xl">
            A call that starts in CarPlay finishes in your Inbox.
          </p>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-white/45">
            phone · chat · browser · inbox
          </p>
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
