import {
  ArrowUpRight,
  MessageSquareText,
  MonitorDown,
  Smartphone,
  Sparkles,
  TabletSmartphone,
  Terminal,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { Badge, Button } from "../components/atoms";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import SettingsTabs from "../components/settings/SettingsTabs";
import { CLIENT_SURFACE_POSTURE } from "../lib/product-copy";

const clientSurfaces = [
  {
    icon: MonitorDown,
    title: "Wireline Command",
    blurb: "Send the page you are viewing into Studio as call or follow-up context.",
    status: CLIENT_SURFACE_POSTURE.browser.status,
    statusVariant: "info" as const,
    action: CLIENT_SURFACE_POSTURE.browser.action,
    href: "/settings/apps/command",
    emphasis: "primary" as const,
  },
  {
    icon: MessageSquareText,
    title: "ChatGPT",
    blurb: "Draft and privately simulate an AI voice agent with the account-bound MCP connector.",
    status: CLIENT_SURFACE_POSTURE.chatgpt.status,
    statusVariant: "info" as const,
    action: "MCP setup",
    href: "/settings/apps#chatgpt-mcp",
    emphasis: "primary" as const,
  },
  {
    icon: Sparkles,
    title: "Claude",
    blurb: "Add Wireline as a remote connector for the same account-bound draft tools.",
    status: CLIENT_SURFACE_POSTURE.claude.status,
    statusVariant: "info" as const,
    action: CLIENT_SURFACE_POSTURE.claude.action,
    href: "https://claude.ai/settings/connectors",
    emphasis: "primary" as const,
  },
  {
    icon: Terminal,
    title: "Cursor",
    blurb: "Register Wireline as a remote MCP server — OAuth, no separate plugin package.",
    status: CLIENT_SURFACE_POSTURE.cursor.status,
    statusVariant: "info" as const,
    action: CLIENT_SURFACE_POSTURE.cursor.action,
    href: "https://docs.cursor.com/context/mcp",
    emphasis: "primary" as const,
  },
  {
    icon: TabletSmartphone,
    title: "Android",
    blurb: "Internal beta for call wake and on-the-go approvals. Not required for launch.",
    status: CLIENT_SURFACE_POSTURE.android.status,
    statusVariant: "outline" as const,
    action: CLIENT_SURFACE_POSTURE.android.action,
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20Android%20internal%20beta",
    emphasis: "muted" as const,
  },
  {
    icon: Smartphone,
    title: "iPhone",
    blurb: "Planned native app. Join the waitlist — web Studio remains the full product.",
    status: CLIENT_SURFACE_POSTURE.ios.status,
    statusVariant: "outline" as const,
    action: CLIENT_SURFACE_POSTURE.ios.action,
    href: "mailto:support@trywireline.com?subject=Wireline%20for%20iPhone%20waitlist",
    emphasis: "muted" as const,
  },
] as const;

export default function ClientAppsPage() {
  // Mounted at both /apps (standalone) and /settings/apps. Inside Settings the
  // page must carry the settings tab strip and let the selected tab name it
  // (sr-only h1) like every sibling settings page; standalone keeps its own h1.
  const inSettings = useLocation().pathname.startsWith("/settings");
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame mode="standard">
        {inSettings ? <SettingsTabs /> : null}
        <WorkspacePageIntro title="Apps" titleHidden={inSettings} />
        <p className="mb-5 max-w-2xl text-sm leading-6 text-muted-foreground">
          {CLIENT_SURFACE_POSTURE.summary}
        </p>
        <section
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          aria-label="Wireline apps and companion surfaces"
        >
          {clientSurfaces.map(
            ({ icon: Icon, title, blurb, status, statusVariant, action, href, emphasis }) => {
              const external = href.startsWith("https://") || href.startsWith("mailto:");
              return (
                <article
                  key={title}
                  className={
                    emphasis === "muted"
                      ? "wl-paper group flex min-h-[152px] flex-col border-dashed p-5 opacity-90"
                      : "wl-paper wl-paper-elevated group flex min-h-[152px] flex-col p-5 transition-all hover:border-primary/30"
                  }
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
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{blurb}</p>
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
            },
          )}
        </section>

        <section
          id="chatgpt-mcp"
          className="wl-paper wl-paper-elevated mt-6 scroll-mt-24 p-6"
          aria-labelledby="chatgpt-mcp-heading"
        >
          <p className="wl-overline text-primary">Account-bound MCP</p>
          <h2
            id="chatgpt-mcp-heading"
            className="mt-2 font-[var(--wireline-font-family-display)] text-[22px] font-normal tracking-[-0.02em]"
          >
            Connect ChatGPT, Claude, or Cursor without leaving Wireline
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Add <code className="wl-code">https://trywireline.com/mcp</code> as a remote MCP
            connector, then sign in with your Wireline account. Draft and privately simulate here —
            numbers, dialing, training, billing, and launch stay in Studio.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild variant="editorial" size="sm">
              <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">
                Open ChatGPT <ArrowUpRight size={14} />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/developers">Public developer notes</Link>
            </Button>
          </div>
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
