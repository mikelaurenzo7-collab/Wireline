import { useEffect, useMemo, useState } from "react";
import { Check, CircleDot, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { authFetch, safeJson } from "../lib/api";
import { useAgents } from "../contexts/AgentsContext";
import { AGENT_TOOL_CATALOG, type AgentToolName } from "../lib/agent-capabilities";
import { WORKSPACE_INTEGRATION_CATALOG } from "../lib/workspace-integration-catalog";

type ConnectionStatus = Record<string, { connected?: boolean }>;
type Tool = (typeof AGENT_TOOL_CATALOG)[number];

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
  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-[0_1px_2px_rgba(26,60,52,0.05)]">
      <header className="flex items-center gap-3 border-b border-border pb-4">
        <span className="grid h-8 w-8 place-items-center rounded-sm bg-muted text-muted-foreground">
          <CircleDot size={16} />
        </span>
        <h3 className="font-display text-[20px] font-semibold tracking-[-.01em] text-primary">
          {title}
        </h3>
      </header>
      <div className="mt-5 space-y-2">
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
              className="wl-stitch-tool-row flex w-full items-start gap-3 rounded-md px-2 py-3 text-left disabled:opacity-50"
            >
              <span
                className={`wl-stitch-tool-check mt-0.5 ${active ? "text-primary-foreground" : ""}`}
              >
                {active ? <Check size={11} strokeWidth={3} /> : null}
              </span>
              <span>
                <strong className="block text-[15px] font-medium text-foreground">
                  {copy?.label || tool.label}
                </strong>
                <small className="mt-1 block text-[14px] leading-5 text-muted-foreground">
                  {copy?.description || tool.description}
                </small>
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
  const [busy, setBusy] = useState(false);
  const agentId = params.get("agent") || agents[0]?.id || "";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [status, agentResponse] = await Promise.all([
          authFetch("/api/oauth/crm/status"),
          agentId
            ? authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/messages`)
            : Promise.resolve(null),
        ]);
        const statusBody = await safeJson(status);
        if (!cancelled && status.ok && statusBody && typeof statusBody === "object")
          setConnections(statusBody as ConnectionStatus);
        if (agentResponse) {
          const agentBody = (await safeJson(agentResponse)) as {
            agent?: { enabledTools?: AgentToolName[] };
          } | null;
          if (!cancelled && agentResponse.ok)
            setEnabledTools(
              Array.isArray(agentBody?.agent?.enabledTools) ? agentBody.agent.enabledTools : [],
            );
        }
      } catch {
        // Connection availability should never block editing the assistant's setup.
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
      enabledTools.includes(tool)
        ? enabledTools.filter((item) => item !== tool)
        : [...enabledTools, tool],
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[24px] font-semibold tracking-[-.02em] text-primary">
            Ways your assistant can help
          </h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Choose only the things you would like this assistant to do.
          </p>
        </div>
        <select
          value={agentId}
          onChange={(event) => setParams({ agent: event.target.value })}
          className="h-10 max-w-[240px] rounded-md border border-border bg-card px-3 text-[14px]"
          aria-label="Choose assistant"
        >
          {agents.length ? (
            agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))
          ) : (
            <option value="">Choose assistant</option>
          )}
        </select>
      </div>

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,.75fr)] lg:gap-6">
        <section className="wl-scroll min-h-0 overflow-y-auto pr-0.5">
          <div className="space-y-5">
            {Object.entries(everydayGroups).map(([group, tools]) => (
              <ToolGroup
                key={group}
                title={GROUP_LABELS[group] || group}
                tools={tools}
                enabled={enabledTools}
                disabled={!agentId || busy}
                onToggle={toggle}
              />
            ))}
          </div>
          {Object.keys(businessGroups).length ? (
            <details className="mt-5 rounded-lg border border-border bg-card p-5">
              <summary className="cursor-pointer text-[15px] font-semibold text-foreground">
                Business tools
              </summary>
              <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
                Optional controls for sales, customer records, teams, and commerce.
              </p>
              <div className="mt-5 space-y-5">
                {Object.entries(businessGroups).map(([group, tools]) => (
                  <ToolGroup
                    key={group}
                    title={GROUP_LABELS[group] || group}
                    tools={tools}
                    enabled={enabledTools}
                    disabled={!agentId || busy}
                    onToggle={toggle}
                  />
                ))}
              </div>
            </details>
          ) : null}
          {busy ? (
            <p className="mt-4 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.05em] text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Saving your choices
            </p>
          ) : null}
        </section>

        <aside className="mt-6 min-h-0 lg:mt-0">
          <h2 className="font-display text-[24px] font-semibold tracking-[-.02em] text-primary">
            Connected apps
          </h2>
          <p className="mt-1 text-[14px] leading-5 text-muted-foreground">
            Connect the places that make your assistant more useful.
          </p>
          <div className="mt-5 space-y-3">
            {WORKSPACE_INTEGRATION_CATALOG.map((integration) => {
              const connected =
                integration.connection === "google"
                  ? connections.google?.connected
                  : integration.connection === "microsoft"
                    ? connections.microsoft?.connected
                    : false;
              const state = connected
                ? "Connected"
                : integration.connection === "workspace"
                  ? "Available"
                  : "Connect";
              return (
                <article
                  className="flex min-h-[78px] items-center justify-between gap-3 rounded-lg border border-border bg-card p-4 shadow-[0_1px_2px_rgba(26,60,52,0.05)]"
                  key={integration.id}
                >
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-semibold">{integration.label}</h3>
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-[.05em] text-muted-foreground">
                      {integration.detail}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[.05em] ${connected ? "bg-[color:var(--wl-accent-container)] text-[color:var(--wl-status-active)]" : "bg-muted text-muted-foreground"}`}
                  >
                    {state}
                  </span>
                </article>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
