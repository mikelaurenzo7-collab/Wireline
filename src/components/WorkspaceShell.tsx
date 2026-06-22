import { type ReactNode, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Bell,
  Bot,
  ChevronDown,
  CircleHelp,
  Database,
  Inbox,
  LayoutDashboard,
  Menu,
  PenLine,
  Plus,
  Settings,
  Sparkles,
  Workflow,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import WirelineMark from "./brand/WirelineMark";

const primaryNavigation = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/agents", label: "Assistants", icon: Bot },
  { href: "/studio", label: "Agent Studio", icon: PenLine },
  { href: "/knowledge", label: "Knowledge", icon: Database },
  { href: "/actions", label: "Connections", icon: Workflow },
  { href: "/inbox", label: "Inbox", icon: Inbox },
] as const;

function initials(name?: string, email?: string) {
  const value = (name || email || "W").trim();
  const words = value.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("") || "W";
}

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
  const { user } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const userInitials = useMemo(() => initials(user?.full_name, user?.email), [user?.email, user?.full_name]);
  const isActive = (href: string) =>
    location.pathname === href || (href === "/studio" && location.pathname.startsWith("/studio"));
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {drawerOpen ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-[color:var(--wl-focus)] lg:hidden"
          onClick={closeDrawer}
        />
      ) : null}
      <div className="grid min-h-[100dvh] w-full lg:grid-cols-[256px_minmax(0,1fr)]">
        <aside
          className={`wl-stitch-sidebar fixed inset-y-0 left-0 z-50 flex w-[256px] flex-col border-r border-border px-4 py-5 transition-transform duration-200 lg:sticky lg:top-0 lg:z-20 lg:h-[100dvh] lg:translate-x-0 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex shrink-0 items-start justify-between gap-3 px-1">
            <Link
              to="/overview"
              onClick={closeDrawer}
              className="flex min-w-0 items-center gap-3"
              aria-label="Wireline overview"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[4px] bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(69,30,187,0.18)]">
                <WirelineMark className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-[var(--wl-font-display)] text-[18px] font-semibold leading-5 tracking-[-.02em] text-primary">
                  Personal Workspace
                </span>
                <span className="mt-1 block text-[12px] leading-4 text-muted-foreground">Individual Mode</span>
              </span>
            </Link>
            <button
              aria-label="Close navigation"
              className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-muted-foreground lg:hidden"
              onClick={closeDrawer}
            >
              <X size={18} />
            </button>
          </div>

          <Link
            to="/studio?create=1"
            onClick={closeDrawer}
            className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-[4px] bg-primary px-4 text-[16px] font-medium text-primary-foreground shadow-[0_1px_2px_rgba(69,30,187,0.18)] transition-colors hover:bg-[color:var(--wl-accent-hover)] active:scale-[0.98]"
          >
            <Plus size={19} strokeWidth={2} />
            New Agent
          </Link>

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

          <nav className="mt-2 flex flex-col gap-1" aria-label="Account settings">
            <NavItem
              href="/settings"
              label="Settings"
              icon={Settings}
              active={isActive("/settings")}
              onNavigate={closeDrawer}
            />
          </nav>

          <div className="mt-auto border-t border-border pt-5">
            <Link
              to="/support"
              onClick={closeDrawer}
              className="wl-stitch-sidebar-link gap-3 px-3 py-2.5"
            >
              <CircleHelp size={18} strokeWidth={1.75} />
              <span>Help</span>
            </Link>
            <Link
              to="/support"
              onClick={closeDrawer}
              className="wl-stitch-sidebar-link gap-3 px-3 py-2.5"
            >
              <Sparkles size={18} strokeWidth={1.75} />
              <span>Support</span>
            </Link>
          </div>
        </aside>

        <main className="min-h-0 min-w-0 overflow-hidden">
          <header className="flex h-16 shrink-0 items-center border-b border-border bg-[color:var(--wl-surface)] px-4 sm:px-7 lg:px-8">
            <div className="flex w-full items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3 lg:w-[30%]">
                <button
                  aria-label="Open navigation"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-card text-foreground lg:hidden"
                  onClick={() => setDrawerOpen(true)}
                >
                  <Menu size={18} />
                </button>
                <div className="min-w-0 lg:hidden">
                  <p className="truncate font-[var(--wl-font-display)] text-[18px] font-semibold tracking-[-.02em]">Wireline</p>
                </div>
              </div>

              <Link to="/overview" className="hidden items-center gap-2 lg:flex" aria-label="Wireline overview">
                <WirelineMark className="h-5 w-5 text-primary" />
                <span className="font-[var(--wl-font-display)] text-[24px] font-semibold tracking-[-.03em]">Wireline</span>
              </Link>

              <div className="flex min-w-0 items-center justify-end gap-3 lg:w-[30%]">
                <button aria-label="Notifications" className="grid h-9 w-9 place-items-center rounded-md text-foreground hover:bg-muted">
                  <Bell size={18} strokeWidth={1.8} />
                </button>
                <Link to="/support" aria-label="Help" className="grid h-9 w-9 place-items-center rounded-md text-foreground hover:bg-muted">
                  <CircleHelp size={19} strokeWidth={1.8} />
                </Link>
                <span className="hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
                <button className="hidden min-h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-[14px] font-medium text-foreground hover:bg-muted sm:inline-flex" type="button">
                  <span>Switch Workspace</span>
                  <ChevronDown size={16} />
                </button>
                <span className="grid h-8 w-8 place-items-center rounded-full border border-primary/20 bg-[color:var(--wl-accent-container)] text-[11px] font-semibold text-primary" title={user?.full_name || user?.email || "Wireline account"}>
                  {userInitials}
                </span>
              </div>
            </div>
          </header>

          <section className="flex min-h-0 min-w-0 flex-col px-4 pb-5 sm:px-7 sm:pb-6 lg:px-8 lg:pb-8">
            <div className="flex min-h-[88px] shrink-0 items-end justify-between gap-4 border-b border-border pb-4 pt-6">
              <div className="min-w-0">
                {eyebrow ? <p className="wl-stitch-eyebrow">{eyebrow}</p> : null}
                <h1 className="wl-stitch-headline mt-1 truncate">{title}</h1>
              </div>
              {action ? <div className="shrink-0">{action}</div> : null}
            </div>
            <div className={`min-h-0 flex-1 overflow-hidden ${contentClassName}`}>{children}</div>
          </section>
        </main>
      </div>
    </div>
  );
}
