import { type ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, BookOpen, Bot, Menu, Plus, Settings2, WandSparkles, Workflow, X } from "lucide-react";

const navigation = [
  { href: "/studio", label: "Studio", icon: WandSparkles },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/actions", label: "Actions", icon: Workflow },
  { href: "/ops", label: "Live", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

export default function WorkspaceShell({ title, eyebrow, action, children, contentClassName = "py-4" }: { title: string; eyebrow: string; action?: ReactNode; children: ReactNode; contentClassName?: string }) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isActive = (href: string) => location.pathname === href || (href === "/studio" && location.pathname.startsWith("/studio")) || (href === "/ops" && location.pathname.startsWith("/ops"));

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {drawerOpen ? <button aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setDrawerOpen(false)} /> : null}
      <div className="mx-auto grid min-h-[100dvh] max-w-[1680px] lg:grid-cols-[212px_minmax(0,1fr)]">
        <aside className={`wl-stitch-sidebar fixed inset-y-0 left-0 z-50 flex w-[212px] flex-col px-4 py-8 transition-transform duration-200 lg:sticky lg:top-0 lg:z-10 lg:h-[100dvh] lg:translate-x-0 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex shrink-0 items-center justify-between px-2">
            <Link to="/studio" onClick={() => setDrawerOpen(false)} className="block"><span className="block text-[24px] font-semibold leading-8 tracking-[-.01em] text-primary">Wireline</span><span className="mt-1 block font-mono text-[10px] font-medium uppercase tracking-[.08em] text-muted-foreground">Operator console</span></Link>
            <button aria-label="Close navigation" className="grid h-10 w-10 place-items-center rounded border border-border bg-card text-muted-foreground lg:hidden" onClick={() => setDrawerOpen(false)}><X size={18} /></button>
          </div>
          <nav className="mt-8 flex flex-col gap-1" aria-label="Workspace">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return <Link key={item.href} to={item.href} aria-current={active ? "page" : undefined} onClick={() => setDrawerOpen(false)} className="wl-stitch-sidebar-link gap-4 px-3 py-2"><Icon size={16} strokeWidth={active ? 2.25 : 1.9} /><span className="truncate">{item.label}</span></Link>;
            })}
          </nav>
          <div className="mt-auto flex flex-col gap-3 border-t border-border px-2 pt-4">
            <div className="rounded-lg border border-border bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"><p className="wl-stitch-label">System</p><p className="mt-1 text-[14px] leading-5 text-muted-foreground">Assistants ready</p></div>
            <Link to="/studio?create=1" onClick={() => setDrawerOpen(false)} className="workspace-btn-primary w-full justify-center px-3 py-2.5 text-sm"><Plus size={16} />New assistant</Link>
          </div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden px-4 pb-5 pt-0 sm:px-7 sm:pb-6 lg:px-10 lg:pb-8">
          <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-border">
            <div className="flex min-w-0 items-center gap-3"><button aria-label="Open navigation" className="grid h-10 w-10 shrink-0 place-items-center rounded border border-border bg-card text-foreground lg:hidden" onClick={() => setDrawerOpen(true)}><Menu size={18} /></button><div className="min-w-0"><p className="wl-stitch-eyebrow">{eyebrow}</p><h1 className="wl-stitch-headline mt-1 truncate">{title}</h1></div></div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </header>
          <div className={`min-h-0 flex-1 overflow-hidden ${contentClassName}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
