import { Link } from "react-router-dom";
import { ArrowUpRight, FolderCog, PanelLeft, ShieldCheck, Sparkles } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";

const sections = [
  { icon: FolderCog, title: "Profile", detail: "Your name, hours, and contact preferences.", href: "/agents" },
  { icon: PanelLeft, title: "Voice", detail: "How your assistant sounds and responds.", href: "/studio" },
  { icon: ShieldCheck, title: "Permissions", detail: "What your assistant can and can't do.", href: "/ops?view=review" },
] as const;

export default function SettingsPage() {
  return (
    <WorkspaceShell eyebrow="Admin" title="Settings" contentClassName="pt-1" action={<Link to="/integrations" className="workspace-btn-secondary px-3 py-2 text-sm">Connections <ArrowUpRight size={13} /></Link>}>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <section className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-3">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Link key={section.title} to={section.href} className="wl-surface flex min-h-[104px] flex-col p-3 transition hover:border-border hover:bg-card sm:min-h-[112px] sm:p-3.5">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-muted"><Icon size={14} /></span>
                <h2 className="mt-2.5 text-sm font-semibold tracking-[-.02em]">{section.title}</h2>
                <p className="mt-1 hidden text-[12px] leading-5 text-muted-foreground sm:block">{section.detail}</p>
                <span className="mt-auto inline-flex items-center gap-1 pt-2.5 text-[11px] font-semibold">Open <ArrowUpRight size={12} /></span>
              </Link>
            );
          })}
        </section>
        <section className="wl-surface shrink-0 rounded-2xl border-primary bg-primary p-4 text-primary-foreground sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/50">Powered by</p>
              <h2 className="mt-1.5 text-lg font-semibold tracking-[-.04em] sm:text-xl">Best-in-class AI, handled for you.</h2>
              <p className="mt-2 max-w-2xl text-[12px] leading-5 text-white/72 sm:text-[13px] sm:leading-6">We use the latest AI models so your assistant sounds natural and handles calls reliably. You don't need to configure anything.</p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-[10px] font-semibold text-white/85 sm:text-[11px]"><Sparkles size={12} />Automatic updates included</div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[280px]">
              {[["Brain", "Latest AI"], ["Voice", "Natural speech"], ["Calls", "HD quality"]].map(([title, value], index) => (
                <div key={title} className="rounded-xl border border-white/10 bg-white/[.06] p-2.5">
                  <p className="text-[9px] font-semibold tracking-[.13em] text-white/45">0{index + 1}</p>
                  <p className="mt-2 text-[11px] font-semibold">{title}</p>
                  <p className="mt-0.5 text-[9px] text-white/65">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
