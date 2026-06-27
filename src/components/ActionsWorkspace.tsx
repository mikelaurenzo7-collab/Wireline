import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Loader2, Sparkles } from "lucide-react";
import { authFetch, safeJson } from "../lib/api";
import { useAgents } from "../contexts/AgentsContext";
import { AGENT_TOOL_CATALOG, type AgentToolName } from "../lib/agent-capabilities";
import { WORKSPACE_INTEGRATION_CATALOG } from "../lib/workspace-integration-catalog";
import { Badge, Button, EmptyState, NativeSelect, Skeleton } from "./atoms";
import { StatusNotice } from "./molecules";

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
    description: "Escalate the edge cases.",
  },
  create_followup_task: {
    label: "Create a follow-up",
    description: "Queue what matters.",
  },
  send_email: {
    label: "Send an email",
    description: "Approved follow-ups.",
  },
  send_text_message: {
    label: "Send a text",
    description: "Text when right.",
  },
  lookup_phone_number: {
    label: "Check a phone number",
    description: "Verify before call.",
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
      <header className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="flex min-w-0 items-center gap-3 w-full justify-center">
          <h3 className="font-semibold tracking-[-0.01em] text-foreground text-center">
            {title}
          </h3>
        </div>
        <Badge variant="info" className="shrink-0 text-[10px] font-mono uppercase tracking-[0.06em]">
          {activeCount} on
        </Badge>
      </header>
      <div className="mt-3 space-y-px">
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
              className="flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                className={`mt-1 grid h-[15px] w-[15px] shrink-0 place-items-center rounded border text-[10px] ${active ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent"}`}
                aria-hidden="true"
              >
                {active ? <Check size={10} strokeWidth={3.5} /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold tracking-[-0.005em] text-foreground">
                  {copy?.label || tool.label}
                </span>
                <span className="mt-px block text-[12.5px] leading-snug text-muted-foreground">
                  {copy?.description || tool.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LoadingPermissions() {
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      aria-busy="true"
      aria-label="Loading agent permissions"
    >
      <div className="mb-5 flex items-end justify-between gap-3">
        <div className="space-y-3">
          <Skeleton shape="text" className="h-3 w-28" />
          <Skeleton shape="text" className="h-7 w-72 max-w-[65vw]" />
        </div>
        <Skeleton shape="control" className="h-10 w-44" />
      </div>
      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,.75fr)] lg:gap-6">
        <div className="space-y-5">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} shape="surface" className="h-[176px] w-full" />
          ))}
        </div>
        <Skeleton shape="surface" className="h-[320px] w-full" />
      </div>
    </div>
  );
}

export default function ActionsWorkspace() {
  const { agents, loading: agentsLoading } = useAgents();
  const [params, setParams] = useSearchParams();
  const [connections, setConnections] = useState<ConnectionStatus>({});
  const [enabledTools, setEnabledTools] = useState<AgentToolName[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const requestedAgentId = params.get("agent") || "";
  const agentId = agents.some((agent) => agent.id === requestedAgentId)
    ? requestedAgentId
    : agents[0]?.id || "";
  const selectedAgent = agents.find((agent) => agent.id === agentId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setSaveState("idle");
      setNotice(null);
      try {
        const [status, agentResponse] = await Promise.all([
          authFetch("/api/oauth/crm/status"),
          agentId
            ? authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/messages`)
            : Promise.resolve(null),
        ]);
        const statusBody = await safeJson(status);
        if (!cancelled && status.ok && statusBody && typeof statusBody === "object") {
          setConnections(statusBody as ConnectionStatus);
        }
        if (agentResponse) {
          const agentBody = (await safeJson(agentResponse)) as {
            agent?: { enabledTools?: AgentToolName[] };
            error?: string;
          } | null;
          if (!cancelled && agentResponse.ok) {
            setEnabledTools(
              Array.isArray(agentBody?.agent?.enabledTools) ? agentBody.agent.enabledTools : [],
            );
          } else if (!cancelled && !agentResponse.ok) {
            setNotice(agentBody?.error || "This agent's Wire settings could not be loaded yet.");
          }
        }
      } catch {
        if (!cancelled && agentId) setNotice("This agent's Wire settings could not be loaded yet.");
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
      setNotice(
        cause instanceof Error
          ? cause.message
          : "Your changes could not be saved. Please try again.",
      );
    }
  }

  const toggle = (tool: AgentToolName) =>
    void persist(
      enabledTools.includes(tool)
        ? enabledTools.filter((item) => item !== tool)
        : [...enabledTools, tool],
    );

  if (agentsLoading) return <LoadingPermissions />;

  if (!agents.length) {
    return (
      <div className="grid h-full min-h-[520px] place-items-center py-8">
        <EmptyState
          density="default"
          className="studio-card w-full max-w-[560px] px-8 py-12 sm:px-10 text-center"
          icon={<Sparkles size={29} />}
          title="Agent first."
          description="Create. Then wire."
          action={
            <Button asChild>
              <Link to="/studio?create=1">Create an agent</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const noticeTone = saveState === "error" ? "destructive" : "warning";
  const noticeTitle =
    saveState === "error" ? "Permissions were not saved." : "Permissions need attention.";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 text-center sm:text-left">
          <p className="studio-kicker text-center sm:text-left">Wire</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 justify-center sm:justify-start">
            <h2 className="text-[19px] font-semibold tracking-[-0.02em] leading-tight text-foreground text-center sm:text-left">
              Arm {selectedAgent?.name || "your agent"}.
            </h2>
            {!loading ? (
              <Badge variant="info" className="text-[10px] font-mono uppercase tracking-[0.06em]">
                {enabledTools.length} on
              </Badge>
            ) : null}
          </div>
        </div>
        <NativeSelect
          value={agentId}
          onChange={(event) => chooseAgent(event.target.value)}
          className="max-w-[240px]"
          aria-label="Choose agent"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      {notice ? (
        <StatusNotice className="mb-5" tone={noticeTone} title={noticeTitle}>
          {notice}
        </StatusNotice>
      ) : null}
      {saveState === "saved" ? (
        <StatusNotice className="mb-5" tone="success" title="Wired.">
          {selectedAgent?.name || "Agent"} armed.
        </StatusNotice>
      ) : null}

      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,.75fr)] lg:gap-6">
        <section className="wl-scroll min-h-0 overflow-y-auto pr-0.5">
          <div className="space-y-5">
            {loading
              ? Array.from({ length: 3 }, (_, index) => (
                  <Skeleton key={index} shape="surface" className="h-[176px] w-full" />
                ))
              : Object.entries(everydayGroups).map(([group, tools]) => (
                  <ToolGroup
                    key={group}
                    title={GROUP_LABELS[group] || group}
                    tools={tools}
                    enabled={enabledTools}
                    disabled={saveState === "saving"}
                    onToggle={toggle}
                  />
                ))}
          </div>
          {Object.keys(businessGroups).length ? (
            <details className="studio-card mt-5 p-5">
              <summary className="cursor-pointer text-[var(--wireline-typography-body-size)] font-semibold text-[var(--wireline-color-text-primary)]">
                Business tools
              </summary>
              <p className="mt-2 text-[var(--wireline-typography-caption-size)] leading-5 text-[var(--wireline-color-text-secondary)] text-center">
                Business tools. Enable what fits.
              </p>
              <div className="mt-5 space-y-5">
                {Object.entries(businessGroups).map(([group, tools]) => (
                  <ToolGroup
                    key={group}
                    title={GROUP_LABELS[group] || group}
                    tools={tools}
                    enabled={enabledTools}
                    disabled={loading || saveState === "saving"}
                    onToggle={toggle}
                  />
                ))}
              </div>
            </details>
          ) : null}
          <p
            className="mt-4 inline-flex min-h-5 items-center gap-2 wl-overline"
            role="status"
            aria-live="polite"
          >
            {saveState === "saving" ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Saving permission changes
              </>
            ) : (
              ""
            )}
          </p>
        </section>

        <aside className="mt-6 min-h-0 lg:mt-0">
          <div className="text-center">
            <div className="text-center">
              <p className="studio-kicker">Integrations</p>
              <h2 className="wl-section-title mt-1">Wire the world.</h2>
            </div>
          </div>
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
              const stateVariant = connected
                ? "success"
                : integration.connection === "workspace"
                  ? "info"
                  : "default";
              return (
                <article
                  className="studio-card flex min-h-[82px] items-center justify-between gap-3 p-4"
                  key={integration.id}
                >
                  <div className="min-w-0">
                    <h3 className="wl-card-title">{integration.label}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {integration.detail}
                    </p>
                  </div>
                  <Badge
                    variant={stateVariant}
                    className="shrink-0 text-[var(--wireline-typography-overline-size)] uppercase tracking-[.06em]"
                  >
                    {state}
                  </Badge>
                </article>
              );
            })}
          </div>
          <Button asChild variant="secondary" className="mt-4 w-full">
            <Link to="/actions">Open Wire</Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
