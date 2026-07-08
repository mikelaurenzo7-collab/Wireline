import {
  ArrowUpRight,
  MessageSquareText,
  MonitorDown,
  Smartphone,
  Sparkles,
  TabletSmartphone,
} from "lucide-react";

import { Badge, Button } from "../components/atoms";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

const clientSurfaces = [
  {
    icon: MonitorDown,
    title: "Wireline Command",
    status: "Browser extension",
    statusVariant: "success" as const,
    action: "Install guide",
    href: "mailto:support@trywireline.com?subject=Wireline%20Command%20install%20guide",
  },
  {
    icon: Smartphone,
    title: "iPhone",
    status: "Early access",
    statusVariant: "info" as const,
    action: "TestFlight",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20iPhone%20early%20access",
  },
  {
    icon: TabletSmartphone,
    title: "Android",
    status: "Early access",
    statusVariant: "info" as const,
    action: "Internal testing",
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20Android%20early%20access",
  },
  {
    icon: MessageSquareText,
    title: "ChatGPT",
    status: "Live",
    statusVariant: "success" as const,
    action: "MCP endpoint",
    href: "https://trywireline.com/mcp",
  },
  {
    icon: Sparkles,
    title: "Claude",
    status: "Connector",
    statusVariant: "outline" as const,
    action: "Add connector",
    href: "https://claude.ai/settings/connectors",
  },
] as const;

export default function ClientAppsPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame mode="standard">
        <WorkspacePageIntro title="Apps" align="start" />
        <p className="-mt-2 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
          Install Wireline on every surface your team uses — browser, phone, and AI assistants.
        </p>
        <section
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          aria-label="Wireline apps and companion surfaces"
        >
          {clientSurfaces.map(({ icon: Icon, title, status, statusVariant, action, href }) => (
            <article
              key={title}
              className="wl-paper wl-paper-elevated group flex min-h-[132px] flex-col p-5 transition-all hover:border-primary/30"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-accent text-primary">
                  <Icon size={17} aria-hidden="true" />
                </span>
                <Badge variant={statusVariant}>{status}</Badge>
              </div>
              <h2 className="mt-5 font-[var(--wireline-font-family-display)] text-[22px] font-normal leading-tight tracking-[-0.02em] text-foreground">
                {title}
              </h2>
              <Button
                asChild
                variant="link"
                className="mt-auto w-fit px-0 pt-4 text-sm text-primary"
              >
                <a
                  href={href}
                  {...(href.startsWith("https://") ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  {action} <ArrowUpRight size={14} />
                </a>
              </Button>
            </article>
          ))}
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
