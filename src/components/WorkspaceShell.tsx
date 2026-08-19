import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { ChevronsLeft, ChevronsRight, Search } from "lucide-react";

import MobileBrowserUtilities from "./MobileBrowserUtilities";
import ActivationNudge from "./ActivationNudge";
import EmailVerifyBanner from "./layout/EmailVerifyBanner";
import SkipToContentLink from "./layout/SkipToContentLink";
import MobileNavMoreSheet from "./layout/MobileNavMoreSheet";
import WorkspaceResizablePanel from "./layout/WorkspaceResizablePanel";
import { useAuth } from "../contexts/AuthContext";
import { useAccount } from "../contexts/AccountContext";
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
import { WiredEyebrow } from "./ui/WiredEyebrow";
import WirelineMark from "./brand/WirelineMark";

const BOT_LANGUAGE = {
  singular: "Bot",
  plural: "Bots",
  navLabel: "Bot Studio",
  navShort: "Studio",
} as const;

const WORKSPACE_RAIL_STORAGE_KEY = "wireline:workspace-rail:v1";

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
      title={collapsed ? item.label : hint ? `Shortcut ${hint}` : undefined}
      data-wireline-nav-href={item.href}
      data-wireline-nav-active={active ? "true" : undefined}
      className={`wl-rail-link ${collapsed ? "justify-center !px-0" : ""}`}
    >
      <Icon size={17} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
      {!collapsed ? <span className="min-w-0 flex-1 truncate">{item.label}</span> : null}
      {!collapsed && hint ? (
        <kbd className="shrink-0 font-mono text-[10px] uppercase tracking-wide opacity-50">
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
  const { accountType } = useAccount();
  const displayName = workspaceSidebarLabel(user?.full_name, user?.email);
  const secondaryRouteParent = desktopNavParentHref(pathname);

  return (
    <aside
      aria-label="Workspace navigation"
      data-wireline-rail-collapsed={collapsed ? "true" : undefined}
      className={`hidden h-full w-full min-w-0 flex-col overflow-hidden border-r border-border/70 bg-[color:var(--wireline-color-surface-default)] lg:flex ${
        collapsed ? "px-2 py-4" : "px-3 py-4"
      }`}
    >
      <div className={`flex h-10 shrink-0 items-center ${collapsed ? "justify-center" : "gap-2 px-1"}`}>
        <Link
          to="/studio"
          aria-label="Wireline Studio"
          className={`flex min-w-0 items-center ${collapsed ? "justify-center" : "flex-1 gap-2.5"}`}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-[var(--wireline-radius-sm)] bg-primary text-primary-foreground">
            <WirelineMark className="size-7" />
          </span>
          {!collapsed ? (
            <span className="truncate font-[var(--wireline-font-family-display)] text-[18px] leading-none tracking-[-0.01em] text-foreground">
              Wireline
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          className={`grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo ${
            collapsed ? "absolute left-[50px] top-5 z-20 bg-card shadow-sm" : ""
          }`}
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
        className={`mt-2.5 flex min-h-[40px] w-full items-center rounded-[var(--wireline-radius-md)] border border-border/80 bg-muted/35 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo ${
          collapsed ? "justify-center px-0" : "gap-2 px-2.5 text-left"
        }`}
        onClick={() => window.dispatchEvent(new CustomEvent("wireline:open-command-bar"))}
      >
        <Search size={14} strokeWidth={2} aria-hidden="true" />
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1 truncate">Search</span>
            <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--wireline-color-text-tertiary)]">
              ⌘K
            </kbd>
          </>
        ) : null}
      </button>

      <nav className="mt-4 flex flex-col gap-0.5" aria-label="Work">
        {!collapsed ? (
          <div className="px-2.5 pb-1.5">
            <WiredEyebrow>Work</WiredEyebrow>
          </div>
        ) : null}
        {WORKSPACE_NAV.map((rawItem) => {
          const item = contextualNavItem(rawItem);
          return (
            <RailLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
              activeOverride={secondaryRouteParent === item.href ? true : undefined}
            />
          );
        })}
      </nav>

      <nav
        className={`mt-3 flex shrink-0 flex-col gap-0.5 border-t border-border/60 pt-3 ${
          collapsed ? "" : ""
        }`}
        aria-label="Manage"
      >
        {!collapsed ? (
          <div className="px-2.5 pb-1.5">
            <WiredEyebrow>Manage</WiredEyebrow>
          </div>
        ) : null}
        {OPERATE_NAV.filter(
          (item) => item.href !== "/settings" && isRouteAvailableForAccount(accountType, item.href),
        ).map((item) => (
          <RailLink
            key={item.href}
            item={item}
            pathname={pathname}
            collapsed={collapsed}
            activeOverride={secondaryRouteParent === item.href ? true : undefined}
          />
        ))}
      </nav>

      <div className="min-h-4 flex-1" />

      <Link
        to="/settings"
        className={`flex min-h-[44px] shrink-0 items-center border-t border-border/70 transition-colors hover:text-foreground ${
          collapsed ? "justify-center pt-3 text-muted-foreground" : "gap-2.5 px-1 pt-3 text-foreground"
        }`}
        aria-label="Account settings"
        title={collapsed ? "Account settings" : undefined}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-[13px] font-semibold text-primary-foreground">
          {userInitial(user?.full_name, user?.email)}
        </span>
        {!collapsed ? (
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">{displayName}</span>
            <span className="block text-[10px] text-muted-foreground">Settings</span>
          </span>
        ) : null}
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
    : "px-3 pt-2 pb-5 sm:px-6 sm:pt-3 lg:px-7 lg:pt-4 lg:pb-6 xl:px-9 2xl:px-12 2xl:pt-5";
  const contentInner = fullBleed
    ? "wl-workspace-content-inner mx-0 flex h-full min-h-0 w-full max-w-none flex-col"
    : "wl-workspace-content-inner mx-auto flex min-h-full w-full max-w-[1360px] flex-1 flex-col";

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
          className="hidden lg:block"
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
          className={`wl-workspace-main flex h-full min-h-0 min-w-0 flex-col overflow-hidden ${mainSpacing}`}
        >
          {showHeader ? (
            <div className="relative mb-4 pb-3 lg:mb-5">
              <div className="wl-workspace-content-inner mx-auto grid w-full max-w-[1360px] grid-cols-1 items-center gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:gap-6">
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
