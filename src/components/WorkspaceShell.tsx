import { type ReactNode, type Ref, useEffect, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bot, Layers, Plus, Settings } from "lucide-react";

import WirelineMark from "./brand/WirelineMark";
import MobileBrowserUtilities from "./MobileBrowserUtilities";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
import type { WorkspaceAgentSummary } from "../contexts/AgentsContext";
import { useRovingTabIndex } from "../hooks/useRovingTabIndex";

const nativeNavigation = [
  { href: "/studio", label: "Studio", icon: Layers },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

type NativeWindow = Window & {
  WirelineNative?: unknown;
  webkit?: {
    messageHandlers?: Record<string, unknown>;
  };
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

function isActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/studio" && pathname.startsWith("/studio")) return true;
  return pathname.startsWith(`${href}/`);
}

function RailItem({
  href,
  label,
  icon: Icon,
  active,
  compact = false,
}: {
  href: string;
  label: string;
  icon: typeof Bot;
  active: boolean;
  compact?: boolean;
}) {
  const isDesktopLabeled = !compact;
  return (
    <Link
      to={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
      className={
        compact
          ? `grid min-h-[44px] flex-1 place-items-center gap-0.5 rounded-xl px-2 py-1.5 text-[var(--wireline-typography-overline-size)] font-semibold transition-colors ${
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40"
            }`
          : `relative flex w-full flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-[6px] text-[10px] font-medium tracking-[0.01em] transition-all min-h-[44px] sm:min-h-0 ${
              active
                ? "bg-primary/10 text-primary after:absolute after:left-[2px] after:top-1/2 after:h-3.5 after:w-[2.5px] after:-translate-y-1/2 after:rounded-full after:bg-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40"
            }`
      }
    >
      <Icon size={compact ? 17 : 17} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
      {compact || isDesktopLabeled ? (
        <span className={compact ? "leading-none" : "leading-[1.05] text-[9.5px] text-current/80"}>
          {label}
        </span>
      ) : null}
    </Link>
  );
}

function AgentSwitcherPill({
  agent,
  active,
  compact = false,
  tabIndex = active ? 0 : -1,
  pillRef,
}: {
  agent: WorkspaceAgentSummary;
  active: boolean;
  compact?: boolean;
  tabIndex?: number;
  pillRef?: Ref<HTMLAnchorElement>;
}) {
  const initial = agent.name?.[0]?.toUpperCase() || "A";
  return (
    <Link
      ref={pillRef}
      to={`/studio?agent=${encodeURIComponent(agent.id)}`}
      role="tab"
      data-roving-tab={agent.id}
      aria-label={agent.name}
      aria-selected={active}
      aria-current={active ? "page" : undefined}
      tabIndex={tabIndex}
      title={agent.name}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-all active:scale-[0.98] min-h-[44px] min-w-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 ${
        active
          ? "border-primary/40 bg-primary/10 text-foreground ring-1 ring-primary/25"
          : "border-border/70 bg-background text-muted-foreground hover:border-primary/25 hover:bg-muted hover:text-foreground"
      } ${compact ? "px-1.5" : "sm:px-2.5"}`}
    >
      <span
        className={`grid size-5 place-items-center rounded-full text-[9px] font-semibold ${
          active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/80"
        }`}
      >
        {initial}
      </span>
      {!compact ? (
        <span className="hidden max-w-[96px] truncate sm:inline">{agent.name}</span>
      ) : null}
    </Link>
  );
}

function useAgentSwitcherA11y(agents: WorkspaceAgentSummary[], activeAgentId: string | null) {
  const navigate = useNavigate();
  const activePillRef = useRef<HTMLAnchorElement>(null);
  const agentIds = useMemo(() => agents.map((agent) => agent.id), [agents]);
  const { listRef, getTabIndex, handleKeyDown } = useRovingTabIndex({
    itemIds: agentIds,
    activeId: activeAgentId,
    onActivate: (id) => navigate(`/studio?agent=${encodeURIComponent(id)}`),
  });

  useEffect(() => {
    activePillRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeAgentId, agents.length]);

  return { listRef, getTabIndex, handleKeyDown, activePillRef };
}

function StudioAgentBar({
  agents,
  activeAgentId,
  workspaceView,
}: {
  agents: WorkspaceAgentSummary[];
  activeAgentId: string | null;
  workspaceView: boolean;
}) {
  const activeAgent = activeAgentId ? agents.find((a) => a.id === activeAgentId) : null;
  const { listRef, getTabIndex, handleKeyDown, activePillRef } = useAgentSwitcherA11y(
    agents,
    activeAgentId,
  );

  return (
    <div
      className="studio-agent-bar border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
      role="toolbar"
      aria-label="Studio controls"
    >
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        <Link
          to="/studio"
          className="shrink-0 font-semibold tracking-[-0.01em] text-foreground/90 text-xs sm:text-sm"
          aria-label="Studio canvas"
        >
          Canvas
        </Link>

        <div
          ref={listRef}
          role="tablist"
          aria-label="Agents"
          onKeyDown={handleKeyDown}
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {agents.map((agent) => (
            <AgentSwitcherPill
              key={agent.id}
              agent={agent}
              active={activeAgentId === agent.id}
              tabIndex={getTabIndex(agent.id)}
              pillRef={activeAgentId === agent.id ? activePillRef : undefined}
            />
          ))}
          <Link
            to="/studio?create=1"
            aria-label="Wire another agent"
            title="Wire another agent"
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-border/80 bg-background px-2 py-1 text-muted-foreground transition-colors hover:border-primary/35 hover:bg-muted hover:text-foreground min-h-[44px] min-w-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40"
          >
            <Plus size={14} aria-hidden="true" />
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {activeAgent ? (
            <Link
              to={
                workspaceView
                  ? `/studio?agent=${encodeURIComponent(activeAgent.id)}`
                  : `/studio?agent=${encodeURIComponent(activeAgent.id)}&view=workspace`
              }
              aria-label={workspaceView ? "Back to canvas chat" : "Open agent workspace"}
              className={`hidden sm:inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors min-h-[44px] min-w-[44px] ${
                workspaceView
                  ? "border-primary/30 bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Layers size={13} aria-hidden="true" />
              {workspaceView ? "Chat" : "Workspace"}
            </Link>
          ) : null}
          <Link
            to="/settings"
            aria-label="Settings"
            className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40"
          >
            <Settings size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {activeAgent ? (
        <div className="border-t border-border/40 px-3 py-1 text-[10px] text-muted-foreground sm:px-4">
          <span className="font-medium text-foreground/80">{activeAgent.name}</span>
          <span className="mx-1.5 opacity-40">·</span>
          <span>Direct the work. Wire it.</span>
        </div>
      ) : (
        <div className="border-t border-border/40 px-3 py-1 text-[10px] text-muted-foreground sm:px-4">
          Select an agent or wire a new one.
        </div>
      )}
    </div>
  );
}

function StudioMobileHeader({
  agents,
  activeAgentId,
  workspaceView,
}: {
  agents: WorkspaceAgentSummary[];
  activeAgentId: string | null;
  workspaceView: boolean;
}) {
  const activeAgent = activeAgentId ? agents.find((a) => a.id === activeAgentId) : null;

  return (
    <header className="flex items-center justify-between gap-2 border-b border-border/50 bg-background/95 px-3 py-2 backdrop-blur lg:hidden">
      <div className="min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground">
          Canvas
        </p>
        <p className="truncate text-sm font-semibold tracking-[-0.01em]">
          {activeAgent?.name || "Select an agent"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {activeAgent ? (
          <Link
            to={
              workspaceView
                ? `/studio?agent=${encodeURIComponent(activeAgent.id)}`
                : `/studio?agent=${encodeURIComponent(activeAgent.id)}&view=workspace`
            }
            className="rounded-lg border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted"
          >
            {workspaceView ? "Chat" : "Workspace"}
          </Link>
        ) : null}
        <Link
          to="/settings"
          aria-label="Settings"
          className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40"
        >
          <Settings size={16} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}

function BottomStudioAgentBar({
  agents,
  activeAgentId,
  className,
}: {
  agents: WorkspaceAgentSummary[];
  activeAgentId: string | null;
  className: string;
}) {
  const { listRef, getTabIndex, handleKeyDown, activePillRef } = useAgentSwitcherA11y(
    agents,
    activeAgentId,
  );

  if (!agents.length) return null;

  return (
    <nav aria-label="Agent switcher" className={className}>
      <div className="mx-auto flex max-w-2xl items-center gap-1.5">
        <div
          ref={listRef}
          role="tablist"
          aria-label="Agents"
          onKeyDown={handleKeyDown}
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {agents.map((agent) => (
            <AgentSwitcherPill
              key={agent.id}
              agent={agent}
              active={activeAgentId === agent.id}
              compact
              tabIndex={getTabIndex(agent.id)}
              pillRef={activeAgentId === agent.id ? activePillRef : undefined}
            />
          ))}
        </div>
        <Link
          to="/studio?create=1"
          aria-label="Wire another agent"
          className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full border border-dashed border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40"
        >
          <Plus size={16} aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}

function MobileStudioAgentBar({
  agents,
  activeAgentId,
}: {
  agents: WorkspaceAgentSummary[];
  activeAgentId: string | null;
}) {
  return (
    <BottomStudioAgentBar
      agents={agents}
      activeAgentId={activeAgentId}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden"
    />
  );
}

function NativeStudioAgentBar({
  agents,
  activeAgentId,
}: {
  agents: WorkspaceAgentSummary[];
  activeAgentId: string | null;
}) {
  return (
    <BottomStudioAgentBar
      agents={agents}
      activeAgentId={activeAgentId}
      className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 border-t border-border bg-background/95 px-2 pb-2 pt-2 backdrop-blur-xl lg:hidden"
    />
  );
}

function DesktopRail({ pathname }: { pathname: string }) {
  return (
    <aside
      aria-label="Workspace navigation"
      className="hidden h-[100dvh] w-[56px] shrink-0 border-r border-border bg-background lg:flex lg:flex-col lg:items-center lg:px-1 lg:py-3"
    >
      <Link
        to="/studio"
        aria-label="Studio"
        title="Studio"
        className="mt-0.5 grid size-9 place-items-center rounded-lg text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
      >
        <WirelineMark className="h-[19px] w-[19px] shrink-0" />
      </Link>

      <nav
        className="mt-auto flex w-full justify-center border-t border-border/50 pt-2.5"
        aria-label="Settings"
      >
        <RailItem
          href="/settings"
          label="Settings"
          icon={Settings}
          active={isActive(pathname, "/settings") || pathname.startsWith("/admin")}
        />
      </nav>
    </aside>
  );
}

function NativeDock({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="App navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-1">
        {nativeNavigation.map((item) => (
          <RailItem
            key={item.href}
            {...item}
            active={
              isActive(pathname, item.href) ||
              (item.href === "/settings" && pathname.startsWith("/admin"))
            }
            compact
          />
        ))}
      </div>
    </nav>
  );
}

export default function WorkspaceShell({
  title,
  eyebrow,
  action,
  children,
  contentClassName = "pt-2 pb-8",
}: {
  title: string;
  eyebrow: string;
  action?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  const location = useLocation();
  const [params] = useSearchParams();
  const { resolvedId: studioAgentId, agents } = useStudioActiveAgentId();
  const isStudioRoute =
    location.pathname === "/studio" ||
    location.pathname.startsWith("/studio/") ||
    location.pathname === "/forge";
  const isHomeRoute = location.pathname === "/studio" && !params.get("agent");
  const nativeAppShell = isNativeAppShell();
  const showHomeLink = !isHomeRoute && !isStudioRoute;

  const studioWorkspaceView = isStudioRoute && params.get("view") === "workspace";

  return (
    <div className="wl-workspace-shell h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground">
      <a className="wl-skip-link" href="#workspace-main">
        Skip to content
      </a>
      <div className="grid h-full min-h-0 w-full overflow-hidden lg:grid-cols-[56px_minmax(0,1fr)]">
        <DesktopRail pathname={location.pathname} />
        <main
          id="workspace-main"
          data-wireline-route={location.pathname}
          className={`wl-workspace-main flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${
            isStudioRoute
              ? "px-0 pt-0 lg:px-0 lg:pt-0"
              : "px-4 pt-2 sm:px-6 sm:pt-3 lg:px-8 lg:pt-3 xl:px-10"
          } ${
            isStudioRoute && !nativeAppShell
              ? "pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0"
              : nativeAppShell
                ? isStudioRoute
                  ? "pb-[calc(8.75rem+env(safe-area-inset-bottom))]"
                  : "pb-[calc(5.25rem+env(safe-area-inset-bottom))]"
                : "pb-4 sm:pb-5 lg:pb-6"
          }`}
        >
          {isStudioRoute ? (
            <>
              <div className="hidden lg:block">
                <StudioAgentBar
                  agents={agents}
                  activeAgentId={studioAgentId}
                  workspaceView={studioWorkspaceView}
                />
              </div>
              <StudioMobileHeader
                agents={agents}
                activeAgentId={studioAgentId}
                workspaceView={studioWorkspaceView}
              />
            </>
          ) : null}
          {!isStudioRoute && (title || eyebrow || action) && (
            <div className="relative mb-4 pb-3 lg:mb-5">
              {showHomeLink ? (
                <Link
                  to="/studio"
                  aria-label="Back to workspace home"
                  className="absolute left-0 top-1 z-10 inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-background px-2 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:top-1/2 md:-translate-y-1/2"
                >
                  <ArrowLeft aria-hidden="true" size={15} />
                  <span className="hidden sm:inline">Home</span>
                </Link>
              ) : null}
              <div className="wl-workspace-content-inner mx-auto flex w-full max-w-[1480px] items-center justify-center px-12 sm:px-20 md:px-28">
                <div className="flex min-w-0 flex-col items-center text-center wl-centered-header">
                  {eyebrow ? (
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                      {eyebrow}
                    </p>
                  ) : null}
                  {title ? (
                    <h1 className="truncate font-[var(--wireline-font-family-display)] text-[21px] font-semibold leading-[1.05] tracking-[-0.025em] text-foreground">
                      {title}
                    </h1>
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
          )}
          <div
            className={`wl-workspace-content min-h-0 flex-1 overflow-y-auto overscroll-contain ${
              isStudioRoute ? "overflow-hidden" : ""
            } ${contentClassName}`}
          >
            <div
              className={`wl-workspace-content-inner mx-auto flex min-h-full w-full flex-col ${
                isStudioRoute ? "max-w-none" : "max-w-[1480px]"
              }`}
            >
              {children}
            </div>
          </div>
        </main>
      </div>
      {!nativeAppShell ? <MobileBrowserUtilities /> : null}
      {isStudioRoute && !nativeAppShell ? (
        <MobileStudioAgentBar agents={agents} activeAgentId={studioAgentId} />
      ) : null}
      {isStudioRoute && nativeAppShell ? (
        <NativeStudioAgentBar agents={agents} activeAgentId={studioAgentId} />
      ) : null}
      {nativeAppShell ? <NativeDock pathname={location.pathname} /> : null}
    </div>
  );
}
