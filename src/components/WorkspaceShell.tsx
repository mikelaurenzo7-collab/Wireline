import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, BookOpen, Bot, Settings2, WandSparkles, Workflow, Zap } from "lucide-react";

const navigation = [
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/studio", label: "Studio", icon: WandSparkles },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/integrations", label: "Integrations", icon: Workflow },
  { href: "/ops", label: "Operate", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

export default function WorkspaceShell({
  title,
  eyebrow,
  action,
  children,
  contentClassName = "py-4",
}: {
  title: string;
  eyebrow: string;
  action?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  const location = useLocation();
  return (
    <div className="h-[100dvh] overflow-hidden bg-[#f7f7f5] text-[#1d1d1f]">
      <div className="mx-auto grid h-full max-w-[1680px] grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="z-10 flex min-h-0 flex-col border-b border-black/[.06] bg-[#f7f7f5]/95 px-3 py-2.5 backdrop-blur-sm lg:border-b-0 lg:border-r lg:px-3.5 lg:py-5">
          <div className="flex shrink-0 items-center justify-between px-1 lg:block">
            <Link to="/agents" className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-.025em]">
              <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-[#1d1d1f] text-white"><Zap size={13} fill="currentColor" /></span>
              Wireline
            </Link>
            <span className="rounded-full border border-black/[.08] bg-white/80 px-2 py-1 text-[9px] font-semibold uppercase tracking-[.14em] text-[#73737a] lg:hidden">Workspace</span>
          </div>
          <nav className="mt-2 grid grid-cols-6 gap-0.5 lg:mt-7 lg:flex lg:flex-col" aria-label="Workspace">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.href || (item.href === "/ops" && location.pathname.startsWith("/ops"));
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative inline-flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[10px] font-semibold transition lg:flex-row lg:justify-start lg:gap-2.5 lg:px-2.5 lg:py-2 lg:text-[13px] lg:font-medium ${active ? "bg-white text-[#1d1d1f] shadow-[inset_0_0_0_1px_rgba(0,0,0,.05)]" : "text-[#67676f] hover:bg-white/60 hover:text-[#1d1d1f]"}`}
                >
                  {active ? <span className="absolute bottom-1.5 left-1 top-1.5 hidden w-0.5 rounded-full bg-[#1d1d1f] lg:block" /> : null}
                  <Icon size={16} strokeWidth={active ? 2.25 : 1.9} />
                  <span className={active ? "truncate font-semibold text-[#1d1d1f]" : "truncate"}>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto hidden rounded-xl border border-black/[.06] bg-white/70 p-3 lg:block">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#73737a]">Live stack</p>
            <p className="mt-1.5 text-[11px] leading-5 text-[#505057]">Vapi · Flux · ElevenLabs</p>
            <Link to="/settings" className="mt-2 inline-flex text-[11px] font-semibold text-[#1d1d1f] underline decoration-black/[.16] underline-offset-4">Runtime settings</Link>
          </div>
        </aside>
        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden px-4 pb-4 pt-3 sm:px-6 sm:pb-5 lg:px-8 lg:pb-6 lg:pt-5 xl:px-9">
          <header className="flex shrink-0 items-end justify-between gap-3 pb-3 sm:pb-3.5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#8a8a91]">{eyebrow}</p>
              <h1 className="mt-0.5 truncate text-[24px] font-semibold tracking-[-.045em] sm:text-[28px] lg:text-[32px]">{title}</h1>
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
          </header>
          <div className={`min-h-0 flex-1 overflow-hidden ${contentClassName}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
