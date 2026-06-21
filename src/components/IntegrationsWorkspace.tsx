import { useEffect, useMemo, useState } from "react";
import { Check, CircleDot, Loader2, Sparkles } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { authFetch, safeJson } from "../lib/api";
import { useAgents } from "../contexts/AgentsContext";
import { AGENT_TOOL_CATALOG, type AgentToolName } from "../lib/agent-capabilities";
import { CASEY_SALES_AGENT_TOOLS, WORKSPACE_INTEGRATION_CATALOG } from "../lib/workspace-integration-catalog";

type ConnectionStatus = Record<string, { connected?: boolean }>;
type View = "actions" | "connections";

export default function IntegrationsWorkspace() {
  const { agents } = useAgents();
  const [params, setParams] = useSearchParams();
  const [connections, setConnections] = useState<ConnectionStatus>({});
  const [enabledTools, setEnabledTools] = useState<AgentToolName[]>([]);
  const [view, setView] = useState<View>("actions");
  const [busy, setBusy] = useState(false);
  const agentId = params.get("agent") || agents[0]?.id || "";
  const active = agents.find((agent) => agent.id === agentId);

  useEffect(() => {
    let canceled = false;
    async function load() {
      try {
        const status = await authFetch("/api/oauth/crm/status");
        const result = await safeJson(status);
        if (!canceled && status.ok && result && typeof result === "object") {
          setConnections(result as ConnectionStatus);
        }
        if (!agentId) return;
        const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/messages`);
        const body = (await safeJson(response)) as { agent?: { enabledTools?: AgentToolName[] } } | null;
        if (!canceled && response.ok) {
          setEnabledTools(Array.isArray(body?.agent?.enabledTools) ? body.agent.enabledTools : []);
        }
      } catch {
        /* Connection availability never blocks permission editing. */
      }
    }
    void load();
    return () => {
      canceled = true;
    };
  }, [agentId]);

  const groups = useMemo(
    () =>
      AGENT_TOOL_CATALOG.reduce<Record<string, (typeof AGENT_TOOL_CATALOG)[number][]>>((all, tool) => {
        (all[tool.group] ||= []).push(tool);
        return all;
      }, {}),
    [],
  );

  async function persist(next: AgentToolName[]) {
    if (!agentId || busy) return;
    const previous = enabledTools;
    setEnabledTools(next);
    setBusy(true);
    try {
      const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wireline_export_version: 1, agent: { enabled_tools: next } }),
      });
      if (!response.ok) setEnabledTools(previous);
    } catch {
      setEnabledTools(previous);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (tool: AgentToolName) =>
    void persist(
      enabledTools.includes(tool) ? enabledTools.filter((item) => item !== tool) : [...enabledTools, tool],
    );

  const salesPreset = () => void persist([...new Set([...enabledTools, ...CASEY_SALES_AGENT_TOOLS])]);

  const actionPanel = (
    <section className="wl-stitch-card flex min-h-0 flex-col overflow-hidden">
      <header className="wl-stitch-knowledge-panel__header">
        <div>
          <h2 className="text-base font-semibold tracking-[-.025em]">
            {active ? `${active.name} · ${enabledTools.length} actions` : "Select an assistant"}
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            Grant actions, not blanket access. Each toggle persists to this assistant only.
          </p>
        </div>
        <button
          type="button"
          disabled={!agentId || busy}
          onClick={salesPreset}
          className="workspace-btn-secondary shrink-0 px-3 py-1.5 text-xs disabled:opacity-40"
        >
          <Sparkles size={14} />
          Sales setup
        </button>
      </header>
      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-0">
          {Object.entries(groups).map(([group, tools]) => (
            <section key={group} className="border-t border-border py-4 first:border-t-0 first:pt-0">
              <p className="wl-stitch-label mb-3">{group}</p>
              <div className="flex flex-col gap-3">
                {tools.map((tool) => {
                  const activeTool = enabledTools.includes(tool.name);
                  return (
                    <button
                      type="button"
                      disabled={!agentId || busy}
                      key={tool.name}
                      aria-pressed={activeTool}
                      onClick={() => toggle(tool.name)}
                      className="wl-stitch-tool-row flex w-full items-start gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="wl-stitch-tool-check mt-0.5">
                        {activeTool ? <Check size={10} strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0">
                        <strong className="block text-sm font-medium">{tool.label}</strong>
                        <small className="mt-0.5 block text-[12px] leading-4 text-muted-foreground">
                          {tool.description}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
      {busy ? (
        <p className="inline-flex shrink-0 items-center gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground">
          <Loader2 className="animate-spin" size={14} />
          Saving scoped permissions…
        </p>
      ) : null}
    </section>
  );

  const connectionPanel = (
    <section className="flex min-h-0 flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold tracking-[-.025em]">Workspace connections</h2>
        <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
          Connect once. Scope per assistant. Connections never grant permission by themselves.
        </p>
      </div>
      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-3 sm:grid-cols-2">
          {WORKSPACE_INTEGRATION_CATALOG.map((integration) => {
            const connected =
              integration.connection === "google"
                ? connections.google?.connected
                : integration.connection === "microsoft"
                  ? connections.microsoft?.connected
                  : false;
            const label =
              connected ? "Connected" : integration.connection === "workspace" ? "Available" : "Connect";
            return (
              <article key={integration.id} className="wl-stitch-connection-card">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="wl-stitch-label">{integration.family}</p>
                    <h3 className="mt-1 truncate text-sm font-semibold tracking-[-.02em]">
                      {integration.label}
                    </h3>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                      connected
                        ? "border border-[var(--wl-status-active)]/20 bg-[color-mix(in_srgb,var(--wl-status-active)_10%,transparent)] text-[var(--wl-status-active)]"
                        : "border border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {label}
                  </span>
                </div>
                <p className="mt-3 text-[11px] leading-4 text-muted-foreground">{integration.detail}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div>
          <p className="wl-stitch-eyebrow">Permissions</p>
          <h2 className="wl-stitch-headline mt-1">Actions</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted-foreground">
            Workspace systems provide context. Assistant permissions determine what happens on a
            call.
          </p>
        </div>
        <select
          value={agentId}
          onChange={(event) => setParams({ agent: event.target.value })}
          className="wl-agent-select ml-auto rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="">Choose an assistant</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      <div className="wl-segmented grid shrink-0 grid-cols-2 lg:hidden">
        {(["actions", "connections"] as View[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-selected={view === item}
            className={view === item ? "is-active capitalize" : "capitalize"}
            onClick={() => setView(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)] lg:gap-4">
        <div className={`${view === "actions" ? "min-h-0" : "hidden"} lg:block`}>{actionPanel}</div>
        <div className={`${view === "connections" ? "min-h-0" : "hidden"} lg:block`}>
          {connectionPanel}
        </div>
      </div>

      <p className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
        <CircleDot size={13} className="shrink-0" />
        Connections live at the workspace layer; actions remain assistant-scoped.
      </p>
    </div>
  );
}
