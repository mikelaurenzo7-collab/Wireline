import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bot, Cable, GraduationCap, Inbox, LayoutDashboard, PenLine, Settings } from "lucide-react";

import WirelineMark from "./brand/WirelineMark";
import MobileBrowserUtilities from "./MobileBrowserUtilities";

const primaryNavigation = [
  { href: "/overview", label: "Home", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/studio", label: "Build", icon: PenLine },
  { href: "/training", label: "Train", icon: GraduationCap },
  { href: "/actions", label: "Wire", icon: Cable },
  { href: "/inbox", label: "Inbox", icon: Inbox },
] as const;

const nativeNavigation = [
  { href: "/overview", label: "Home", icon: LayoutDashboard },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/studio", label: "Build", icon: PenLine },
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
  return (
    <Link
      to={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
      className={
        compact
          ? `grid min-h-14 flex-1 place-items-center gap-0.5 rounded-xl px-2 py-1.5 text-[var(--wireline-typography-overline-size)] font-semibold transition-colors ${
              active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`
          : `grid size-11 place-items-center rounded-xl transition-colors ${
              active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`
      }
    >
      <Icon size={compact ? 17 : 18} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
      {compact ? <span className="leading-none">{label}</span> : <span className="sr-only">{label}</span>}
    </Link>
  );
}

function DesktopRail({ pathname }: { pathname: string }) {
  return (
    <aside
      aria-label="Workspace navigation"
      className="hidden h-[100dvh] w-[72px] shrink-0 border-r border-border bg-background lg:flex lg:flex-col lg:items-center lg:px-2 lg:py-5"
    >
      <Link
        to="/overview"
        aria-label="Wireline home"
        title="Wireline"
        className="grid size-11 place-items-center rounded-xl text-primary transition-colors hover:bg-muted focus-visible:outline-none"
      >
        <WirelineMark className="h-6 w-6 shrink-0" />
      </Link>

      <nav className="mt-8 flex flex-col items-center gap-2" aria-label="Workspace">
        {primaryNavigation.map((item) => (
          <RailItem key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}
      </nav>

      <nav className="mt-auto flex justify-center pt-4" aria-label="Account">
        <RailItem href="/settings" label="Settings" icon={Settings} active={isActive(pathname, "/settings") || pathname.startsWith("/admin")} />
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
          <RailItem key={item.href} {...item} active={isActive(pathname, item.href) || (item.href === "/settings" && pathname.startsWith("/admin"))} compact />
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
  contentClassName = "py-6",
}: {
  title: string;
  eyebrow: string;
  action?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  const location = useLocation();
  const isStudioRoute = location.pathname === "/studio" || location.pathname.startsWith("/studio/");
  const nativeAppShell = isNativeAppShell();

  return (
    <div className="wl-workspace-shell h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground">
      <a className="wl-skip-link" href="#workspace-main">
        Skip to content
      </a>
      <div className="grid h-full min-h-0 w-full overflow-hidden lg:grid-cols-[72px_minmax(0,1fr)]">
        <DesktopRail pathname={location.pathname} />
        <main
          id="workspace-main"
          data-wireline-route={location.pathname}
          className={`wl-workspace-main flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-4 pt-4 sm:px-6 sm:pt-5 lg:px-8 lg:pb-6 lg:pt-6 xl:px-10 ${
            nativeAppShell ? "pb-[calc(5.25rem+env(safe-area-inset-bottom))]" : "pb-4 sm:pb-5"
          }`}
        >
          <div className="sr-only">
            {eyebrow ? <p>{eyebrow}</p> : null}
            <h1>{title}</h1>
            {action}
          </div>
          <div
            className={`wl-workspace-content min-h-0 flex-1 overflow-y-auto overscroll-contain ${
              isStudioRoute ? "overflow-hidden" : ""
            } ${contentClassName}`}
          >
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
