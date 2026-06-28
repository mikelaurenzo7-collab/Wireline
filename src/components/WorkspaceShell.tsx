import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Cable,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  PlayCircle,
  Settings,
} from "lucide-react";

import WirelineMark from "./brand/WirelineMark";
import MobileBrowserUtilities from "./MobileBrowserUtilities";

const primaryNavigation = [
  { href: "/overview", label: "Home", icon: LayoutDashboard },
  { href: "/agents", label: "Fleet", icon: Bot },
  { href: "/studio", label: "Studio", icon: PlayCircle },
  { href: "/training", label: "Train", icon: GraduationCap },
  { href: "/actions", label: "Wire", icon: Cable },
  { href: "/inbox", label: "Inbox", icon: Inbox },
] as const;

const nativeNavigation = [
  { href: "/overview", label: "Home", icon: LayoutDashboard },
  { href: "/agents", label: "Fleet", icon: Bot },
  { href: "/studio", label: "Studio", icon: PlayCircle },
  { href: "/actions", label: "Wire", icon: Cable },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/settings", label: "More", icon: Settings },
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
  if (href === "/overview") return false;
  if (href === "/training" && pathname.startsWith("/knowledge")) return true;
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

function DesktopRail({ pathname }: { pathname: string }) {
  return (
    <aside
      aria-label="Workspace navigation"
      className="hidden h-[100dvh] w-[80px] shrink-0 border-r border-border bg-background lg:flex lg:flex-col lg:items-center lg:px-1 lg:py-3"
    >
      <Link
        to="/overview"
        aria-label="Wireline home"
        title="Wireline"
        className="mt-0.5 grid size-9 place-items-center rounded-lg text-primary transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
      >
        <WirelineMark className="h-[19px] w-[19px] shrink-0" />
      </Link>

      <nav className="mt-5 flex w-full flex-col items-stretch gap-px px-0.5" aria-label="Workspace">
        {primaryNavigation.map((item) => (
          <RailItem key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}
      </nav>

      <nav
        className="mt-auto flex w-full justify-center border-t border-border/50 pt-2.5"
        aria-label="Account"
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
  const isStudioRoute = location.pathname === "/studio" || location.pathname.startsWith("/studio/");
  const isHomeRoute = location.pathname === "/overview";
  const nativeAppShell = isNativeAppShell();
  const showHomeLink = !isHomeRoute && !isStudioRoute;

  return (
    <div className="wl-workspace-shell h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground">
      <a className="wl-skip-link" href="#workspace-main">
        Skip to content
      </a>
      <div className="grid h-full min-h-0 w-full overflow-hidden lg:grid-cols-[80px_minmax(0,1fr)]">
        <DesktopRail pathname={location.pathname} />
        <main
          id="workspace-main"
          data-wireline-route={location.pathname}
          className={`wl-workspace-main flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-4 pt-2 sm:px-6 sm:pt-3 lg:px-8 lg:pb-6 lg:pt-3 xl:px-10 ${
            nativeAppShell ? "pb-[calc(5.25rem+env(safe-area-inset-bottom))]" : "pb-4 sm:pb-5"
          }`}
        >
          {!isStudioRoute && (title || eyebrow || action) && (
            <div className="relative mb-4 pb-3 lg:mb-5">
              {showHomeLink ? (
                <Link
                  to="/overview"
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
            {isStudioRoute && (
              <div className="thin-studio-bar border-b border-border/50 bg-background/95 px-4 py-1 text-[10px] text-muted-foreground flex items-center gap-2 sticky top-0 z-10">
                <span>Studio</span>
                <span className="text-primary">• Direct the work.</span>
              </div>
            )}
            <div className="wl-workspace-content-inner mx-auto flex min-h-full w-full max-w-[1480px] flex-col">
              {children}
            </div>
          </div>
        </main>
      </div>
      {!nativeAppShell ? <MobileBrowserUtilities /> : null}
      {nativeAppShell ? <NativeDock pathname={location.pathname} /> : null}
    </div>
  );
}
