import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  MessageSquareText,
  MonitorDown,
  Sparkles,
  Terminal,
} from "lucide-react";
import { Link, useLocation } from "react-router";

import { Badge, Button } from "../components/atoms";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import McpCoachingPanel from "../components/settings/McpCoachingPanel";
import WorkspaceShell from "../components/WorkspaceShell";
import { BOTBOUND_PRODUCTION_ORIGIN } from "../lib/brand";
import SettingsTabs from "../components/settings/SettingsTabs";
import { CLIENT_SURFACE_POSTURE } from "../lib/product-copy";

const MCP_SERVER_URL = BOTBOUND_PRODUCTION_ORIGIN + "/mcp";
const CURSOR_MCP_INSTALL_URL =
  "cursor://anysphere.cursor-deeplink/mcp/install?name=botbound&config=eyJ1cmwiOiJodHRwczovL2JvdGJvdW5kLmFwcC9tY3AifQ==";

const clientSurfaces = [
  {
    icon: MonitorDown,
    title: "BotBound Command",
    blurb: "Bring a page into Studio.",
    action: "Install Guide",
    href: "/settings/apps/command",
  },
  {
    icon: MessageSquareText,
    title: "ChatGPT",
    blurb: "Build and rehearse privately.",
    action: "Set Up",
    href: "/settings/apps#chatgpt-mcp",
  },
  {
    icon: Sparkles,
    title: "Claude",
    blurb: "Build and rehearse privately.",
    action: "Connect",
    href: "https://claude.ai/settings/connectors",
  },
  {
    icon: Terminal,
    title: "Cursor",
    blurb: "Build your Bot from your editor.",
    action: "Install Guide",
    href: "/cursor-plugin.html",
  },
] as const;

export default function ClientAppsPage() {
  const location = useLocation();
  const setupRef = useRef<HTMLDetailsElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    if (location.hash !== "#chatgpt-mcp") return;
    const id = window.setTimeout(() => {
      const setup = setupRef.current;
      if (!setup) return;
      setup.open = true;
      setup.scrollIntoView({ behavior: "smooth", block: "start" });
      setup.querySelector("summary")?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, [location.hash, location.pathname, location.key]);

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(MCP_SERVER_URL);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  return (
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame>
        <SettingsTabs />
        <WorkspacePageIntro title="Apps" titleHidden />
        <section aria-label="BotBound apps and companion surfaces">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Companion Apps</h2>
            <Badge variant="info">{CLIENT_SURFACE_POSTURE.browser.status}</Badge>
          </div>
          <div className="divide-y divide-border/60">
            {clientSurfaces.map(({ icon: Icon, title, blurb, action, href }) => {
              const external = href.startsWith("https://");
              const documentLink = href.endsWith(".html");
              return (
                <article
                  key={title}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                >
                  <span className="grid size-10 place-items-center rounded-lg bg-accent text-primary">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground">{title}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">{blurb}</p>
                  </div>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="col-start-2 w-fit sm:col-start-auto"
                  >
                    {external || documentLink ? (
                      <a
                        href={href}
                        {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                        aria-label={action + ": " + title}
                      >
                        {action}
                        <ArrowUpRight size={14} />
                      </a>
                    ) : (
                      <Link to={href} aria-label={action + ": " + title}>
                        {action}
                        <ArrowUpRight size={14} />
                      </Link>
                    )}
                  </Button>
                </article>
              );
            })}
          </div>
        </section>

        <details
          ref={setupRef}
          id="chatgpt-mcp"
          className="scroll-mt-24 border-y border-border/60 py-3"
        >
          <summary className="cursor-pointer py-2 text-sm font-semibold text-foreground wl-focus-ring-halo">
            Connection Setup
          </summary>
          <div className="space-y-3 pb-2 pt-3">
            <p className="text-sm text-muted-foreground">
              Add this URL in your app's connector settings, then sign in.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <code className="min-w-0 break-all text-sm text-foreground">{MCP_SERVER_URL}</code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copyEndpoint()}
                aria-label="Copy MCP URL"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy URL"}
              </Button>
            </div>
            {copyError ? (
              <p role="alert" className="text-sm text-muted-foreground">
                Copy the URL above manually.
              </p>
            ) : null}
            <p className="sr-only" role="status">
              {copied ? "MCP URL copied." : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              Build and rehearse privately; manage live calls, messages, numbers, and billing in
              Studio.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline" size="sm">
                <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">
                  Open ChatGPT
                  <ArrowUpRight size={14} />
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={CURSOR_MCP_INSTALL_URL}>
                  Add to Cursor
                  <ArrowUpRight size={14} />
                </a>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/developers">Developer Guide</Link>
              </Button>
            </div>
          </div>
        </details>

        <section aria-labelledby="app-access-heading">
          <h2 id="app-access-heading" className="text-lg font-semibold text-foreground">
            App Access
          </h2>
          <McpCoachingPanel />
        </section>

        <details className="border-t border-border/60 py-3">
          <summary className="cursor-pointer py-2 text-sm font-semibold text-foreground wl-focus-ring-halo">
            Mobile Apps
          </summary>
          <div className="space-y-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-foreground">Android</span>
              <Badge variant="outline">{CLIENT_SURFACE_POSTURE.android.status}</Badge>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-foreground">iPhone</span>
              <Badge variant="outline">{CLIENT_SURFACE_POSTURE.ios.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Use BotBound in your mobile browser today.
            </p>
            <Button asChild variant="link" size="sm" className="px-0">
              <Link to="/support">
                Ask About Access
                <ArrowUpRight size={14} />
              </Link>
            </Button>
          </div>
        </details>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
