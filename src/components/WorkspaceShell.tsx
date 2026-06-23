import { type ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bot,
  Database,
  Inbox,
  LayoutDashboard,
  Menu,
  PenLine,
  Settings,
  Workflow,
  X,
} from "lucide-react";
import WirelineMark from "./brand/WirelineMark";

const primaryNavigation = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/agents", label: "Assistants", icon: Bot },
  { href: "/studio", label: "Studio", icon: PenLine },
  { href: "/knowledge", label: "Knowledge", icon: Database },
  { href: "/actions", label: "Connections", icon: Workflow },
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
      <Icon size={18} strokeWidth={active ? 2.1 : 1.75} />
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
  const isActive = (href: string) =>
    location.pathname === href || (href === "/studio" && location.pathname.startsWith("/studio"));
  const isStudioRoute = location.pathname === "/studio" || location.pathname.startsWith("/studio/");
  const closeDrawer = () => setDrawerOpen(false);
  const appViewportClass = "h-[100dvh] min-h-0 overflow-hidden";

  return (
    <div className={`bg-background text-foreground ${appViewportClass}`}>
      {drawerOpen ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-[color:var(--wl-focus)] lg:hidden"
          onClick={closeDrawer}
        />
      ) : null}
      <div className="mx-auto grid h-full min-h-0 w-full max-w-[1760px] overflow-hidden lg:grid-cols-[256px_minmax(0,1fr)]">
        <aside
          className={`wl-stitch-sidebar wl-workspace-sidebar fixed inset-y-0 left-0 z-50 flex w-[256px] flex-col px-4 py-6 transition-transform duration-200 lg:sticky lg:top-0 lg:z-10 lg:h-[100dvh] lg:translate-x-0 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex shrink-0 items-center justify-between px-2">
            <Link
              to="/overview"
              onClick={closeDrawer}
              className="flex items-center gap-2.5"
              aria-label="Wireline overview"
            >
              <WirelineMark className="h-7 w-7 text-[24px] leading-none text-primary" />
              <span>
                <span className="block font-[var(--wl-font-display)] text-[22px] font-semibold leading-6 tracking-[-.02em] text-foreground">
                  Wireline
                </span>
                <span className="mt-1 block font-mono text-[10px] font-medium uppercase tracking-[.08em] text-muted-foreground">
                  calls + messages, handled
                </span>
              </span>
            </Link>
            <button
              aria-label="Close navigation"
              className="grid h-10 w-10 place-items-center rounded-md border border-border bg-card text-muted-foreground lg:hidden"
              onClick={closeDrawer}
            >
              <X size={18} />
            </button>
          </div>

          <nav className="mt-8 flex flex-col gap-1" aria-label="Workspace">
            {primaryNavigation.map((item) => (
              <NavItem
                key={item.href}
                {...item}
                active={isActive(item.href)}
                onNavigate={closeDrawer}
              />
            ))}
          </nav>

          <nav className="mt-auto border-t border-border pt-5" aria-label="Account settings">
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
          data-wireline-route={location.pathname}
          className="wl-workspace-main flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-4 pb-5 pt-0 sm:px-7 sm:pb-6 lg:px-10 lg:pb-8 xl:px-12"
        >
          <header className="wl-workspace-header flex shrink-0 flex-col items-stretch gap-2 border-b border-border sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <button
                aria-label="Open navigation"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-card text-foreground lg:hidden"
                onClick={() => setDrawerOpen(true)}
              >
                <Menu size={18} />
              </button>
              <div className="min-w-0">
                {eyebrow ? <p className="wl-stitch-eyebrow">{eyebrow}</p> : null}
                <h1 className="wl-stitch-headline mt-1 truncate">{title}</h1>
              </div>
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </header>
          <div
            className={`wl-workspace-content min-h-0 flex-1 ${
              isStudioRoute ? "overflow-hidden" : "overflow-y-auto overscroll-contain"
            } ${contentClassName}`}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
