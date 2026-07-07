import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BookOpen,
  Bot,
  BarChart3,
  Home,
  Inbox,
  LayoutGrid,
  Phone,
  Settings,
  Workflow,
} from "lucide-react";

import MobileBrowserUtilities from "./MobileBrowserUtilities";
import ActivationNudge from "./ActivationNudge";
import SkipToContentLink from "./layout/SkipToContentLink";
import { useAuth } from "../contexts/AuthContext";
import { useAccount } from "../contexts/AccountContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
import { formatAgentRoleLabel } from "../lib/product-copy";
import AgentFace from "./AgentFace";
import { WiredEyebrow } from "./ui/WiredEyebrow";

type NavItem = { href: string; label: string; icon: typeof Bot };

const WORKSPACE_NAV: NavItem[] = [
  { href: "/overview", label: "Overview", icon: Home },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/connections", label: "Connections", icon: Workflow },
];

const OPERATE_NAV: NavItem[] = [
  { href: "/phone", label: "Phone", icon: Phone },
  { href: "/insights", label: "Insights", icon: BarChart3 },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/apps", label: "Apps", icon: LayoutGrid },
  { href: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_NAV: NavItem[] = [
  { href: "/overview", label: "Overview", icon: Home },
  { href: "/studio", label: "Studio", icon: Bot },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/phone", label: "Phone", icon: Phone },
  { href: "/connections", label: "Connections", icon: Workflow },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/settings", label: "Settings", icon: Settings },
];

type NativeWindow = Window & {
  WirelineNative?: unknown;
  webkit?: { messageHandlers?: Record<string, unknown> };
};

function isNativeAppShell() {
  if (typeof window === "undefined") return false;
  const currentWindow = window as NativeWindow;
  const params = new URLSearchParams(currentWindow.location.search);
  const userAgent = currentWindow.navigator.userAgent || "";
  return (
    currentWindow.WirelineNative === true ||
    currentWindow.document.documentElement.dataset.wirelineNative === "true" ||
    params.get("wireline_native") === "1" ||
    /WirelineNative|WirelineiOS|WirelineAndroid/i.test(userAgent)
  );
}

function userInitial(name?: string | null, email?: string | null) {
  const source = (name || email || "W").trim();
  return source.charAt(0).toUpperCase() || "W";
}

function readinessLabel(agent: { phone_number?: string | null } | undefined): string {
  return agent?.phone_number ? "Active" : "Training";
}

function cleanPath(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

function isActive(pathname: string, href: string) {
  const current = cleanPath(pathname);
  const target = cleanPath(href);
  if (target === "/settings") {
    return (
      current === "/settings" ||
      current.startsWith("/settings/") ||
      current === "/admin" ||
      current.startsWith("/admin/")
    );
  }
  if (target === "/studio") {
    return current === "/studio" || current.startsWith("/studio/") || current === "/agents";
  }
  return current === target || current.startsWith(`${target}/`);
}

function RailLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      aria-current={active ? "page" : undefined}
      data-wireline-nav-href={item.href}
      data-wireline-nav-active={active ? "true" : undefined}
      className="wl-rail-link"
    >
      <Icon size={16} strokeWidth={active ? 2.2 : 1.9} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

function MobileRailLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      data-wireline-nav-href={item.href}
      data-wireline-nav-active={active ? "true" : undefined}
      className={`grid min-h-[44px] flex-1 place-items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40"}`}
    >
      <Icon size={17} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
      <span className="leading-none">{item.label}</span>
    </Link>
  );
}

function DesktopRail({ pathname }: { pathname: string }) {
  const { user } = useAuth();
  const { accountType } = useAccount();
  const { agents, resolvedId } = useStudioActiveAgentId();
  const displayName = user?.full_name?.trim() || user?.email?.split("@")[0] || "Workspace";
  // Account posture, not billing tier — the actual plan lives in Settings → Billing.
  const planLabel = accountType === "business" ? "Business workspace" : "Personal workspace";
  // Inside Studio with an active agent: swap the user card for a
  // "Current agent" card that matches the prototype's sidebar footer.
  const onStudio = isActive(pathname, "/studio");
  const activeAgent =
    onStudio && resolvedId ? agents.find((agent) => agent.id === resolvedId) : undefined;

  return (
    <aside
      aria-label="Workspace navigation"
      className="hidden h-[100dvh] w-[236px] shrink-0 flex-col overflow-hidden border-r border-border bg-[color:var(--wireline-color-surface-default)] px-3.5 py-5 lg:flex"
    >
      <Link
        to="/overview"
        aria-label="Wireline"
        className="mb-1.5 flex items-center gap-2.5 px-1.5"
      >
        <span className="grid size-7 place-items-center rounded-[7px] bg-primary font-mono text-[11px] font-bold text-primary-foreground">
          W
        </span>
        <span className="font-[var(--wireline-font-family-display)] text-[19px] leading-none tracking-[-0.01em] text-foreground">
          Wireline
        </span>
      </Link>

      <WiredEyebrow className="px-2.5 pb-2 pt-2.5">Workspace</WiredEyebrow>
      <nav className="flex flex-col gap-0.5" aria-label="Workspace">
        {WORKSPACE_NAV.map((item) => (
          <RailLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col pt-4">
        <div className="flex items-center justify-between px-2.5 pb-2">
          <WiredEyebrow>Agents</WiredEyebrow>
          {agents.length ? (
            <Link
              to="/studio?create=1"
              aria-label="New agent"
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              New
            </Link>
          ) : null}
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 pr-0.5" aria-label="Agents">
          {agents.length ? (
            <>
              {/* Cap to 5 most-recent so the rail stops duplicating the full
                  Overview roster. The active agent is always pinned first so
                  the user sees the one they're working in even if it's not
                  among the most recent. */}
              {(() => {
                const activeFirst = resolvedId
                  ? [
                      ...agents.filter((agent) => agent.id === resolvedId),
                      ...agents.filter((agent) => agent.id !== resolvedId),
                    ]
                  : agents;
                const visible = activeFirst.slice(0, 5);
                const remaining = agents.length - visible.length;
                return (
                  <>
                    {visible.map((agent) => {
                      const active = isActive(pathname, "/studio") && resolvedId === agent.id;
                      return (
                        <Link
                          key={agent.id}
                          to={`/studio?agent=${encodeURIComponent(agent.id)}`}
                          aria-current={active ? "page" : undefined}
                          className={`wl-rail-agent-link flex min-h-[44px] items-center gap-2.5 rounded-[10px] px-2.5 py-2 transition-colors ${active ? "border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                        >
                          <AgentFace
                            seed={agent.name || agent.id}
                            size={28}
                            title={`${agent.name} face`}
                            className="shrink-0"
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[12px] font-semibold">
                              {agent.name}
                            </span>
                            <span className="block truncate text-[10px] text-[color:var(--wireline-color-text-secondary)]">
                              {formatAgentRoleLabel(agent.role)}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                    {remaining > 0 ? (
                      <Link
                        to="/overview"
                        className="mt-0.5 flex min-h-[36px] items-center justify-between rounded-[10px] px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <span>All agents</span>
                        <span className="font-mono text-[10px] text-[color:var(--wireline-color-text-tertiary)]">
                          {agents.length}
                        </span>
                      </Link>
                    ) : null}
                  </>
                );
              })()}
            </>
          ) : (
            <Link
              to="/studio?create=1"
              className="rounded-[10px] border border-dashed border-border px-2.5 py-3 text-[12px] text-muted-foreground hover:border-primary/30 hover:text-foreground"
            >
              Create your first agent
            </Link>
          )}
        </nav>
      </div>

      <WiredEyebrow className="shrink-0 px-2.5 pb-2 pt-4">Operate</WiredEyebrow>
      <nav className="flex shrink-0 flex-col gap-0.5" aria-label="Operate">
        {OPERATE_NAV.map((item) => (
          <RailLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      {activeAgent ? (
        <div className="mt-2 shrink-0 border-t border-border pt-3.5">
          <p className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--wireline-color-text-secondary)]">
            Current agent
          </p>
          <Link
            to={`/studio?agent=${encodeURIComponent(activeAgent.id)}`}
            className="flex items-center gap-2.5 rounded-[10px] border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] px-2.5 py-2 transition-opacity hover:opacity-90"
            aria-label={`Current agent: ${activeAgent.name}`}
          >
            <AgentFace
              seed={activeAgent.name || activeAgent.id}
              size={32}
              title={`${activeAgent.name} face`}
              className="shrink-0"
            />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-foreground">
                {activeAgent.name}
              </span>
              <span className="block truncate text-[11px] text-[color:var(--wireline-color-text-secondary)]">
                {formatAgentRoleLabel(activeAgent.role)} · {readinessLabel(activeAgent)}
              </span>
            </span>
          </Link>
        </div>
      ) : (
        <Link
          to="/settings"
          className="mt-2 flex shrink-0 items-center gap-2.5 border-t border-border pt-3.5 transition-opacity hover:opacity-80"
          aria-label="Account settings"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground">
            {userInitial(user?.full_name, user?.email)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-foreground">
              {displayName}
            </span>
            <span className="block text-[11px] text-[color:var(--wireline-color-text-secondary)]">
              {planLabel}
            </span>
          </span>
        </Link>
      )}
    </aside>
  );
}

function MobileDock({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Workspace navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-1">
        {MOBILE_NAV.map((item) => (
          <MobileRailLink key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

export default function WorkspaceShell({
  title,
  eyebrow,
  description,
  action,
  children,
  contentClassName = "pt-2 pb-8",
  fullBleed = false,
}: {
  title?: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  fullBleed?: boolean;
}) {
  const location = useLocation();
  const nativeAppShell = isNativeAppShell();
  const showHeader = Boolean(title || eyebrow || action);
  // Responsive padding scale that scales gracefully from the smallest phone
  // (≥320px, mobile dock below) up through ultra-wide desktops. The main
  // content max-w-[1480px] cap below means anything wider becomes side
  // breathing room — and at 2xl we widen so 4K+ doesn't read as starved.
  const mainSpacing = fullBleed
    ? "p-0 pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0"
    : "px-3 pt-2 pb-[calc(5.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-3 lg:px-8 lg:pt-4 lg:pb-6 xl:px-10 2xl:px-14 2xl:pt-6";
  const contentInner = fullBleed
    ? "wl-workspace-content-inner mx-0 flex h-full min-h-0 w-full max-w-none flex-col"
    : "wl-workspace-content-inner mx-auto flex min-h-full w-full max-w-[1480px] flex-col";

  return (
    <div className="wl-workspace-shell h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground">
      <SkipToContentLink href="#workspace-main" />
      <div className="grid h-full min-h-0 w-full overflow-hidden lg:grid-cols-[236px_minmax(0,1fr)]">
        <DesktopRail pathname={location.pathname} />
        <main
          id="workspace-main"
          data-wireline-route={location.pathname}
          className={`wl-workspace-main flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${mainSpacing}`}
        >
          {showHeader ? (
            <div className="relative mb-4 pb-3 lg:mb-5">
              <div className="wl-workspace-content-inner mx-auto flex w-full max-w-[1480px] items-center justify-center px-3 sm:px-6 md:px-12 lg:px-20">
                <div className="flex min-w-0 flex-col items-center text-center wl-centered-header">
                  {eyebrow ? <WiredEyebrow>{eyebrow}</WiredEyebrow> : null}
                  {title ? (
                    <h1 className="truncate font-[var(--wireline-font-family-display)] text-[clamp(1.1rem,1rem+0.5vw,1.5rem)] font-normal leading-[1.05] tracking-[-0.022em] text-foreground">
                      {title}
                    </h1>
                  ) : null}
                  {description ? (
                    <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  ) : null}
                </div>
              </div>
              {action ? (
                <div className="mt-3 flex min-w-0 items-center justify-center gap-2 md:absolute md:right-0 md:top-1/2 md:mt-0 md:-translate-y-1/2 md:justify-end">
                  {action}
                </div>
              ) : null}
              <div className="absolute bottom-0 left-0 right-0 border-b border-border/50" />
            </div>
          ) : null}
          <ActivationNudge className="mx-3 sm:mx-6" />
          <div
            className={`wl-workspace-content min-h-0 flex-1 overflow-y-auto overscroll-contain ${contentClassName}`}
          >
            <div className={contentInner}>{children}</div>
          </div>
        </main>
      </div>
      {!nativeAppShell ? <MobileBrowserUtilities /> : null}
      <MobileDock pathname={location.pathname} />
    </div>
  );
}
