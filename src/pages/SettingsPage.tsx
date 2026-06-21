import { Link } from "react-router-dom";
import { ArrowUpRight, FolderCog, PanelLeft, ShieldCheck, Sparkles } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";

const sections = [
  { icon: FolderCog, title: "Workspace", detail: "Business profile, hours, escalation destinations, and team access.", href: "/agents" },
  { icon: PanelLeft, title: "Voice", detail: "Phone, voice profile, turn-taking, and web/mobile mode.", href: "/studio" },
  { icon: ShieldCheck, title: "Boundaries", detail: "Action permissions, approval behavior, and the record.", href: "/ops?view=review" },
] as const;

export default function SettingsPage() {
  return (
    <WorkspaceShell eyebrow="Admin" title="Settings" contentClassName="pt-1" action={<Link to="/integrations" className="workspace-btn-secondary px-3 py-2.5 text-sm">Connections <ArrowUpRight size={14} /></Link>}>
      <div className="flex h-full min-h-0 flex-col gap-2.5">
        <section className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <Link key={section.title} to={section.href} className="wl-surface flex min-h-[118px] flex-col p-3.5 transition hover:border-black/[.14] hover:bg-white sm:min-h-[132px] sm:p-4">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#f0f0ee]"><Icon size={15} /></span>
                <h2 className="mt-2.5 text-sm font-semibold tracking-[-.02em]">{section.title}</h2>
                <p className="mt-1 hidden text-[12px] leading-5 text-[#68686f] sm:block">{section.detail}</p>
                <span className="mt-auto inline-flex items-center gap-1 pt-2.5 text-[11px] font-semibold">Open <ArrowUpRight size={12} /></span>
              </Link>
            );
          })}
        </section>
        <section className="wl-surface shrink-0 rounded-2xl border-[#1d1d1f] bg-[#1d1d1f] p-4 text-white sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-white/50">Managed runtime</p>
              <h2 className="mt-1.5 text-lg font-semibold tracking-[-.04em] sm:text-xl">One calm control plane.</h2>
              <p className="mt-2 max-w-2xl text-[12px] leading-5 text-white/72 sm:text-[13px] sm:leading-6">OpenAI manages structured work first. Gemini is the automatic failure fallback. Phone calls stay on Vapi with Deepgram Flux and ElevenLabs.</p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-[10px] font-semibold text-white/85 sm:text-[11px]"><Sparkles size={12} />OpenAI primary · Gemini fallback</div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:min-w-[280px]">
              {[["Think", "OpenAI"], ["Talk", "Vapi + Flux"], ["Sound", "ElevenLabs"]].map(([title, value], index) => (
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
