import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Eye, MessageSquareText, Play, ShieldAlert } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";

const views = [
  { id: "live", label: "Monitoring" },
  { id: "handoffs", label: "Handoffs" },
  { id: "review", label: "Review" },
] as const;

const reviews = [
  { name: "Inbound assistant", id: "#882-XJ", duration: "04:12", outcome: "Escalate", issue: "Needs follow-up on a request", tone: "danger" },
  { name: "Support assistant", id: "#441-PQ", duration: "12:45", outcome: "Dropped", issue: "Conversation ended before resolution", tone: "danger" },
  { name: "Scheduling assistant", id: "#902-LK", duration: "02:18", outcome: "Resolved", issue: "Flagged for quick review", tone: "success" },
] as const;

function Metric({ label, value, live }: { label: string; value: string; live?: boolean }) {
  return <div className="rounded-lg border border-border bg-card px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"><p className="font-mono text-[11px] font-medium uppercase tracking-[.05em] text-muted-foreground">{label}</p><p className="mt-2 flex items-center gap-2 text-[24px] font-semibold tracking-[-.02em] text-foreground">{live ? <span className="h-2 w-2 rounded-full bg-[color:var(--wl-status-active)]" /> : null}{value}</p></div>;
}

function EmptyLive() {
  return <section className="grid min-h-[520px] place-items-center rounded-lg border border-border bg-card text-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]"><div className="max-w-md px-6"><span className="mx-auto grid h-16 w-16 place-items-center rounded-xl bg-muted text-muted-foreground"><CheckCircle2 size={30} strokeWidth={1.7} /></span><h2 className="mt-6 text-[20px] font-semibold tracking-[-.01em]">Queue is clear</h2><p className="mt-3 text-[14px] leading-6 text-muted-foreground">Assistants are currently handling live conversations automatically. No manual human intervention is required at this moment.</p><div className="mt-7 flex flex-wrap justify-center gap-3"><button className="workspace-btn-primary px-4 py-2.5 text-sm" type="button">Refresh queue</button><Link to="/actions" className="workspace-btn-secondary px-4 py-2.5 text-sm">Routing rules</Link></div></div></section>;
}

function ReviewRows() {
  return <section className="mt-6 space-y-4"><h2 className="text-[20px] font-semibold tracking-[-.01em]">Recent transcripts for review</h2>{reviews.map((item) => <article className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)] lg:grid-cols-[minmax(0,1.5fr)_100px_124px_minmax(0,1.6fr)_auto] lg:items-center" key={item.id}><div className="flex items-center gap-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground"><MessageSquareText size={18} /></span><div><h3 className="text-[18px] font-semibold tracking-[-.01em]">{item.name}</h3><p className="mt-0.5 text-[14px] text-muted-foreground">Call ID: {item.id}</p></div></div><div><p className="font-mono text-[11px] uppercase tracking-[.05em] text-muted-foreground">Duration</p><p className="mt-1 font-mono text-[13px] text-foreground">{item.duration}</p></div><div><p className="font-mono text-[11px] uppercase tracking-[.05em] text-muted-foreground">Outcome</p><span className={`mt-1 inline-flex rounded-sm px-2 py-1 font-mono text-[11px] ${item.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{item.outcome}</span></div><div><p className="font-mono text-[11px] uppercase tracking-[.05em] text-muted-foreground">Issue detected</p><p className="mt-1 text-[14px] leading-5 text-foreground">{item.issue}</p></div><button type="button" className="workspace-btn-secondary px-3 py-2 text-sm">View transcript</button></article>)}</section>;
}

export default function OperationsPage() {
  const [params, setParams] = useSearchParams();
  const viewId = params.get("view") || "live";
  const active = useMemo(() => views.find((view) => view.id === viewId) || views[0], [viewId]);
  const isReview = active.id === "review";
  return <WorkspaceShell eyebrow="Real-time ops" title="Live Operations" contentClassName="pt-6" action={<Link to="/studio?create=1" className="workspace-btn-primary px-4 py-2.5 text-sm">Create new</Link>}>
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-0"><nav className="flex gap-7" aria-label="Live Operations views">{views.map((view) => <button key={view.id} type="button" onClick={() => setParams({ view: view.id })} className={`border-b-2 px-0 pb-3 text-[14px] transition ${active.id === view.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{view.label}</button>)}</nav><div className="mb-3 inline-flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2 font-mono text-[12px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[color:var(--wl-status-active)]" />0 live</span><span>·</span><span>0 handoffs</span><span>·</span><span className="text-foreground">System ready</span></div></div>
      {isReview ? <ReviewRows /> : <div className="mt-6 flex min-h-0 flex-1 flex-col"><section className="grid shrink-0 gap-4 md:grid-cols-2 xl:grid-cols-4"><Metric label="Active calls" value="0" live /><Metric label="Queued handoffs" value="0" /><Metric label="Avg handoff time" value="—" /><Metric label="System status" value="Optimal" live /></section><div className="mt-6 min-h-0 flex-1"><EmptyLive /></div></div>}
      {active.id === "handoffs" ? <aside className="mt-6 grid shrink-0 gap-4 border-t border-border pt-6 md:grid-cols-3">{[[Eye,"Watch","Monitor live conversations when you need context."],[Play,"Act","Guide the assistant or change an approved action."],[ShieldAlert,"Escalate","Take over or route a sensitive request to a person."]].map(([Icon,title,detail]) => { const I = Icon as typeof Eye; return <div className="rounded-lg border border-border bg-card p-5" key={String(title)}><I size={18} className="text-primary"/><h2 className="mt-4 text-[16px] font-semibold">{String(title)}</h2><p className="mt-2 text-[14px] leading-5 text-muted-foreground">{String(detail)}</p></div>; })}</aside> : null}
    </div>
  </WorkspaceShell>;
}
