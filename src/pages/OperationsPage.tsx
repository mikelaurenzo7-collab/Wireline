import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, ArrowUpRight, Bot, CheckCircle2, CircleDot, ClipboardCheck, MessageSquareText, ShieldAlert, Workflow } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";

const views = [
  { id: "live", label: "Live", title: "Live signal", detail: "Calls, messages, and events arrive here when an agent needs attention.", icon: Activity },
  { id: "handoffs", label: "Handoffs", title: "Human handoff", detail: "Exceptions should arrive with owner, reason, context, and one clear next step.", icon: MessageSquareText },
  { id: "review", label: "Review", title: "Quality review", detail: "Post-call coaching, misses, and knowledge gaps become the next improvement.", icon: ClipboardCheck },
] as const;

export default function OperationsPage() {
  const [params, setParams] = useSearchParams();
  const viewId = params.get("view") || "live";
  const active = useMemo(() => views.find((view) => view.id === viewId) || views[0], [viewId]);
  const Icon = active.icon;
  return <WorkspaceShell eyebrow="Run" title="Operations" contentClassName="pt-3" action={<Link to="/agents" className="inline-flex items-center gap-2 rounded-xl border border-black/[.12] bg-white px-3 py-2.5 text-sm font-semibold"><Bot size={15} />Agents</Link>}>
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid shrink-0 grid-cols-3 gap-2.5">{[["Live", "0", "Active conversations"], ["Handoffs", "0", "Waiting for a human"], ["System", "Ready", "Scoped execution"]].map(([label, value, detail]) => <article key={label} className="rounded-2xl border border-black/[.08] bg-white px-3 py-3.5 sm:px-4"><p className="text-[9px] font-semibold uppercase tracking-[.13em] text-[#77777f]">{label}</p><p className="mt-2 text-lg font-semibold tracking-[-.04em] sm:text-xl">{value}</p><p className="mt-1 hidden text-[11px] leading-4 text-[#727279] sm:block">{detail}</p></article>)}</div>
      <div className="grid shrink-0 grid-cols-3 gap-1 rounded-xl bg-[#ececea] p-1">{views.map((view) => <button key={view.id} onClick={() => setParams({ view: view.id })} className={`rounded-lg px-2 py-2 text-[11px] font-semibold ${active.id === view.id ? "bg-white shadow-sm" : "text-[#727279]"}`}>{view.label}</button>)}</div>
      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_310px] lg:gap-4"><section className="flex min-h-0 flex-col rounded-2xl border border-black/[.08] bg-white p-5"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#f0f0ee]"><Icon size={18} /></span><div><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#77777f]">{active.label}</p><h2 className="mt-1 text-lg font-semibold tracking-[-.03em]">{active.title}</h2><p className="mt-1 max-w-xl text-[13px] leading-5 text-[#66666d]">{active.detail}</p></div></div><div className="grid min-h-0 flex-1 place-items-center text-center"><div><span className="mx-auto grid h-10 w-10 place-items-center rounded-2xl bg-[#f5f5f3]"><CircleDot size={17} /></span><p className="mt-3 text-sm font-semibold">Nothing needs attention right now.</p><p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-[#727279]">When work appears, this view prioritizes the next human decision rather than presenting a dashboard wall.</p></div></div></section><aside className="mt-3 hidden min-h-0 flex-col rounded-2xl border border-black/[.08] bg-white p-4 lg:flex lg:mt-0"><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#77777f]">Operating model</p><div className="mt-4 space-y-3">{[[CheckCircle2, "Observe", "Live interactions and outcomes enter the queue."], [Workflow, "Act", "Agents work only within assigned capabilities."], [ShieldAlert, "Escalate", "Unclear, high-risk, or requested handoffs go to a person."]].map(([StepIcon, title, detail]) => <div key={String(title)} className="flex gap-2.5"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#f0f0ee]"><StepIcon size={14} /></span><span><strong className="block text-xs">{title}</strong><small className="mt-0.5 block text-[11px] leading-4 text-[#717178]">{detail}</small></span></div>)}</div><Link to="/integrations" className="mt-auto inline-flex items-center gap-1 text-xs font-semibold">Review action access <ArrowUpRight size={13} /></Link></aside></div>
    </div>
  </WorkspaceShell>;
}
