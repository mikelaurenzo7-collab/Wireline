import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ChevronRight, Loader2, Sparkles, WandSparkles, Workflow } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import { authFetch, safeJson } from "../lib/api";
import { useAgents } from "../contexts/AgentsContext";
import { AGENT_TOOL_CATALOG, type AgentToolName } from "../lib/agent-capabilities";
import { CASEY_SALES_AGENT_TOOLS, WORKSPACE_INTEGRATION_CATALOG } from "../lib/workspace-integration-catalog";

type ConnectionStatus = Record<string, { connected?: boolean }>;

export default function IntegrationsPage() {
  const { agents } = useAgents();
  const [params, setParams] = useSearchParams();
  const [connections, setConnections] = useState<ConnectionStatus>({});
  const [enabledTools, setEnabledTools] = useState<AgentToolName[]>([]);
  const [busy, setBusy] = useState(false);
  const agentId = params.get("agent") || agents[0]?.id || "";
  const active = agents.find((agent) => agent.id === agentId);

  useEffect(() => {
    let canceled = false;
    async function load() {
      try {
        const status = await authFetch("/api/oauth/crm/status");
        const statusBody = await safeJson(status);
        if (!canceled && status.ok && statusBody && typeof statusBody === "object") setConnections(statusBody as ConnectionStatus);
        if (!agentId) return;
        const workspace = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/messages`);
        const workspaceBody = await safeJson(workspace) as { agent?: { enabledTools?: AgentToolName[] } } | null;
        if (!canceled && workspace.ok) setEnabledTools(Array.isArray(workspaceBody?.agent?.enabledTools) ? workspaceBody.agent.enabledTools : []);
      } catch { /* Optional connection status should never block workspace setup. */ }
    }
    void load();
    return () => { canceled = true; };
  }, [agentId]);

  async function persist(next: AgentToolName[]) {
    if (!agentId || busy) return;
    const previous = enabledTools;
    setEnabledTools(next); setBusy(true);
    try {
      const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/import`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wireline_export_version: 1, agent: { enabled_tools: next } }),
      });
      if (!response.ok) setEnabledTools(previous);
    } catch { setEnabledTools(previous); } finally { setBusy(false); }
  }

  function toggle(tool: AgentToolName) { void persist(enabledTools.includes(tool) ? enabledTools.filter((item) => item !== tool) : [...enabledTools, tool]); }
  function applyCaseyPreset() { void persist([...new Set([...enabledTools, ...CASEY_SALES_AGENT_TOOLS])]); }
  const groups = useMemo(() => AGENT_TOOL_CATALOG.filter((tool) => CASEY_SALES_AGENT_TOOLS.includes(tool.name as typeof CASEY_SALES_AGENT_TOOLS[number]) || ["calendar", "crm", "team", "meetings"].includes(tool.group)).reduce<Record<string, typeof AGENT_TOOL_CATALOG[number][]>>((all, tool) => { (all[tool.group] ||= []).push(tool); return all; }, {}), []);

  return <WorkspaceShell eyebrow="Build" title="Integrations" action={<Link to={agentId ? `/studio?agent=${encodeURIComponent(agentId)}` : "/studio"} className="inline-flex items-center gap-2 rounded-xl bg-[#1d1d1f] px-4 py-2.5 text-sm font-semibold text-white"><WandSparkles size={15} />Open Studio</Link>}>
    <section className="flex flex-col gap-4 py-6 lg:flex-row lg:items-center lg:justify-between"><p className="max-w-2xl text-sm leading-6 text-[#606067]">Connect systems once, then grant each agent only the actions needed for its role. Connections are workspace-level; permissions are agent-level.</p><select value={agentId} onChange={(event) => setParams({ agent: event.target.value })} className="rounded-xl border border-black/[.12] bg-white px-3 py-2 text-sm font-medium"><option value="">Choose an agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></section>
    <section className="rounded-2xl border border-black/[.08] bg-white p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#77777f]">Agent permissions</p><h2 className="mt-1 text-lg font-semibold tracking-[-.025em]">{active ? `${active.name} can act with intention` : "Select an agent to grant tools"}</h2><p className="mt-1 text-sm text-[#64646b]">{enabledTools.length} action{enabledTools.length === 1 ? "" : "s"} currently granted.</p></div><button disabled={!agentId || busy} onClick={applyCaseyPreset} className="inline-flex items-center justify-center gap-2 rounded-xl border border-black/[.12] px-3 py-2.5 text-sm font-semibold disabled:opacity-40"><Sparkles size={15} />Apply Casey’s sales preset</button></div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">{Object.entries(groups).map(([group, tools]) => <div key={group} className="rounded-xl border border-black/[.08] bg-[#fafaf8] p-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.12em] text-[#797980]">{group}</p>{tools.map((tool) => { const selected = enabledTools.includes(tool.name); return <button disabled={!agentId || busy} key={tool.name} onClick={() => toggle(tool.name)} className={`mb-1 flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "bg-white shadow-sm" : "hover:bg-white/70"}`}><span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${selected ? "border-[#1d1d1f] bg-[#1d1d1f] text-white" : "border-black/[.18] bg-transparent text-transparent"}`}><Check size={11} strokeWidth={3} /></span><span><strong className="block text-xs font-semibold">{tool.label}</strong><small className="mt-0.5 block text-[11px] leading-4 text-[#696970]">{tool.description}</small></span></button>; })}</div>)}</div>
      {busy && <p className="mt-4 inline-flex items-center gap-2 text-xs text-[#6a6a71]"><Loader2 className="animate-spin" size={14} />Saving scoped permissions…</p>}
    </section>
    <section className="mt-6"><div className="mb-3 flex items-center gap-2"><Workflow size={16} /><h2 className="font-semibold tracking-[-.02em]">Workspace connections</h2></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{WORKSPACE_INTEGRATION_CATALOG.map((integration) => { const connected = integration.connection === "google" ? connections.google?.connected : integration.connection === "microsoft" ? connections.microsoft?.connected : false; const reviewHref = integration.connection === "google" || integration.connection === "microsoft" ? `/studio?agent=${encodeURIComponent(agentId)}` : undefined; return <article key={integration.id} className="rounded-2xl border border-black/[.08] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#7a7a81]">{integration.family}</p><h3 className="mt-1 font-semibold tracking-[-.02em]">{integration.label}</h3></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${connected ? "bg-emerald-50 text-emerald-800" : "bg-[#f0f0ee] text-[#626269]"}`}>{connected ? "Connected" : integration.connection === "workspace" ? "Workspace setup" : "Available"}</span></div><p className="mt-3 text-xs leading-5 text-[#65656c]">{integration.detail}</p><div className="mt-4 flex flex-wrap gap-1.5">{integration.capabilities.map((capability) => <span key={capability} className="rounded-md border border-black/[.08] bg-[#fafaf8] px-2 py-1 text-[10px] font-medium text-[#65656c]">{capability}</span>)}</div>{reviewHref ? <Link to={reviewHref} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold">Review connection <ChevronRight size={13} /></Link> : <p className="mt-4 text-[11px] leading-4 text-[#77777f]">Enable the tenant connection before granting related actions.</p>}</article>; })}</div></section>
  </WorkspaceShell>;
}
