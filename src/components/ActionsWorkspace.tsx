import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, CircleAlert, CircleDot, Loader2, Sparkles } from "lucide-react";
import { authFetch, safeJson } from "../lib/api";
import { useAgents } from "../contexts/AgentsContext";
import { AGENT_TOOL_CATALOG, type AgentToolName } from "../lib/agent-capabilities";
import { WORKSPACE_INTEGRATION_CATALOG } from "../lib/workspace-integration-catalog";

type ConnectionStatus = Record<string, { connected?: boolean }>;
type Tool = (typeof AGENT_TOOL_CATALOG)[number];
type SaveState = "idle" | "saving" | "saved" | "error";

const GROUP_LABELS: Record<string, string> = {
  core: "Everyday help",
  calendar: "Calendar",
  messaging: "Messages & phone",
  device: "Your device",
  crm: "Customer tools",
  team: "Team tools",
  meetings: "Meetings",
  ecommerce: "Store tools",
};

const BUSINESS_TOOL_NAMES = new Set<AgentToolName>([
  "search_leads",
  "update_lead_status",
  "log_payment_promise",
  "capture_customer_profile",
  "add_to_dnc",
  "crm_search_contacts",
  "crm_log_call",
  "crm_create_opportunity",
  "send_slack_notification",
  "list_x_ad_campaigns",
  "get_x_ad_campaign_stats",
  "send_contract",
  "enrich_lead",
  "shopify_lookup_order",
  "shopify_check_inventory",
  "shopify_lookup_customer",
  "shopify_start_return",
  "shopify_cancel_order",
  "shopify_update_address",
  "shopify_create_draft_order",
  "shopify_add_order_note",
  "shopify_apply_discount",
  "square_lookup_order",
  "square_lookup_customer",
  "square_check_inventory",
  "square_create_payment_link",
  "square_send_invoice",
  "log_to_excel",
  "log_to_google_sheets",
  "meta_submit_lead",
  "crm_create_contact",
  "crm_update_deal_stage",
]);

const CONSUMER_COPY: Partial<Record<AgentToolName, { label: string; description: string }>> = {
  escalate_to_human: {
    label: "Ask me first",
    description: "Brings anything sensitive, unclear, or high-stakes back to you.",
  },
  create_followup_task: {
    label: "Create a follow-up",
    description: "Saves a reminder for you when something needs your attention.",
  },
  send_email: {
    label: "Send an email",
    description: "Sends confirmations, summaries, and follow-ups you have approved.",
  },
  send_text_message: {
    label: "Send a text",
    description: "Sends a text update when messaging is appropriate.",
  },
  lookup_phone_number: {
    label: "Check a phone number",
    description: "Verifies a phone number before your assistant uses it.",
  },
};

function groupTools(tools: readonly Tool[]) {
  return tools.reduce<Record<string, Tool[]>>((all, tool) => {
    (all[tool.group] ||= []).push(tool);
    return all;
  }, {});
}

function ToolGroup({
  title,
  tools,
  enabled,
  disabled,
  onToggle,
}: {
  title: string;
  tools: Tool[];
  enabled: AgentToolName[];
  disabled: boolean;
  onToggle: (tool: AgentToolName) => void;
}) {
  const activeCount = tools.filter((tool) => enabled.includes(tool.name)).length;

  return (
    <section className="studio-card p-5">
      <header className="flex items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] bg-muted text-muted-foreground"><CircleDot size={16} /></span>
          <h3 className="wl-card-title text-base">{title}</h3>
        </div>
        <span className="wl-overline shrink-0 text-[10px]">{activeCount} on</span>
      </header>
      <div className="mt-4 space-y-1">
        {tools.map((tool) => {
          const active = enabled.includes(tool.name);
          const copy = CONSUMER_COPY[tool.name];
          return (
            <button
              key={tool.name}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onToggle(tool.name)}
              className="wl-stitch-tool-row flex w-full items-start gap-3 rounded-[var(--radius-md)] px-2 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className={`wl-stitch-tool-check mt-0.5 ${active ? "text-primary-foreground" : ""}`} aria-hidden>
                {active ? <Check size={11} strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0">
                <strong className="block text-[15px] font-medium text-foreground">{copy?.label || tool.label}</strong>
                <small className="mt-1 block text-[14px] leading-5 text-muted-foreground">{copy?.description || tool.description}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function ActionsWorkspace() {
  const { agents } = useAgents();
  const [params, setParams] = useSearchParams();
  const [connections, setConnections] = useState<ConnectionStatus>({});
  const [enabledTools, setEnabledTools] = useState<AgentToolName[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const agentId = params.get("agent") || agents[0]?.id || "";
  const selectedAgent = agents.find((agent) => agent.id === agentId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setNotice(null);
      try {
        const [status, agentResponse] = await Promise.all([
          authFetch("/api/oauth/crm/status"),
          agentId ? authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/messages`) : Promise.resolve(null),
        ]);
        const statusBody = await safeJson(status);
        if (!cancelled && status.ok && statusBody && typeof statusBody === "object") {
          setConnections(statusBody as ConnectionStatus);
        }
        if (agentResponse) {
          const agentBody = (await safeJson(agentResponse)) as { agent?: { enabledTools?: AgentToolName[] }; error?: string } | null;
          if (!cancelled && agentResponse.ok) {
            setEnabledTools(Array.isArray(agentBody?.agent?.enabledTools) ? agentBody.agent.enabledTools : []);
          } else if (!cancelled && !agentResponse.ok) {
            setNotice(agentBody?.error || "The assistant's action settings could not be loaded yet.");
          }
        }
      } catch {
        if (!cancelled && agentId) setNotice("The assistant's action settings could not be loaded yet.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const { everydayGroups, businessGroups } = useMemo(() => {
    const everyday = AGENT_TOOL_CATALOG.filter((tool) => !BUSINESS_TOOL_NAMES.has(tool.name));
    const business = AGENT_TOOL_CATALOG.filter((tool) => BUSINESS_TOOL_NAMES.has(tool.name));
    return { everydayGroups: groupTools(everyday), businessGroups: groupTools(business) };
  }, []);

  function chooseAgent(nextAgentId: string) {
    const next = new URLSearchParams(params);
    next.set("agent", nextAgentId);
    setParams(next);
  }

  async function persist(next: AgentToolName[]) {
    if (!agentId || saveState === "saving") return;
    const previous = enabledTools;
    setEnabledTools(next);
    setSaveState("saving");
    setNotice(null);
    try {
      const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wireline_export_version: 1, agent: { enabled_tools: next } }),
      });
      const body = (await safeJson(response)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Your changes could not be saved.");
      setSaveState("saved");
    } catch (cause) {
      setEnabledTools(previous);
      setSaveState("error");
      setNotice(cause instanceof Error ? cause.message : "Your changes could not be saved. Please try again.");
    }
  }

  const toggle = (tool: AgentToolName) =>
    void persist(enabledTools.includes(tool) ? enabledTools.filter((item) => item !== tool) : [...enabledTools, tool]);

  if (!agents.length) {
    return (
      <div className="grid h-full min-h-[520px] place-items-center py-8">
        <section className="studio-card w-full max-w-[560px] px-8 py-12 text-center sm:px-10">
          <span className="mx-auto grid size-16 place-items-center rounded-[var(--radius-xl)] bg-muted text-primary"><Sparkles size={29} /></span>
          <p className="studio-kicker mt-7">Action permissions</p>
          <h2 className="wl-section-title mt-2 text-[clamp(1.5rem,1.25rem+1vw,2rem)]">Create the assistant before you give it actions.</h2>
          <p className="mx-auto mt-3 max-w-md text-[16px] leading-6 text-muted-foreground">Start with one useful job. In Studio, you can decide what the assistant should know, which actions it can take, and where it must ask you first.</p>
          <Link to="/studio?create=1" className="studio-primary-button mt-7">Create an assistant</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5 flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="studio-kicker">Assistant permissions</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="wl-section-title">Choose how {selectedAgent?.name || "this assistant"} can help.</h2>
            {!loading ? <span className="wl-stitch-status-pill">{enabledTools.length} enabled</span> : null}
          </div>
          <p className="mt-2 max-w-2xl text-[14px] leading-6 text-muted-foreground">Turn on only the actions this assistant should take. You can change the scope whenever the role changes.</p>
        </div>
        <select value={agentId} onChange={(event) => chooseAgent(event.target.value)} className="wl-agent-select max-w-[240px]" aria-label="Choose assistant or agent">
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
      </div>

      {notice ? (
        <div className={`mb-5 flex items-start gap-3 rounded-[var(--radius-lg)] border px-4 py-3 text-sm ${saveState === "error" ? "border-destructive/25 bg-destructive/5 text-foreground" : "border-[color:color-mix(in_srgb,var(--wl-status-warning)_35%,var(--border))] bg-[color:color-mix(in_srgb,var(--wl-status-warning)_8%,var(--card))] text-foreground"}`} role={saveState === "error" ? "alert" : "status"}>
          <CircleAlert className={`mt-0.5 size-4 shrink-0 ${saveState === "error" ? "text-destructive" : "text-[var(--wl-status-warning)]"}`} />
          <p>{notice}</p>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,.75fr)] lg:gap-6">
        <section className="wl-scroll min-h-0 overflow-y-auto pr-0.5">
          <div className="space-y-5">
            {loading ? (
              Array.from({ length: 3 }, (_, index) => <div key={index} className="studio-card h-[176px] animate-pulse bg-muted/50" />)
            ) : (
              Object.entries(everydayGroups).map(([group, tools]) => <ToolGroup key={group} title={GROUP_LABELS[group] || group} tools={tools} enabled={enabledTools} disabled={saveState === "saving"} onToggle={toggle} />)
            )}
          </div>
          {Object.keys(businessGroups).length ? (
            <details className="studio-card mt-5 p-5">
              <summary className="cursor-pointer text-[15px] font-semibold text-foreground">Business tools</summary>
              <p className="mt-2 text-[13px] leading-5 text-muted-foreground">Optional controls for sales, customer records, teams, and commerce. Enable only what this assistant needs for its current role.</p>
              <div className="mt-5 space-y-5">
                {Object.entries(businessGroups).map(([group, tools]) => <ToolGroup key={group} title={GROUP_LABELS[group] || group} tools={tools} enabled={enabledTools} disabled={loading || saveState === "saving"} onToggle={toggle} />)}
              </div>
            </details>
          ) : null}
          <p className="mt-4 inline-flex min-h-5 items-center gap-2 wl-overline" role="status" aria-live="polite">
            {saveState === "saving" ? <><Loader2 size={14} className="animate-spin" /> Saving changes</> : saveState === "saved" ? <><Check size={14} className="text-primary" /> Changes saved</> : ""}
          </p>
        </section>

        <aside className="mt-6 min-h-0 lg:mt-0">
          <p className="studio-kicker">Connected apps</p>
          <h2 className="wl-section-title mt-2">Add context when it helps.</h2>
          <p className="mt-2 text-[14px] leading-6 text-muted-foreground">Connect only the accounts and tools that make this assistant more useful. A connection is not permission by itself.</p>
          <div className="mt-5 space-y-3">
            {WORKSPACE_INTEGRATION_CATALOG.map((integration) => {
              const connected = integration.connection === "google" ? connections.google?.connected : integration.connection === "microsoft" ? connections.microsoft?.connected : false;
              const state = connected ? "Connected" : integration.connection === "workspace" ? "Available" : "Connect";
              return (
                <article className="studio-card flex min-h-[82px] items-center justify-between gap-3 p-4" key={integration.id}>
                  <div className="min-w-0">
                    <h3 className="wl-card-title">{integration.label}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{integration.detail}</p>
                  </div>
                  <span className={connected ? "wl-stitch-status-pill" : "inline-flex shrink-0 rounded-full border border-border bg-muted px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[.06em] text-muted-foreground"}>{state}</span>
                </article>
              );
            })}
          </div>
          <Link to="/connections" className="studio-secondary-button mt-4 w-full text-sm">Manage connections</Link>
        </aside>
      </div>
    </div>
  );
}
