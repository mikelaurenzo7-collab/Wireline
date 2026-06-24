import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bot,
  Cable,
  Database,
  Inbox,
  LayoutDashboard,
  Menu,
  PenLine,
  Settings,
  X,
} from "lucide-react";
import WirelineMark from "./brand/WirelineMark";

const primaryNavigation = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/agents", label: "Assistants & agents", icon: Bot },
  { href: "/studio", label: "Studio", icon: PenLine },
  { href: "/knowledge", label: "Knowledge", icon: Database },
  { href: "/actions", label: "Connections", icon: Cable },
  { href: "/inbox", label: "Inbox", icon: Inbox },
] as const;

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof Bot;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className="wl-stitch-sidebar-link gap-3 px-3 py-2.5"
    >
      <Icon size={17} strokeWidth={active ? 2.1 : 1.75} />
      <span className="truncate normal-case tracking-normal">{label}</span>
    </Link>
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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const isActive = (href: string) =>
    location.pathname === href || (href === "/studio" && location.pathname.startsWith("/studio"));
  const isStudioRoute = location.pathname === "/studio" || location.pathname.startsWith("/studio/");
  const closeDrawer = () => setDrawerOpen(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const firstFocusable = drawerRef.current?.querySelector<HTMLElement>(
      "a[href], button:not([disabled])",
    );
    firstFocusable?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeDrawer();
      menuButtonRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  return (
    <div className="wl-workspace-shell h-[100dvh] min-h-0 overflow-hidden bg-background text-foreground">
      <a className="wl-skip-link" href="#workspace-main">
        Skip to content
      </a>
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-[color:color-mix(in_srgb,var(--foreground)_18%,transparent)] lg:hidden"
          onClick={closeDrawer}
        />
      ) : null}
      <div className="grid h-full min-h-0 w-full overflow-hidden lg:grid-cols-[256px_minmax(0,1fr)]">
        <aside
          ref={drawerRef}
          aria-label="Workspace navigation"
          aria-modal={drawerOpen ? true : undefined}
          role={drawerOpen ? "dialog" : undefined}
          className={`wl-stitch-sidebar wl-workspace-sidebar fixed inset-y-0 left-0 z-50 flex w-[256px] flex-col px-3 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[18px_0_44px_-28px_rgba(17,28,50,0.42)] transition-transform duration-200 lg:sticky lg:top-0 lg:z-10 lg:h-[100dvh] lg:w-[256px] lg:translate-x-0 lg:px-3 lg:shadow-none ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex shrink-0 items-center justify-between px-2">
            <Link
              to="/overview"
              onClick={closeDrawer}
              className="flex min-w-0 items-center gap-2.5 rounded-[var(--radius-md)] focus-visible:outline-none"
              aria-label="Wireline overview"
            >
              <WirelineMark className="h-6 w-6 shrink-0 text-[22px] leading-none text-primary" />
              <span className="min-w-0">
                <span className="block font-[var(--wl-font-display)] text-[20px] font-semibold leading-5 tracking-[-.03em] text-foreground">
                  Wireline
                </span>
                <span className="mt-1 block truncate font-mono text-[9px] font-medium lowercase tracking-[.08em] text-muted-foreground">
                  personal + business
                </span>
              </span>
            </Link>
            <button
              type="button"
              aria-label="Close navigation"
              className="wl-control-icon lg:hidden"
              onClick={() => {
                closeDrawer();
                menuButtonRef.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </div>

          <nav className="mt-7 flex flex-col gap-1" aria-label="Workspace">
            {primaryNavigation.map((item) => (
              <NavItem
                key={item.href}
                {...item}
                active={isActive(item.href)}
                onNavigate={closeDrawer}
              />
            ))}
          </nav>

          <nav className="mt-auto border-t border-border px-1 pt-4" aria-label="Account settings">
            <NavItem
              href="/settings"
              label="Settings"
              icon={Settings}
              active={isActive("/settings")}
              onNavigate={closeDrawer}
            />
          </nav>
        </aside>

        <main
          id="workspace-main"
          data-wireline-route={location.pathname}
          className="wl-workspace-main flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-4 pb-4 sm:px-6 sm:pb-5 lg:px-8 lg:pb-6 xl:px-10"
        >
          <header className="wl-workspace-header flex min-h-[68px] shrink-0 flex-col justify-center gap-3 border-b border-border py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                ref={menuButtonRef}
                type="button"
                aria-label="Open navigation"
                aria-expanded={drawerOpen}
                className="wl-control-icon lg:hidden"
                onClick={() => setDrawerOpen(true)}
              >
                <Menu size={18} />
              </button>
              <div className="min-w-0">
                {eyebrow ? <p className="wl-overline">{eyebrow}</p> : null}
                <h1 className="wl-app-page-title mt-1 truncate">{title}</h1>
              </div>
            </div>
            {action ? (
              <div className="wl-workspace-header-actions flex min-w-0 shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                {action}
              </div>
            ) : null}
          </header>
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
    </div>
  );
}
