import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, BookOpen, Bot, Settings2, WandSparkles, Workflow, Zap } from "lucide-react";

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
    <div className="h-[100dvh] overflow-hidden bg-background text-foreground">
      <div className="mx-auto grid h-full max-w-[1680px] grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[212px_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="z-10 flex min-h-0 flex-col border-b border-border/60 bg-background/95 px-3 py-2.5 backdrop-blur-sm lg:border-b-0 lg:border-r lg:px-3 lg:py-4">
          <div className="flex shrink-0 items-center justify-between px-1 lg:block">
            <Link to="/studio" className="inline-flex items-center gap-2 text-[14px] font-semibold tracking-[-.025em]">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-primary text-primary-foreground"><Zap size={12} fill="currentColor" /></span>
              Wireline
            </Link>
            <span className="rounded-full border border-border bg-card/90 px-2 py-1 text-[9px] font-semibold uppercase tracking-[.14em] text-muted-foreground lg:hidden">Workspace</span>
          </div>
          <nav className="mt-2 grid grid-cols-6 gap-0.5 lg:mt-6 lg:flex lg:flex-col lg:gap-0.5" aria-label="Workspace">
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
                  className={`group relative inline-flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[10px] font-semibold transition lg:flex-row lg:justify-start lg:gap-2 lg:px-2.5 lg:py-1.5 lg:text-[12px] lg:font-medium ${active ? "bg-card text-foreground shadow-sm ring-1 ring-border/50" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}
                >
                  {active ? <span className="absolute bottom-1 left-1 top-1 hidden w-0.5 rounded-full bg-primary lg:block" /> : null}
                  <Icon size={15} strokeWidth={active ? 2.25 : 1.9} />
                  <span className={active ? "truncate font-semibold text-foreground" : "truncate"}>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto hidden rounded-xl border border-border/60 bg-card/80 p-2.5 lg:block">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">Status</p>
            <p className="mt-1 text-[11px] leading-5 text-foreground/70">All systems operational</p>
            <Link to="/settings" className="mt-1.5 inline-flex text-[11px] font-semibold text-foreground underline decoration-border underline-offset-4">View settings</Link>
          </div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden px-5 pb-5 pt-3 sm:px-7 sm:pb-6 lg:px-10 lg:pb-8 lg:pt-4 xl:px-12">
          <header className="flex shrink-0 items-end justify-between gap-4 pb-4 sm:pb-5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{eyebrow}</p>
              <h1 className="mt-1 truncate text-[22px] font-semibold tracking-[-.04em] sm:text-[26px] lg:text-[28px]">{title}</h1>
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </header>
          <div className={`min-h-0 flex-1 overflow-hidden ${contentClassName}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
