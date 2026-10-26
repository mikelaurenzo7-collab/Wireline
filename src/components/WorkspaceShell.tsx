import { useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { Link, useLocation } from "react-router";
import { ChevronsLeft, ChevronsRight, Search } from "lucide-react";

import ActivationNudge from "./ActivationNudge";
import BotMark from "./BotMark";
import EmailVerifyBanner from "./layout/EmailVerifyBanner";
import MobileNavMoreSheet from "./layout/MobileNavMoreSheet";
import SkipToContentLink from "./layout/SkipToContentLink";
import WorkspaceResizablePanel from "./layout/WorkspaceResizablePanel";
import { BotBoundWordmark } from "./brand/BotBoundBrand";
import BotBoundMark from "./brand/BotBoundMark";
import { useAuth } from "../contexts/AuthContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
import { useChromeHeight } from "../hooks/useChromeHeight";
import { workspaceSidebarLabel } from "../lib/user-display";
import {
  MOBILE_MORE_HREF,
  MOBILE_PRIMARY_NAV,
  NAV_SHORTCUT_HINTS,
  OPERATE_NAV,
  WORKSPACE_NAV,
  desktopNavParentHref,
  isMobilePrimaryActive,
  isNavActive,
  scopedWorkspaceHref,
  type ShellNavItem,
} from "../constants/navigation";
import { navIcon } from "./nav-icons";
import { WiredEyebrow } from "./ui/WiredEyebrow";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/shadcn/Tooltip";

// Legacy persistence/native identifiers intentionally remain stable through the
// visible BotBound rebrand so existing installs and saved UI state do not reset.
const WORKSPACE_RAIL_STORAGE_KEY = "wireline:workspace-rail:v1";

// Customer-language contract: singular: "Bot"; navLabel: "Workspace".

function userInitial(name?: string | null, email?: string | null) {
  const source = (name || email || "B").trim();
  return source.charAt(0).toUpperCase() || "B";
}

function RailHint({
  label,
  enabled,
  children,
}: {
  label: string;
  enabled: boolean;
  children: ReactElement;
}) {
  if (!enabled) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className="wl-shell-rail-tooltip">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function RailLink({
  item,
  pathname,
  activeOverride,
  collapsed = false,
  agentId,
}: {
  item: ShellNavItem;
  pathname: string;
  activeOverride?: boolean;
  collapsed?: boolean;
  agentId?: string | null;
}) {
  const active = activeOverride ?? isNavActive(pathname, item.href);
  const Icon = navIcon(item.icon);
  const hint = NAV_SHORTCUT_HINTS[item.href];

  return (
    <RailHint label={item.label} enabled={collapsed}>
      <Link
        to={scopedWorkspaceHref(item.href, agentId)}
        aria-label={collapsed ? item.label : undefined}
        aria-current={active ? "page" : undefined}
        title={!collapsed && hint ? `${item.label} · ${hint}` : undefined}
        data-wireline-nav-href={item.href}
        data-wireline-nav-active={active ? "true" : undefined}
        className="wl-shell-nav-item wl-focus-ring-halo"
      >
        <Icon size={17} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
        {!collapsed ? <span className="wl-shell-nav-label">{item.label}</span> : null}
      </Link>
    </RailHint>
  );
}

function DesktopNavGroup({
  label,
  items,
  pathname,
  collapsed,
  secondaryRouteParent,
  agentId,
}: {
  label: string;
  items: ShellNavItem[];
  pathname: string;
  collapsed: boolean;
  secondaryRouteParent: string | null;
  agentId?: string | null;
}) {
  return (
    <nav className="wl-shell-nav-group" aria-label={label}>
      {!collapsed ? (
        <div className="wl-shell-nav-group-label">
          <span className="wl-shell-nav-heading">{label}</span>
        </div>
      ) : null}
      {items.map((item) => (
        <RailLink
          key={item.href}
          item={item}
          pathname={pathname}
          collapsed={collapsed}
          agentId={agentId}
          activeOverride={secondaryRouteParent === item.href ? true : undefined}
        />
      ))}
    </nav>
  );
}

function MobileDockLink({
  item,
  pathname,
  moreOpen,
  onMore,
  moreTriggerRef,
}: {
  item: ShellNavItem;
  pathname: string;
  moreOpen: boolean;
  onMore: () => void;
  moreTriggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const isMore = item.href === MOBILE_MORE_HREF;
  const active = isMobilePrimaryActive(pathname, item.href);
  const Icon = navIcon(item.icon);
  const label = item.shortLabel ?? item.label;

  if (isMore) {
    return (
      <button
        ref={moreTriggerRef}
        type="button"
        aria-label="More destinations"
        aria-expanded={moreOpen}
        aria-haspopup="dialog"
        data-wireline-nav-href={MOBILE_MORE_HREF}
        data-wireline-nav-active={active ? "true" : undefined}
        onClick={onMore}
        className="wl-shell-dock-item min-h-[48px] wl-focus-ring-halo"
      >
        <Icon size={19} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
        <span>{label}</span>
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
      className="wl-shell-dock-item min-h-[48px] wl-focus-ring-halo"
    >
      <Icon size={19} strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}

function DesktopRail({
  pathname,
  collapsed,
  onToggleCollapsed,
}: {
  pathname: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const { user } = useAuth();
  const { agents, requestedId, resolvedId } = useStudioActiveAgentId();
  const { search } = useLocation();
  const scopedAgentId = requestedId?.trim() || resolvedId;
  const navPathname =
    pathname === "/studio" && new URLSearchParams(search).get("panel") === "computer"
      ? "/computer"
      : pathname;
  const displayName = workspaceSidebarLabel(user?.full_name, user?.email);
  const searchShortcut =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
      ? "⌘K"
      : "Ctrl K";
  const secondaryRouteParent = desktopNavParentHref(navPathname);
  const agent = resolvedId ? agents.find((candidate) => candidate.id === resolvedId) : undefined;
  const settingsActive = isNavActive(pathname, "/settings");

  return (
    <TooltipProvider delayDuration={180} skipDelayDuration={100}>
      <aside
        aria-label="Workspace navigation"
        data-wireline-rail-collapsed={collapsed ? "true" : undefined}
        className="wl-shell-rail hidden h-full w-full min-w-0 flex-col lg:flex"
      >
        <div className="wl-shell-brand-row">
          <RailHint label="BotBound Workspace" enabled={collapsed}>
            <Link to="/studio" aria-label="BotBound Workspace" className="wl-shell-brand-link">
              <span className="wl-shell-brand-mark">
                <BotBoundMark className="size-8" />
              </span>
              {!collapsed ? <BotBoundWordmark className="wl-shell-wordmark" /> : null}
            </Link>
          </RailHint>
          <RailHint label="Expand navigation" enabled={collapsed}>
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              aria-expanded={!collapsed}
              title={collapsed ? undefined : "Collapse navigation"}
              className="wl-shell-icon-button wl-focus-ring-halo"
            >
              {collapsed ? (
                <ChevronsRight className="size-4" aria-hidden="true" />
              ) : (
                <ChevronsLeft className="size-4" aria-hidden="true" />
              )}
            </button>
          </RailHint>
        </div>

        <RailHint label={`Search · ${searchShortcut}`} enabled={collapsed}>
          <button
            type="button"
            aria-label="Open command palette"
            className="wl-shell-search wl-focus-ring-halo"
            onClick={() => window.dispatchEvent(new CustomEvent("wireline:open-command-bar"))}
          >
            <Search size={15} strokeWidth={2} aria-hidden="true" />
            {!collapsed ? (
              <>
                <span className="wl-shell-search-label">Search</span>
                <kbd className="wl-shell-search-key">{searchShortcut}</kbd>
              </>
            ) : null}
          </button>
        </RailHint>

        {/* The Bot every page acts on keeps one fixed slot, on every route, so
          the nav below never shifts between pages. */}
        {agent ? (
          <RailHint label={agent.name} enabled={collapsed}>
            <Link
              to={`/studio?agent=${encodeURIComponent(agent.id)}`}
              aria-label={`Current Bot: ${agent.name}`}
              data-wireline-bot-selected="true"
              className="wl-shell-bot-context wl-focus-ring-halo"
            >
              <BotMark
                seed={agent.id}
                name={agent.name}
                markKey={agent.mark_key}
                size={28}
                title={agent.name}
              />
              {!collapsed ? (
                <span className="wl-shell-bot-copy">
                  <span className="wl-shell-bot-name">{agent.name}</span>
                </span>
              ) : null}
            </Link>
          </RailHint>
        ) : null}

        <DesktopNavGroup
          label="Work"
          items={WORKSPACE_NAV}
          pathname={navPathname}
          collapsed={collapsed}
          secondaryRouteParent={secondaryRouteParent}
          agentId={scopedAgentId}
        />

        <div className="wl-shell-nav-divider" />
        <DesktopNavGroup
          label="Manage"
          items={OPERATE_NAV.filter((item) => item.href !== "/settings")}
          pathname={navPathname}
          collapsed={collapsed}
          secondaryRouteParent={secondaryRouteParent}
          agentId={scopedAgentId}
        />

        <div className="wl-shell-rail-spacer" />
        <div className="wl-shell-account-zone">
          <RailHint label="Account settings" enabled={collapsed}>
            <Link
              to="/settings"
              aria-current={settingsActive ? "page" : undefined}
              data-wireline-nav-href="/settings"
              data-wireline-nav-active={settingsActive ? "true" : undefined}
              className="wl-shell-account min-h-[44px] wl-focus-ring-halo"
              aria-label="Account settings"
              title={collapsed ? undefined : "Account settings"}
            >
              <span className="wl-shell-account-avatar">
                {userInitial(user?.full_name, user?.email)}
              </span>
              {!collapsed ? (
                <span className="wl-shell-account-copy">
                  <span className="wl-shell-account-name">Settings</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {displayName}
                  </span>
                </span>
              ) : null}
            </Link>
          </RailHint>
        </div>
      </aside>
    </TooltipProvider>
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
  const dockRef = useChromeHeight(":root", "--wl-workspace-dock-height");
  const moreTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <nav ref={dockRef} aria-label="Workspace navigation" className="wl-shell-dock lg:hidden">
        <div className="wl-shell-dock-inner">
          {MOBILE_PRIMARY_NAV.map((item) => (
            <MobileDockLink
              key={item.href}
              item={item}
              pathname={pathname}
              moreOpen={moreOpen}
              onMore={() => onMoreOpen(true)}
              moreTriggerRef={moreTriggerRef}
            />
          ))}
        </div>
      </nav>
      <MobileNavMoreSheet
        open={moreOpen}
        onOpenChange={onMoreOpen}
        pathname={pathname}
        returnFocusRef={moreTriggerRef}
      />
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
  containScroll = false,
  fullBleed = false,
}: {
  title?: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  /** Keep this page in the viewport and let an inner pane scroll. */
  containScroll?: boolean;
  fullBleed?: boolean;
}) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const showHeader = Boolean(title || eyebrow || description || action);
  const mainSpacing = fullBleed
    ? "p-0 lg:pb-0"
    : "px-3 pt-2 pb-5 sm:px-6 sm:pt-3 lg:px-7 lg:pt-4 lg:pb-6";
  const contentInner = fullBleed
    ? `wl-workspace-content-inner flex w-full max-w-none flex-col ${
        containScroll ? "min-h-0 flex-1" : "h-full min-h-0 shrink-0"
      }`
    : // Document pages must grow with their content so overflow cannot consume
      // the scrollport's bottom padding and slide actions beneath the mobile dock.
      "wl-workspace-content-inner wl-shell-measure flex min-h-full w-full grow shrink-0 flex-col";

  return (
    <div className="wl-workspace-shell h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground">
      <SkipToContentLink href="#workspace-main" />
      <div className="wl-workspace-frame grid h-full min-h-0 w-full grid-cols-1 overflow-hidden lg:grid-cols-[auto_minmax(0,1fr)]">
        <WorkspaceResizablePanel
          storageKey={WORKSPACE_RAIL_STORAGE_KEY}
          side="left"
          defaultSize={232}
          minSize={208}
          maxSize={320}
          collapsedSize={68}
          defaultCollapsed={false}
          resizeHandleLabel="Resize workspace navigation"
          className="wl-workspace-rail-panel hidden lg:block"
        >
          {({ collapsed, toggleCollapsed }) => (
            <DesktopRail
              pathname={location.pathname}
              collapsed={collapsed}
              onToggleCollapsed={toggleCollapsed}
            />
          )}
        </WorkspaceResizablePanel>

        <main
          id="workspace-main"
          data-wireline-route={location.pathname}
          data-wireline-full-bleed={fullBleed ? "true" : undefined}
          className={`wl-workspace-main flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${mainSpacing}`}
        >
          {showHeader ? (
            <header className="wl-shell-commandbar">
              <div className="wl-shell-commandbar-inner wl-shell-measure md:grid-cols-[minmax(0,1fr)_auto]">
                <div className="wl-task-header flex min-w-0 flex-col items-start text-left">
                  {eyebrow ? <WiredEyebrow>{eyebrow}</WiredEyebrow> : null}
                  {title ? <h1 className="wl-shell-page-title">{title}</h1> : null}
                  {description ? <p className="wl-shell-page-description">{description}</p> : null}
                </div>
                {action ? <div className="wl-shell-page-actions">{action}</div> : null}
              </div>
            </header>
          ) : null}

          <div
            className={`wl-workspace-content flex min-h-0 flex-1 flex-col ${containScroll ? "overflow-hidden" : "overflow-y-auto overscroll-contain"} ${contentClassName}`}
          >
            <div className="wl-shell-notice-rail wl-shell-measure">
              <EmailVerifyBanner />
              <ActivationNudge className="w-full" />
            </div>
            <div className={contentInner}>{children}</div>
          </div>
        </main>
      </div>

      <MobileDock pathname={location.pathname} moreOpen={moreOpen} onMoreOpen={setMoreOpen} />
    </div>
  );
}
