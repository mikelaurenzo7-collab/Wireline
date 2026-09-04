import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { ChevronsLeft, ChevronsRight, Search } from "lucide-react";

import ActivationNudge from "./ActivationNudge";
import EmailVerifyBanner from "./layout/EmailVerifyBanner";
import MobileNavMoreSheet from "./layout/MobileNavMoreSheet";
import SkipToContentLink from "./layout/SkipToContentLink";
import WorkspaceResizablePanel from "./layout/WorkspaceResizablePanel";
import BotMark from "./BotMark";
import { BotBoundWordmark } from "./brand/BotBoundBrand";
import BotBoundMark from "./brand/BotBoundMark";
import { useAuth } from "../contexts/AuthContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
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
  type ShellNavItem,
} from "../constants/navigation";
import { navIcon } from "./nav-icons";
import { WiredEyebrow } from "./ui/WiredEyebrow";

// Legacy persistence/native identifiers intentionally remain stable through the
// visible BotBound rebrand so existing installs and saved UI state do not reset.
const WORKSPACE_RAIL_STORAGE_KEY = "wireline:workspace-rail:v1";

// Customer-language contract: singular: "Bot"; navLabel: "Bot Studio".

function userInitial(name?: string | null, email?: string | null) {
  const source = (name || email || "B").trim();
  return source.charAt(0).toUpperCase() || "B";
}

function RailLink({
  item,
  pathname,
  activeOverride,
  collapsed = false,
}: {
  item: ShellNavItem;
  pathname: string;
  activeOverride?: boolean;
  collapsed?: boolean;
}) {
  const active = activeOverride ?? isNavActive(pathname, item.href);
  const Icon = navIcon(item.icon);
  const hint = NAV_SHORTCUT_HINTS[item.href];

  return (
    <Link
      to={item.href}
      aria-label={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : hint ? `${item.label} · ${hint}` : undefined}
      data-wireline-nav-href={item.href}
      data-wireline-nav-active={active ? "true" : undefined}
      className="wl-shell-nav-item wl-focus-ring-halo"
    >
      <Icon size={17} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
      {!collapsed ? <span className="wl-shell-nav-label">{item.label}</span> : null}
    </Link>
  );
}

function DesktopNavGroup({
  label,
  items,
  pathname,
  collapsed,
  secondaryRouteParent,
}: {
  label: string;
  items: ShellNavItem[];
  pathname: string;
  collapsed: boolean;
  secondaryRouteParent: string | null;
}) {
  return (
    <nav className="wl-shell-nav-group" aria-label={label}>
      {!collapsed ? (
        <div className="wl-shell-nav-group-label">
          <WiredEyebrow>{label}</WiredEyebrow>
        </div>
      ) : null}
      {items.map((item) => (
        <RailLink
          key={item.href}
          item={item}
          pathname={pathname}
          collapsed={collapsed}
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
}: {
  item: ShellNavItem;
  pathname: string;
  moreOpen: boolean;
  onMore: () => void;
}) {
  const isMore = item.href === MOBILE_MORE_HREF;
  const active = isMobilePrimaryActive(pathname, item.href);
  const Icon = navIcon(item.icon);
  const label = item.shortLabel ?? item.label;

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
  const { agents, resolvedId } = useStudioActiveAgentId();
  const displayName = workspaceSidebarLabel(user?.full_name, user?.email);
  const secondaryRouteParent = desktopNavParentHref(pathname);
  const agent = resolvedId ? agents.find((candidate) => candidate.id === resolvedId) : undefined;
  const settingsActive = isNavActive(pathname, "/settings");

  return (
    <aside
      aria-label="Workspace navigation"
      data-wireline-rail-collapsed={collapsed ? "true" : undefined}
      className="wl-shell-rail hidden h-full w-full min-w-0 flex-col lg:flex"
    >
      <div className="wl-shell-brand-row">
        <Link to="/studio" aria-label="BotBound Studio" className="wl-shell-brand-link">
          <span className="wl-shell-brand-mark">
            <BotBoundMark className="size-8" />
          </span>
          {!collapsed ? <BotBoundWordmark className="wl-shell-wordmark" /> : null}
        </Link>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="wl-shell-icon-button wl-shell-collapse wl-focus-ring-halo"
        >
          {collapsed ? (
            <ChevronsRight className="size-4" aria-hidden="true" />
          ) : (
            <ChevronsLeft className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>

      <button
        type="button"
        aria-label="Open command palette"
        title={collapsed ? "Search · ⌘K" : undefined}
        className="wl-shell-search wl-focus-ring-halo"
        onClick={() => window.dispatchEvent(new CustomEvent("wireline:open-command-bar"))}
      >
        <Search size={15} strokeWidth={2} aria-hidden="true" />
        {!collapsed ? (
          <>
            <span className="wl-shell-search-label">Search</span>
            <kbd className="wl-shell-search-key">⌘K</kbd>
          </>
        ) : null}
      </button>

      <DesktopNavGroup
        label="Work"
        items={WORKSPACE_NAV}
        pathname={pathname}
        collapsed={collapsed}
        secondaryRouteParent={secondaryRouteParent}
      />

      {agent ? (
        <Link
          to={`/studio?agent=${encodeURIComponent(agent.id)}`}
          aria-label={`Current Bot: ${agent.name}`}
          title={collapsed ? agent.name : undefined}
          data-wireline-bot-selected="true"
          className="wl-shell-bot-context wl-focus-ring-halo"
        >
          <BotMark
            seed={agent.id}
            name={agent.name}
            markKey={agent.mark_key}
            size={24}
            title={`${agent.name} Bot mark`}
          />
          {!collapsed ? (
            <span className="wl-shell-bot-copy">
              <span className="wl-shell-bot-name">{agent.name}</span>
            </span>
          ) : null}
        </Link>
      ) : null}

      <div className="wl-shell-nav-divider" />
      <DesktopNavGroup
        label="Manage"
        items={OPERATE_NAV.filter((item) => item.href !== "/settings")}
        pathname={pathname}
        collapsed={collapsed}
        secondaryRouteParent={secondaryRouteParent}
      />

      <div className="wl-shell-rail-spacer" />
      <div className="wl-shell-account-zone">
        <Link
          to="/settings"
          aria-current={settingsActive ? "page" : undefined}
          data-wireline-nav-href="/settings"
          data-wireline-nav-active={settingsActive ? "true" : undefined}
          className="wl-shell-account min-h-[44px] wl-focus-ring-halo"
          aria-label="Account settings"
          title={collapsed ? "Account settings" : undefined}
        >
          <span className="wl-shell-account-avatar">
            {userInitial(user?.full_name, user?.email)}
          </span>
          {!collapsed ? (
            <span className="wl-shell-account-copy">
              <span className="wl-shell-account-name">{displayName}</span>
            </span>
          ) : null}
        </Link>
      </div>
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
      <nav aria-label="Workspace navigation" className="wl-shell-dock lg:hidden">
        <div className="wl-shell-dock-inner">
          {MOBILE_PRIMARY_NAV.map((item) => (
            <MobileDockLink
              key={item.href}
              item={item}
              pathname={pathname}
              moreOpen={moreOpen}
              onMore={() => onMoreOpen(true)}
            />
          ))}
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
  const showHeader = Boolean(title || eyebrow || description || action);
  const mainSpacing = fullBleed
    ? "p-0 lg:pb-0"
    : "px-3 pt-2 pb-5 sm:px-6 sm:pt-3 lg:px-7 lg:pt-4 lg:pb-6";
  const contentInner = fullBleed
    ? "wl-workspace-content-inner flex h-full min-h-0 w-full max-w-none flex-col"
    : "wl-workspace-content-inner wl-shell-measure flex min-h-full w-full flex-1 flex-col";

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
            className={`wl-workspace-content flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain ${contentClassName}`}
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
