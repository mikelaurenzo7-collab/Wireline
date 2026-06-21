import { Link } from "react-router-dom";
import { ArrowUpRight, Bot, CircleAlert, Plus, ShieldCheck } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents, type WorkspaceAgentSummary } from "../contexts/AgentsContext";

function roleLabel(role?: string | null) { return role?.replace(/_/g, " ") || "Assistant"; }

const ROLE_HINT: Record<string, string> = {
  sales: "Qualify leads, book meetings, and follow up without overpromising.",
  scheduler: "Handle scheduling, reminders, and calendar coordination.",
  customer_service: "Answer policy questions and escalate edge cases cleanly.",
  receptionist: "Route calls, capture intake, and set expectations.",
  custom: "Train the job, scope access, and define handoff rules.",
};

function agentHint(agent: WorkspaceAgentSummary) {
  return ROLE_HINT[agent.role || "custom"] || ROLE_HINT.custom;
}

function EmptyAgents() {
  return (
    <div className="grid h-full min-h-0 place-items-center rounded-2xl border border-dashed border-black/[.12] bg-white/70 px-6 text-center">
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f0f0ee]"><Bot size={20} /></span>
        <h2 className="mt-4 text-lg font-semibold tracking-[-.025em]">Create the first assistant</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#606067]">Start with a role and one clear brief. Studio converts it into operating rules, business knowledge, and a deliberate handoff plan.</p>
        <Link to="/studio" className="workspace-btn-primary mt-5 px-4 py-2.5"><Plus size={16} />New agent</Link>
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: WorkspaceAgentSummary }) {
  return (
    <article className="group flex min-h-[148px] flex-col rounded-xl border border-black/[.07] bg-white/90 p-3.5 transition hover:border-black/[.14] hover:bg-white sm:p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#efefed] text-sm font-semibold">{agent.name.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold tracking-[-.025em]">{agent.name}</h2>
          <p className="mt-0.5 truncate text-xs capitalize text-[#6d6d74]">{roleLabel(agent.role)} · {agent.channel || "voice"}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-[12px] leading-5 text-[#65656c]">{agentHint(agent)}</p>
      <div className="mt-auto flex items-center gap-2 pt-3">
        <Link to={`/studio?agent=${encodeURIComponent(agent.id)}`} className="workspace-btn-primary px-3 py-1.5 text-xs">Open Studio <ArrowUpRight size={13} /></Link>
        <Link to={`/integrations?agent=${encodeURIComponent(agent.id)}`} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-[#5f5f66] hover:bg-[#f2f2f0]"><ShieldCheck size={14} />Access</Link>
      </div>
    </article>
  );
}

export default function AgentsPage() {
  const { agents, loading, degraded } = useAgents();
  return (
    <WorkspaceShell eyebrow="Build" title="Agents" contentClassName="pt-2" action={<Link to="/studio" className="workspace-btn-primary px-3.5 py-2.5"><Plus size={16} />New <span className="hidden sm:inline">agent</span></Link>}>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="wl-stat-strip shrink-0">
          <span><strong>{loading ? "—" : agents.length}</strong> agents</span>
          <span className="wl-dot" aria-hidden />
          <span>Scoped permissions</span>
          <span className="wl-dot" aria-hidden />
          <span>Train before live calls</span>
        </div>
        {degraded ? <div className="flex shrink-0 items-start gap-2 rounded-xl border border-amber-700/15 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"><CircleAlert size={15} className="mt-0.5 shrink-0" />Agent data is temporarily unavailable. Existing configuration is unchanged.</div> : null}
        {!loading && !agents.length ? <EmptyAgents /> : (
          <section className="wl-scroll min-h-0 flex-1 overflow-y-auto pr-0.5">
            <div className="grid gap-2.5 pb-1 sm:grid-cols-2 2xl:grid-cols-3">
              {loading ? Array.from({ length: 6 }, (_, index) => <div key={index} className="h-[148px] animate-pulse rounded-xl bg-white/80" />) : agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
            </div>
          </section>
        )}
      </div>
    </WorkspaceShell>
  );
}
