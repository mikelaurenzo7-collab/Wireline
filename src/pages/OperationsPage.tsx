import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Activity, ArrowUpRight, Bot, CheckCircle2, CircleDot, ClipboardCheck, MessageSquareText, ShieldAlert, Workflow } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";

const views = [
  { id: "live", label: "Live", title: "Live activity", detail: "Calls and messages appear here when your assistant needs you.", icon: Activity },
  { id: "handoffs", label: "Handoffs", title: "Needs your input", detail: "Things your assistant couldn't handle alone.", icon: MessageSquareText },
  { id: "review", label: "Review", title: "Recent calls", detail: "Review past conversations and improve how your assistant responds.", icon: ClipboardCheck },
] as const;

export default function OperationsPage() {
  const [params, setParams] = useSearchParams();
  const viewId = params.get("view") || "live";
  const active = useMemo(() => views.find((view) => view.id === viewId) || views[0], [viewId]);
  const Icon = active.icon;
  return (
    <WorkspaceShell eyebrow="Run" title="Operations" contentClassName="pt-1" action={<Link to="/studio" className="workspace-btn-secondary px-3 py-2 text-sm"><Bot size={14} />Studio</Link>}>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="wl-stat-strip shrink-0">
          <span><strong>0</strong> live</span>
          <span className="wl-dot" aria-hidden />
          <span><strong>0</strong> handoffs</span>
          <span className="wl-dot" aria-hidden />
          <span>System ready</span>
        </div>
        <div className="wl-segmented grid shrink-0 grid-cols-3">{views.map((view) => <button key={view.id} type="button" aria-selected={active.id === view.id} className={active.id === view.id ? "is-active" : ""} onClick={() => setParams({ view: view.id })}>{view.label}</button>)}</div>
        <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-3">
          <section className="wl-surface flex min-h-0 flex-col p-4 sm:p-5">
            <div className="flex items-start gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted"><Icon size={15} /></span>
              <div>
                <h2 className="text-base font-semibold tracking-[-.03em]">{active.title}</h2>
                <p className="mt-1 max-w-xl text-[13px] leading-5 text-muted-foreground">{active.detail}</p>
              </div>
            </div>
            <div className="grid min-h-0 flex-1 place-items-center py-8 text-center">
              <div>
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-muted"><CircleDot size={17} /></span>
                <p className="mt-3 text-sm font-semibold">All clear.</p>
                <p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-muted-foreground">When your assistant needs you, it will appear here. No news is good news.</p>
              </div>
            </div>
          </section>
          <aside className="wl-surface mt-2.5 hidden min-h-0 flex-col p-4 lg:mt-0 lg:flex">
            <p className="text-[10px] font-semibold uppercase tracking-[.13em] text-muted-foreground">How it works</p>
            <div className="mt-3 space-y-3">
              {[[CheckCircle2, "Watch", "See every call and message in real time."], [Workflow, "Act", "Your assistant handles tasks you've allowed."], [ShieldAlert, "Escalate", "Anything unclear or sensitive comes to you."]].map(([StepIcon, title, detail]) => {
                const Step = StepIcon as typeof CheckCircle2;
                return (
                  <div key={String(title)} className="flex gap-2.5">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted"><Step size={14} /></span>
                    <span><strong className="block text-xs">{title}</strong><small className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{detail}</small></span>
                  </div>
                );
              })}
            </div>
            <Link to="/integrations" className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-semibold">Manage permissions <ArrowUpRight size={13} /></Link>
          </aside>
        </div>
      </div>
    </WorkspaceShell>
  );
}
