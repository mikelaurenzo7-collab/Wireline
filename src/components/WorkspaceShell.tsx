import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { Search } from "lucide-react";

import MobileBrowserUtilities from "./MobileBrowserUtilities";
import ActivationNudge from "./ActivationNudge";
import EmailVerifyBanner from "./layout/EmailVerifyBanner";
import SkipToContentLink from "./layout/SkipToContentLink";
import MobileNavMoreSheet from "./layout/MobileNavMoreSheet";
import { useAuth } from "../contexts/AuthContext";
import { useAccount } from "../contexts/AccountContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
import { useAgents } from "../contexts/AgentsContext";
import { agentReadinessLabel } from "../lib/agent-readiness";
import { workspaceSidebarLabel } from "../lib/user-display";
import {
  MOBILE_MORE_HREF,
  MOBILE_PRIMARY_NAV,
  OPERATE_NAV,
  WORKSPACE_NAV,
  NAV_SHORTCUT_HINTS,
  desktopNavParentHref,
  isMobileMoreActive,
  isNavActive,
  type ShellNavItem,
} from "../constants/navigation";
import { navIcon } from "./nav-icons";
import { isRouteAvailableForAccount } from "../lib/account-type";
import BotMark from "./BotMark";
import { WiredEyebrow } from "./ui/WiredEyebrow";
import WirelineMark from "./brand/WirelineMark";

const BOT_LANGUAGE = {
  singular: "Bot",
  plural: "Bots",
  navLabel: "Bot Studio",
  navShort: "Studio",
} as const;

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

function contextualNavItem(item: ShellNavItem): ShellNavItem {
  if (item.href !== "/studio") return item;
  return { ...item, label: BOT_LANGUAGE.navLabel, shortLabel: BOT_LANGUAGE.navShort };
}

function RailLink({
  item,
  pathname,
  activeOverride,
}: {
  item: ShellNavItem;
  pathname: string;
  activeOverride?: boolean;
}) {
  const active = activeOverride ?? isNavActive(pathname, item.href);
  const Icon = navIcon(item.icon);
  const hint = NAV_SHORTCUT_HINTS[item.href];
  return (
    <Link
      to={item.href}
      aria-current={active ? "page" : undefined}
      title={hint ? `Shortcut ${hint}` : undefined}
      data-wireline-nav-href={item.href}
      data-wireline-nav-active={active ? "true" : undefined}
      className="wl-rail-link"
    >
      <Icon size={16} strokeWidth={active ? 2.2 : 1.9} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {hint ? (
        <kbd className="shrink-0 font-mono text-[10px] uppercase tracking-wide opacity-60">
          {hint}
        </kbd>
      ) : null}
    </Link>
  );
}

function MobileDockLink({
  item,
  pathname,
  moreOpen,
  onMore,
}: {
  item: ShellNavItem;
  pathname: string;
  moreOpen: boolean;
  onMore: () => void;
}) {
  const isMore = item.href === MOBILE_MORE_HREF;
  const active = isMore ? isMobileMoreActive(pathname) : isNavActive(pathname, item.href);
  const Icon = navIcon(item.icon);

  if (isMore) {
    return (
      <button
        type="button"
        aria-label="More destinations"
        aria-expanded={moreOpen}
        aria-haspopup="dialog"
        data-wireline-nav-href={MOBILE_MORE_HREF}
        data-wireline-nav-active={active ? "true" : undefined}
        onClick={onMore}
        className={`grid min-h-[48px] min-w-0 flex-1 place-items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold leading-none transition-colors wl-focus-ring-halo sm:text-[11px] ${
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Icon size={18} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
        <span className="block max-w-full truncate leading-none">
          {item.shortLabel ?? item.label}
        </span>
      </button>
    );
  }

  return (
    <Link
      to={item.href}
      aria-label={
        item.shortLabel && item.shortLabel !== item.label
          ? `${item.shortLabel}, ${item.label}`
          : item.label
      }
      aria-current={active ? "page" : undefined}
      data-wireline-nav-href={item.href}
      data-wireline-nav-active={active ? "true" : undefined}
      className={`grid min-h-[48px] min-w-0 flex-1 place-items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold leading-none transition-colors wl-focus-ring-halo sm:text-[11px] ${
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon size={18} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
      <span className="block max-w-full truncate leading-none">
        {item.shortLabel ?? item.label}
      </span>
    </Link>
  );
}

function DesktopRail({ pathname }: { pathname: string }) {
  const { user } = useAuth();
  const { accountType } = useAccount();
  const { agents, resolvedId } = useStudioActiveAgentId();
  const { phoneLookupDegraded } = useAgents();
  const language = BOT_LANGUAGE;
  const displayName = workspaceSidebarLabel(user?.full_name, user?.email);
  const activeAgent = resolvedId ? agents.find((agent) => agent.id === resolvedId) : undefined;
  const orderedAgents = activeAgent
    ? [activeAgent, ...agents.filter((agent) => agent.id !== activeAgent.id)]
    : agents;
  const visibleAgents = orderedAgents.slice(0, 3);
  const hiddenAgentCount = Math.max(orderedAgents.length - visibleAgents.length, 0);
  const secondaryRouteParent = desktopNavParentHref(pathname);

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
        <span className="grid size-7 place-items-center rounded-[var(--wireline-radius-sm)] bg-primary text-primary-foreground">
          <WirelineMark className="size-7" />
        </span>
        <span className="font-[var(--wireline-font-family-display)] text-[19px] leading-none tracking-[-0.01em] text-foreground">
          Wireline
        </span>
      </Link>

      <button
        type="button"
        aria-label="Open command palette"
        className="mb-3 flex min-h-[44px] w-full items-center gap-2 rounded-[var(--wireline-radius-md)] border border-border bg-muted/40 px-2.5 text-left text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo"
        onClick={() => window.dispatchEvent(new CustomEvent("wireline:open-command-bar"))}
      >
        <Search size={14} strokeWidth={2} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">Search</span>
        <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--wireline-color-text-tertiary)]">
          ⌘K
        </kbd>
      </button>

      <nav className="mt-2 flex flex-col gap-0.5" aria-label="Workspace">
        {WORKSPACE_NAV.map((rawItem) => {
          const item = contextualNavItem(rawItem);
          return (
            <RailLink
              key={item.href}
              item={item}
              pathname={pathname}
              activeOverride={secondaryRouteParent === item.href ? true : undefined}
            />
          );
        })}
      </nav>

      {agents.length ? (
        <div className="shrink-0 pt-3">
          <div className="flex items-center justify-between px-2.5 pb-2">
            <WiredEyebrow>Bots</WiredEyebrow>
            <Link
              to="/studio?create=1"
              aria-label={`New ${language.singular}`}
              className="text-[11px] font-semibold text-primary hover:underline"
            >
              New
            </Link>
          </div>
          <nav className="grid grid-cols-[minmax(0,1fr)] gap-1 pr-0.5" aria-label={language.plural}>
            {visibleAgents.map((agent) => {
              const active = isNavActive(pathname, "/studio") && resolvedId === agent.id;
              return (
                <Link
                  key={agent.id}
                  to={`/studio?agent=${encodeURIComponent(agent.id)}`}
                  aria-current={active ? "page" : undefined}
                  data-wireline-bot-selected={active ? "true" : undefined}
                  className={`wl-rail-agent-link flex min-h-[40px] items-center gap-2 rounded-[var(--wireline-radius-md)] px-2 py-1.5 ${
                    active
                      ? "border border-primary/25 bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <BotMark
                    seed={agent.id}
                    name={agent.name}
                    size={24}
                    title={`${agent.name} Bot mark`}
                    className="shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="wl-preserve-case block truncate text-[12px] font-semibold">
                      {agent.name}
                    </span>
                    <span className="block truncate text-[10px] leading-tight text-[color:var(--wireline-color-text-secondary)]">
                      {agentReadinessLabel(agent, phoneLookupDegraded)}
                    </span>
                  </span>
                </Link>
              );
            })}
            {hiddenAgentCount > 0 ? (
              <Link
                to="/studio"
                className="mt-0.5 flex min-h-[40px] items-center justify-between rounded-[var(--wireline-radius-md)] px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span>All {language.plural}</span>
                <span className="font-mono text-[10px] text-[color:var(--wireline-color-text-tertiary)]">
                  {agents.length}
                </span>
              </Link>
            ) : null}
          </nav>
        </div>
      ) : null}

      <div className="min-h-3 max-h-20 flex-1" />

      <nav className="flex shrink-0 flex-col gap-0.5" aria-label="Operate">
        <div className="px-2.5 pb-2">
          <WiredEyebrow>Operate</WiredEyebrow>
        </div>
        {OPERATE_NAV.filter(
          (item) => item.href !== "/settings" && isRouteAvailableForAccount(accountType, item.href),
        ).map((item) => (
          <RailLink
            key={item.href}
            item={item}
            pathname={pathname}
            activeOverride={secondaryRouteParent === item.href ? true : undefined}
          />
        ))}
      </nav>

      <Link
        to="/settings"
        className="mt-3 flex shrink-0 items-center gap-2.5 border-t border-border pt-3.5 transition-opacity hover:opacity-80"
        aria-label="Account settings"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground">
          {userInitial(user?.full_name, user?.email)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-foreground">
            {displayName}
          </span>
        </span>
      </Link>
    </aside>
  );
}

function MobileDock({
  pathname,
  moreOpen,
  onMoreOpen,
}: {
  pathname: string;
  moreOpen: boolean;
  onMoreOpen: (open: boolean) => void;
}) {
  return (
    <>
      <nav
        aria-label="Workspace navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-center justify-between gap-0.5">
          {MOBILE_PRIMARY_NAV.map((rawItem) => {
            const item = contextualNavItem(rawItem);
            return (
              <MobileDockLink
                key={item.href}
                item={item}
                pathname={pathname}
                moreOpen={moreOpen}
                onMore={() => onMoreOpen(true)}
              />
            );
          })}
        </div>
      </nav>
      <MobileNavMoreSheet open={moreOpen} onOpenChange={onMoreOpen} pathname={pathname} />
    </>
  );
}

export default function WorkspaceShell({
  title,
  eyebrow,
  description,
  action,
  children,
  contentClassName = "pt-2 pb-5",
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
  const [moreOpen, setMoreOpen] = useState(false);
  const nativeAppShell = isNativeAppShell();
  const showHeader = Boolean(title || eyebrow || action);
  const mainSpacing = fullBleed
    ? "p-0 lg:pb-0"
    : "px-3 pt-2 pb-5 sm:px-6 sm:pt-3 lg:px-8 lg:pt-4 lg:pb-6 xl:px-10 2xl:px-14 2xl:pt-6";
  const contentInner = fullBleed
    ? "wl-workspace-content-inner mx-0 flex h-full min-h-0 w-full max-w-none flex-col"
    : "wl-workspace-content-inner mx-auto flex min-h-full w-full max-w-[1480px] flex-1 flex-col";

  return (
    <div className="wl-workspace-shell h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground">
      <SkipToContentLink href="#workspace-main" />
      <div className="wl-workspace-frame grid h-full min-h-0 w-full overflow-hidden lg:grid-cols-[236px_minmax(0,1fr)]">
        <DesktopRail pathname={location.pathname} />
        <main
          id="workspace-main"
          data-wireline-route={location.pathname}
          className={`wl-workspace-main flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${mainSpacing}`}
        >
          {showHeader ? (
            <div className="relative mb-4 pb-3 lg:mb-5">
              <div className="wl-workspace-content-inner mx-auto grid w-full max-w-[1480px] grid-cols-1 items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6">
                <div className="wl-task-header flex min-w-0 flex-col items-start text-left">
                  {eyebrow ? <WiredEyebrow>{eyebrow}</WiredEyebrow> : null}
                  {title ? (
                    <h1 className="max-w-[32ch] break-words text-balance font-[var(--wireline-font-family-display)] text-[clamp(1.1rem,1rem+0.5vw,1.5rem)] font-normal leading-[1.05] tracking-[-0.022em] text-foreground">
                      {title}
                    </h1>
                  ) : null}
                  {description ? (
                    <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  ) : null}
                </div>
                {action ? (
                  <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 md:justify-end">
                    {action}
                  </div>
                ) : null}
              </div>
              <div className="absolute bottom-0 left-0 right-0 border-b border-border/50" />
            </div>
          ) : null}
          <div
            className={`wl-workspace-content flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain ${contentClassName}`}
          >
            <div className="mx-3 sm:mx-6">
              <EmailVerifyBanner />
            </div>
            <ActivationNudge className="mx-3 sm:mx-6" />
            <div className={contentInner}>{children}</div>
          </div>
        </main>
      </div>
      {!nativeAppShell ? <MobileBrowserUtilities /> : null}
      <MobileDock pathname={location.pathname} moreOpen={moreOpen} onMoreOpen={setMoreOpen} />
    </div>
  );
}
