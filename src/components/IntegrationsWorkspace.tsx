import { useEffect, useMemo, useState } from "react";
import { Check, CircleDot, Loader2, Sparkles } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { authFetch, safeJson } from "../lib/api";
import { useAgents } from "../contexts/AgentsContext";
import { AGENT_TOOL_CATALOG, type AgentToolName } from "../lib/agent-capabilities";
import { CASEY_SALES_AGENT_TOOLS, WORKSPACE_INTEGRATION_CATALOG } from "../lib/workspace-integration-catalog";

type ConnectionStatus = Record<string, { connected?: boolean }>;

function ToolGroup({ title, tools, enabled, disabled, onToggle }: { title: string; tools: (typeof AGENT_TOOL_CATALOG)[number][]; enabled: AgentToolName[]; disabled: boolean; onToggle: (tool: AgentToolName) => void }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
      <header className="flex items-center gap-3 border-b border-border pb-4"><span className="grid h-8 w-8 place-items-center rounded-sm bg-muted text-muted-foreground"><CircleDot size={16} /></span><h3 className="text-[20px] font-semibold tracking-[-.01em]">{title}</h3></header>
      <div className="mt-5 space-y-5">{tools.map((tool) => {
        const active = enabled.includes(tool.name);
        return <button key={tool.name} type="button" aria-pressed={active} disabled={disabled} onClick={() => onToggle(tool.name)} className="flex w-full items-start gap-3 text-left disabled:opacity-50">
          <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center border ${active ? "border-primary bg-primary text-primary-foreground" : "border-[color:var(--wl-outline)] bg-card"}`}>{active ? <Check size={11} strokeWidth={3} /> : null}</span>
          <span><strong className="block text-[15px] font-medium text-foreground">{tool.label}</strong><small className="mt-1 block text-[14px] leading-5 text-muted-foreground">{tool.description}</small></span>
        </button>;
      })}</div>
    </section>
  );
}

export default function IntegrationsWorkspace() {
  const { agents } = useAgents();
  const [params, setParams] = useSearchParams();
  const [connections, setConnections] = useState<ConnectionStatus>({});
  const [enabledTools, setEnabledTools] = useState<AgentToolName[]>([]);
  const [busy, setBusy] = useState(false);
  const agentId = params.get("agent") || agents[0]?.id || "";
  const active = agents.find((agent) => agent.id === agentId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [status, agentResponse] = await Promise.all([
          authFetch("/api/oauth/crm/status"),
          agentId ? authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/messages`) : Promise.resolve(null),
        ]);
        const statusBody = await safeJson(status);
        if (!cancelled && status.ok && statusBody && typeof statusBody === "object") setConnections(statusBody as ConnectionStatus);
        if (agentResponse) {
          const agentBody = await safeJson(agentResponse) as { agent?: { enabledTools?: AgentToolName[] } } | null;
          if (!cancelled && agentResponse.ok) setEnabledTools(Array.isArray(agentBody?.agent?.enabledTools) ? agentBody.agent.enabledTools : []);
        }
      } catch { /* availability never blocks editing */ }
    }
    void load();
    return () => { cancelled = true; };
  }, [agentId]);

  const groups = useMemo(() => AGENT_TOOL_CATALOG.reduce<Record<string, (typeof AGENT_TOOL_CATALOG)[number][]>>((all, tool) => { (all[tool.group] ||= []).push(tool); return all; }, {}), []);

  async function persist(next: AgentToolName[]) {
    if (!agentId || busy) return;
    const previous = enabledTools;
    setEnabledTools(next);
    setBusy(true);
    try {
      const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wireline_export_version: 1, agent: { enabled_tools: next } }) });
      if (!response.ok) setEnabledTools(previous);
    } catch { setEnabledTools(previous); } finally { setBusy(false); }
  }

  const toggle = (tool: AgentToolName) => void persist(enabledTools.includes(tool) ? enabledTools.filter((item) => item !== tool) : [...enabledTools, tool]);
  const applySalesPreset = () => void persist([...new Set([...enabledTools, ...CASEY_SALES_AGENT_TOOLS])]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-6 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-[20px] font-semibold tracking-[-.01em] text-foreground">Agent capabilities</h2><p className="mt-1 text-[14px] text-muted-foreground">Choose the approved actions this assistant may perform.</p></div>
        <div className="flex items-center gap-3"><select value={agentId} onChange={(event) => setParams({ agent: event.target.value })} className="h-10 max-w-[220px] rounded-sm border border-border bg-card px-3 text-[14px]">{agents.length ? agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>) : <option value="">Choose assistant</option>}</select><button type="button" disabled={!agentId || busy} onClick={applySalesPreset} className="workspace-btn-secondary px-3 py-2.5 text-[12px] disabled:opacity-40"><Sparkles size={14} />Sales setup preset</button></div>
      </div>

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,.75fr)] lg:gap-6">
        <section className="wl-scroll min-h-0 overflow-y-auto pr-0.5"><div className="space-y-6">{Object.entries(groups).map(([group, tools]) => <ToolGroup key={group} title={group} tools={tools} enabled={enabledTools} disabled={!agentId || busy} onToggle={toggle} />)}</div>{busy ? <p className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.05em] text-muted-foreground"><Loader2 size={14} className="animate-spin" />Saving permissions</p> : null}</section>
        <aside className="mt-6 min-h-0 lg:mt-0"><h2 className="text-[20px] font-semibold tracking-[-.01em]">Workspace connections</h2><p className="mt-1 text-[14px] leading-5 text-muted-foreground">Connect once; permissions stay scoped to each assistant.</p><div className="mt-5 space-y-3">{WORKSPACE_INTEGRATION_CATALOG.map((integration) => {
          const connected = integration.connection === "google" ? connections.google?.connected : integration.connection === "microsoft" ? connections.microsoft?.connected : false;
          const state = connected ? "Connected" : integration.connection === "workspace" ? "Available" : "Connect";
          return <article className="flex min-h-[78px] items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.05)]" key={integration.id}><div className="min-w-0"><h3 className="text-[15px] font-semibold">{integration.label}</h3><p className="mt-1 font-mono text-[11px] uppercase tracking-[.05em] text-muted-foreground">{integration.detail}</p></div><span className={`shrink-0 rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[.05em] ${connected ? "bg-[color:var(--wl-accent-container)] text-[color:var(--wl-status-active)]" : "bg-muted text-muted-foreground"}`}>{state}</span></article>;
        })}</div></aside>
      </div>
    </div>
  );
}
