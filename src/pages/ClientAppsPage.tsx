import {
  ArrowUpRight,
  MessageSquareText,
  MonitorDown,
  Smartphone,
  Sparkles,
  TabletSmartphone,
  Terminal,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Badge, Button } from "../components/atoms";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import { CLIENT_SURFACE_POSTURE } from "../lib/product-copy";

const clientSurfaces = [
  {
    icon: MonitorDown,
    title: "Wireline Command",
    status: CLIENT_SURFACE_POSTURE.browser.status,
    statusVariant: "info" as const,
    action: CLIENT_SURFACE_POSTURE.browser.action,
    href: "/settings/apps/command",
  },
  {
    icon: Smartphone,
    title: "iPhone",
    status: CLIENT_SURFACE_POSTURE.ios.status,
    statusVariant: "outline" as const,
    action: CLIENT_SURFACE_POSTURE.ios.action,
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20iPhone%20waitlist",
  },
  {
    icon: TabletSmartphone,
    title: "Android",
    status: CLIENT_SURFACE_POSTURE.android.status,
    statusVariant: "info" as const,
    action: CLIENT_SURFACE_POSTURE.android.action,
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20Android%20internal%20beta",
  },
  {
    icon: MessageSquareText,
    title: "ChatGPT",
    status: CLIENT_SURFACE_POSTURE.chatgpt.status,
    statusVariant: "info" as const,
    action: CLIENT_SURFACE_POSTURE.chatgpt.action,
    href: "/developers",
  },
  {
    icon: Sparkles,
    title: "Claude",
    status: CLIENT_SURFACE_POSTURE.claude.status,
    statusVariant: "info" as const,
    action: CLIENT_SURFACE_POSTURE.claude.action,
    href: "https://claude.ai/settings/connectors",
  },
  {
    icon: Terminal,
    title: "Cursor",
    status: CLIENT_SURFACE_POSTURE.cursor.status,
    statusVariant: "info" as const,
    action: CLIENT_SURFACE_POSTURE.cursor.action,
    href: "https://docs.cursor.com/context/mcp",
  },
] as const;

export default function ClientAppsPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame mode="standard">
        <WorkspacePageIntro title="Apps" />
        <p className="mb-5 max-w-2xl text-sm leading-6 text-muted-foreground">
          {CLIENT_SURFACE_POSTURE.summary}
        </p>
        <section
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          aria-label="Wireline apps and companion surfaces"
        >
          {clientSurfaces.map(({ icon: Icon, title, status, statusVariant, action, href }) => {
            const external = href.startsWith("https://") || href.startsWith("mailto:");
            return (
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
                  {external ? (
                    <a
                      href={href}
                      {...(href.startsWith("https://")
                        ? { target: "_blank", rel: "noreferrer" }
                        : {})}
                    >
                      {action} <ArrowUpRight size={14} />
                    </a>
                  ) : (
                    <Link to={href}>
                      {action} <ArrowUpRight size={14} />
                    </Link>
                  )}
                </Button>
              </article>
            );
          })}
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
