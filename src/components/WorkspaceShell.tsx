import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, BookOpen, Bot, Plus, Settings2, WandSparkles, Workflow } from "lucide-react";

const navigation = [
  { href: "/studio", label: "Studio", icon: WandSparkles },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/integrations", label: "Actions", icon: Workflow },
  { href: "/ops", label: "Live", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

export default function WorkspaceShell({
  title,
  eyebrow,
  action,
  children,
  contentClassName = "py-2",
}: {
  title: string;
  eyebrow: string;
  action?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  const location = useLocation();
  return (
    <div className="wl-stitch-gradient-radial h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="mx-auto grid h-full max-w-[1680px] grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[212px_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="wl-stitch-sidebar z-10 flex min-h-0 flex-col px-3 py-3 lg:px-4 lg:py-6">
          <div className="flex shrink-0 items-center justify-between px-1 lg:block">
            <Link to="/studio" className="block">
              <span className="text-[15px] font-bold tracking-[-.03em] text-primary">Wireline</span>
              <span className="wl-stitch-label mt-1 hidden lg:block">Your assistants</span>
            </Link>
            <span className="wl-stitch-label rounded-full border border-border bg-card/90 px-2 py-1 lg:hidden">Workspace</span>
          </div>
          <nav className="mt-3 grid grid-cols-6 gap-0.5 lg:mt-8 lg:flex lg:flex-col lg:gap-1" aria-label="Workspace">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active =
                location.pathname === item.href ||
                (item.href === "/studio" && location.pathname.startsWith("/studio")) ||
                (item.href === "/ops" && location.pathname.startsWith("/ops"));
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`wl-stitch-sidebar-link min-w-0 flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 text-[10px] lg:flex-row lg:justify-start lg:gap-2 lg:px-3 lg:py-2 lg:text-[13px] ${active ? "" : "font-medium"}`}
                >
                  <Icon size={16} strokeWidth={active ? 2.25 : 1.9} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto hidden flex-col gap-3 border-t border-border/50 px-1 pt-4 lg:flex">
            <div className="rounded-lg border border-border/60 bg-card/80 p-3">
              <p className="wl-stitch-label">Status</p>
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">Assistants ready</p>
            </div>
            <Link to="/studio?create=1" className="workspace-btn-primary w-full justify-center px-3 py-2.5 text-sm">
              <Plus size={16} />
              New assistant
            </Link>
          </div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden px-5 pb-5 pt-3 sm:px-7 sm:pb-6 lg:px-10 lg:pb-8 lg:pt-5 xl:px-12">
          <header className="flex shrink-0 items-end justify-between gap-4 border-b border-border/40 pb-4 sm:pb-5">
            <div className="min-w-0">
              <p className="wl-stitch-eyebrow">{eyebrow}</p>
              <h1 className="wl-stitch-headline mt-1 truncate sm:text-[28px]">{title}</h1>
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </header>
          <div className={`min-h-0 flex-1 overflow-hidden ${contentClassName}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
