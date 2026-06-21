import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity, BookOpen, Bot, Settings2, WandSparkles, Workflow, Zap } from "lucide-react";

const navigation = [
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/studio", label: "Studio", icon: WandSparkles },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/integrations", label: "Integrations", icon: Workflow },
  { href: "/ops", label: "Operations", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

export default function WorkspaceShell({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string;
  eyebrow: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-[#f7f7f5] text-[#1d1d1f]">
      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 lg:grid-cols-[224px_minmax(0,1fr)]">
        <aside className="border-b border-black/[.08] bg-white px-4 py-5 lg:border-b-0 lg:border-r">
          <Link to="/agents" className="flex items-center gap-2 px-2 text-[15px] font-semibold tracking-[-.02em]">
            <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-[#1d1d1f] text-white"><Zap size={14} fill="currentColor" /></span>
            Wireline
          </Link>
          <nav className="mt-8 flex gap-1 overflow-x-auto lg:flex-col" aria-label="Workspace">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.href || (item.href === "/ops" && location.pathname.startsWith("/ops"));
              return <Link key={item.href} to={item.href} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium transition ${active ? "bg-[#1d1d1f] text-white" : "text-[#56565d] hover:bg-[#f0f0ed] hover:text-[#1d1d1f]"}`}><Icon size={16} />{item.label}</Link>;
            })}
          </nav>
          <div className="mt-8 hidden rounded-2xl border border-black/[.08] bg-[#fafaf8] p-3 lg:block">
            <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#73737a]">Voice stack</p>
            <p className="mt-2 text-[12px] leading-5 text-[#505057]">Vapi phone handling · Deepgram Flux transcription · ElevenLabs voice.</p>
            <Link to="/settings" className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[#1d1d1f]">Review runtime →</Link>
          </div>
        </aside>
        <main className="min-w-0 px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
          <header className="flex flex-col gap-4 border-b border-black/[.08] pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#73737a]">{eyebrow}</p><h1 className="mt-1 text-3xl font-semibold tracking-[-.045em] sm:text-[34px]">{title}</h1></div>
            {action}
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
