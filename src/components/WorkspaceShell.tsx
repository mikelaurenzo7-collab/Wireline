import { type ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bot, Database, Menu, PenLine, Settings, X, Zap } from "lucide-react";

const primaryNavigation = [
  { href: "/studio", label: "Studio", icon: PenLine },
  { href: "/agents", label: "Assistants", icon: Bot },
  { href: "/knowledge", label: "Knowledge", icon: Database },
  { href: "/actions", label: "Connections", icon: Zap },
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
      className="wl-stitch-sidebar-link gap-4 px-3 py-2"
    >
      <Icon size={18} strokeWidth={active ? 2.1 : 1.75} />
      <span className="truncate">{label}</span>
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
    location.pathname === href ||
    (href === "/studio" && location.pathname.startsWith("/studio"));
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {drawerOpen ? (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={closeDrawer}
        />
      ) : null}
      <div className="mx-auto grid min-h-[100dvh] max-w-[1680px] lg:grid-cols-[212px_minmax(0,1fr)]">
        <aside
          className={`wl-stitch-sidebar fixed inset-y-0 left-0 z-50 flex w-[212px] flex-col px-4 py-10 transition-transform duration-200 lg:sticky lg:top-0 lg:z-10 lg:h-[100dvh] lg:translate-x-0 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex shrink-0 items-center justify-between px-2">
            <Link to="/studio" onClick={closeDrawer} className="block">
              <span className="block text-[24px] font-semibold leading-8 tracking-[-.02em] text-foreground">
                Wireline
              </span>
              <span className="mt-1 block font-mono text-[10px] font-medium uppercase tracking-[.08em] text-muted-foreground">
                calls + messages, handled
              </span>
            </Link>
            <button
              aria-label="Close navigation"
              className="grid h-10 w-10 place-items-center border border-border bg-card text-muted-foreground lg:hidden"
              onClick={closeDrawer}
            >
              <X size={18} />
            </button>
          </div>

          <nav className="mt-10 flex flex-col gap-1" aria-label="Workspace">
            {primaryNavigation.map((item) => (
              <NavItem
                key={item.href}
                {...item}
                active={isActive(item.href)}
                onNavigate={closeDrawer}
              />
            ))}
          </nav>

          <nav className="mt-auto border-t border-transparent pt-6" aria-label="Account settings">
            <NavItem
              href="/settings"
              label="Settings"
              icon={Settings}
              active={isActive("/settings")}
              onNavigate={closeDrawer}
            />
          </nav>
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden px-4 pb-5 pt-0 sm:px-7 sm:pb-6 lg:px-10 lg:pb-8">
          <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-border">
            <div className="flex min-w-0 items-center gap-3">
              <button
                aria-label="Open navigation"
                className="grid h-10 w-10 shrink-0 place-items-center border border-border bg-card text-foreground lg:hidden"
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
          <div className={`min-h-0 flex-1 overflow-hidden ${contentClassName}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
