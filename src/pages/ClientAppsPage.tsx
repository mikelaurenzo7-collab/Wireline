import { useEffect } from "react";
import {
  ArrowUpRight,
  MessageSquareText,
  MonitorDown,
  Smartphone,
  Sparkles,
  TabletSmartphone,
  Terminal,
} from "lucide-react";
import { Link, useLocation } from "react-router";

import { Badge, Button } from "../components/atoms";
import { WirelineWordmark } from "../components/brand/WirelineBrand";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import McpCoachingPanel from "../components/settings/McpCoachingPanel";
import WorkspaceShell from "../components/WorkspaceShell";
import { BOTBOUND_PRODUCTION_ORIGIN } from "../lib/brand";
import SettingsTabs from "../components/settings/SettingsTabs";
import { CLIENT_SURFACE_POSTURE } from "../lib/product-copy";

const MCP_SERVER_URL = `${BOTBOUND_PRODUCTION_ORIGIN}/mcp`;
const CURSOR_MCP_INSTALL_URL =
  "cursor://anysphere.cursor-deeplink/mcp/install?name=wireline&config=eyJ1cmwiOiJodHRwczovL2JvdGJvdW5kLm1lL21jcCJ9";

const clientSurfaces = [
  {
    icon: MonitorDown,
    title: "BotBound Command",
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
    blurb: "Create a BotBound account, then draft and privately simulate a Voice Bot in ChatGPT.",
    status: CLIENT_SURFACE_POSTURE.chatgpt.status,
    statusVariant: "info" as const,
    action: "MCP setup",
    href: "/settings/apps#chatgpt-mcp",
    emphasis: "primary" as const,
  },
  {
    icon: Sparkles,
    title: "Claude",
    blurb: "Build your first BotBound Voice Bot from Claude with the same account-bound connector.",
    status: CLIENT_SURFACE_POSTURE.claude.status,
    statusVariant: "info" as const,
    action: CLIENT_SURFACE_POSTURE.claude.action,
    href: "https://claude.ai/settings/connectors",
    emphasis: "primary" as const,
  },
  {
    icon: Terminal,
    title: "Cursor",
    blurb:
      "Install the Cursor plugin to create a BotBound account and your first Voice Bot. Not a repo voice SDK.",
    status: CLIENT_SURFACE_POSTURE.cursor.status,
    statusVariant: "info" as const,
    action: CLIENT_SURFACE_POSTURE.cursor.action,
    href: "/cursor-plugin.html",
    emphasis: "primary" as const,
  },
  {
    icon: TabletSmartphone,
    title: "Android",
    blurb: "Internal beta for call wake and on-the-go approvals. Not required for launch.",
    status: CLIENT_SURFACE_POSTURE.android.status,
    statusVariant: "outline" as const,
    action: CLIENT_SURFACE_POSTURE.android.action,
    href: "mailto:support@trywireline.com?subject=BotBound%20for%20Android%20internal%20beta",
    emphasis: "muted" as const,
  },
  {
    icon: Smartphone,
    title: "iPhone",
    blurb: "Planned native app. Join the waitlist. Web Studio remains the full product.",
    status: CLIENT_SURFACE_POSTURE.ios.status,
    statusVariant: "outline" as const,
    action: CLIENT_SURFACE_POSTURE.ios.action,
    href: "mailto:support@trywireline.com?subject=BotBound%20for%20iPhone%20waitlist",
    emphasis: "muted" as const,
  },
] as const;

export default function ClientAppsPage() {
  const location = useLocation();
  const inSettings = location.pathname.startsWith("/settings");

  useEffect(() => {
    if (location.hash !== "#chatgpt-mcp") return;
    const id = window.setTimeout(() => {
      document.getElementById("chatgpt-mcp")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [location.hash, location.pathname]);

  return (
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame mode="standard">
        {inSettings ? <SettingsTabs /> : null}
        <WorkspacePageIntro title="Apps" titleHidden={inSettings} />
        <section
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
          aria-label="BotBound apps and companion surfaces"
        >
          {clientSurfaces.map(
            ({ icon: Icon, title, blurb, status, statusVariant, action, href, emphasis }) => {
              const documentLink = href.endsWith(".html");
              const external =
                href.startsWith("https://") || href.startsWith("mailto:") || documentLink;
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
          className="mt-6 scroll-mt-24 border-t border-border/70 pt-5"
          aria-labelledby="chatgpt-mcp-heading"
        >
          <p className="wl-overline text-primary">Account-Bound MCP</p>
          <h2
            id="chatgpt-mcp-heading"
            className="mt-2 text-base font-semibold tracking-tight text-foreground"
          >
            Build Your First Voice Bot in Cursor, ChatGPT, or Claude
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Add <code className="wl-code">{MCP_SERVER_URL}</code> where you already work. New users
            create a <WirelineWordmark inline /> account during OAuth, then build their first Voice
            Bot in that chat. Privately rehearse it there. Numbers, live calls, messaging, billing,
            and launch stay in Studio. This is not a way to embed <WirelineWordmark inline /> in
            another repo.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button asChild variant="outline" size="sm">
              <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">
                Open ChatGPT <ArrowUpRight size={14} />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer">
                Open Claude <ArrowUpRight size={14} />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/cursor-plugin.html">
                Cursor Plugin <ArrowUpRight size={14} />
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={CURSOR_MCP_INSTALL_URL}>
                Add to Cursor <ArrowUpRight size={14} />
              </a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/developers">Public Developer Notes</Link>
            </Button>
          </div>
          <McpCoachingPanel />
        </section>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
