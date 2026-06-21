import { Link } from "react-router-dom";
import { ArrowUpRight, Bot, CircleAlert, Plus, Radio, ShieldCheck } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";

function roleLabel(role?: string | null) { return role?.replace(/_/g, " ") || "Assistant"; }

function EmptyAgents() {
  return <div className="grid h-full min-h-0 place-items-center rounded-3xl border border-dashed border-black/[.15] bg-white px-6 text-center"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f0f0ee]"><Bot size={20} /></span><h2 className="mt-4 text-lg font-semibold tracking-[-.025em]">Create the first assistant</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#606067]">Start with a role and one clear brief. Studio converts it into operating rules, business knowledge, and a deliberate handoff plan.</p><Link to="/studio" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#1d1d1f] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} />New agent</Link></div></div>;
}

function AgentCard({ agent }: { agent: WorkspaceAgentSummary }) {
  return <article className="group flex min-h-[174px] flex-col rounded-2xl border border-black/[.08] bg-white p-4 transition hover:-translate-y-0.5 hover:border-black/[.18] hover:shadow-[0_14px_34px_rgba(0,0,0,.05)]">
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#efefed] text-sm font-semibold">{agent.name.slice(0, 1).toUpperCase()}</span><div className="min-w-0"><h2 className="truncate text-[15px] font-semibold tracking-[-.025em]">{agent.name}</h2><p className="mt-0.5 truncate text-xs capitalize text-[#6d6d74]">{roleLabel(agent.role)} · {agent.channel || "voice"}</p></div></div><span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-black/[.08] bg-[#fafaf9] px-2 py-1 text-[9px] font-semibold uppercase tracking-[.11em] text-[#64646b]"><Radio size={10} />Build</span></div>
    <p className="mt-4 text-[13px] leading-5 text-[#65656c]">Train the job, scope access, and make the human handoff obvious before this agent takes a live conversation.</p>
    <div className="mt-auto flex items-center justify-between gap-2 pt-4"><Link to={`/studio?agent=${encodeURIComponent(agent.id)}`} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1d1d1f] px-3 py-2 text-xs font-semibold text-white">Open Studio <ArrowUpRight size={13} /></Link><Link to={`/integrations?agent=${encodeURIComponent(agent.id)}`} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-[#5f5f66] hover:bg-[#f2f2f0]"><ShieldCheck size={14} />Access</Link></div>
  </article>;
}

export default function AgentsPage() {
  const { agents, loading, degraded } = useAgents();
  return <WorkspaceShell eyebrow="Build" title="Agents" contentClassName="pt-4" action={<Link to="/studio" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1d1d1f] px-3.5 py-2.5 text-sm font-semibold text-white"><Plus size={16} />New <span className="hidden sm:inline">agent</span></Link>}>
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className="grid shrink-0 grid-cols-3 gap-2.5 sm:gap-3">
        {[["Fleet", loading ? "—" : String(agents.length), "Agents in this workspace"], ["Mode", "Scoped", "Every action is permissioned"], ["Launch", "Review", "Train before live calls"]].map(([label, value, detail]) => <article key={label} className="rounded-2xl border border-black/[.08] bg-white px-3 py-3.5 sm:px-4"><p className="text-[9px] font-semibold uppercase tracking-[.13em] text-[#77777f]">{label}</p><p className="mt-2 text-lg font-semibold tracking-[-.04em] sm:text-xl">{value}</p><p className="mt-1 hidden text-[11px] leading-4 text-[#727279] sm:block">{detail}</p></article>)}
      </section>
      {degraded ? <div className="flex shrink-0 items-start gap-2 rounded-xl border border-amber-700/15 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"><CircleAlert size={15} className="mt-0.5 shrink-0" />Agent data is temporarily unavailable. Existing configuration is unchanged.</div> : null}
      {!loading && !agents.length ? <EmptyAgents /> : <section className="min-h-0 flex-1 overflow-y-auto pr-1"><div className="grid gap-3 pb-1 sm:grid-cols-2 2xl:grid-cols-3">{loading ? Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[174px] animate-pulse rounded-2xl bg-white" />) : agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}</div></section>}
    </div>
  </WorkspaceShell>;
}
