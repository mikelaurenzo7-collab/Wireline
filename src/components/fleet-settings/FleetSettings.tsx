/* eslint-disable @typescript-eslint/no-explicit-any -- Agent / subscription /
 * integration-status payloads come back as heterogeneous JSON from /api/agents,
 * /api/subscription, /api/oauth/crm/status and the per-agent config endpoints.
 * Modeling them as shared client types belongs in contracts/api-types.ts and
 * is tracked separately; this component intentionally treats the rows as
 * any[] until those contracts land. */
import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authFetch, safeJson } from "../../lib/api";
import { clientLog } from "../../lib/client-log";
import { AGENTS_CHANGED_EVENT } from "../../contexts/AgentsContext";
import ConfirmModal from "../ConfirmModal";
import { useToast } from "../../contexts/ToastContext";
import { useAccount } from "../../contexts/AccountContext";
import AgentTemplates from "../AgentTemplates";
import ClientRouteViewport from "../layout/ClientRouteViewport";
import ClientToolbar from "../layout/ClientToolbar";
import DirectorWorkspace from "../DirectorWorkspace";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { cn } from "../../lib/utils";
import { LayoutGrid, ArrowLeft } from "lucide-react";
import { OPS_CHANNEL_TOOLBAR } from "../../lib/wireline-ops-design";
import {
  AGENT_TOOL_CATALOG,
  resolveAgentTools,
  type AgentToolName,
} from "../../lib/agent-capabilities";
// Fleet helpers — extracted in the 2026 audit god-file slicing pass.
// Local imports for use within this file; re-exports below preserve
// existing call sites in InsightsView, DeployAgentModal, etc.
import {
  PREMIUM_VOICES,
  DEFAULT_VOICE_BY_GENDER,
  AGENT_ROLES,
  type RoleValue,
} from "../fleet/helpers";
// Sidebar extracted during the 2026 audit god-file slicing pass.
import AgentListPanel from "./AgentListPanel";
import AgentConfigPanel from "./AgentConfigPanel";
import AgentIdentityVitals from "./AgentIdentityVitals";
import AgentReadinessStage from "./AgentReadinessStage";
import TuningRailMap from "./TuningRailMap";

// Re-export the public surface so existing consumers
// (`import { AGENT_ROLES } from "./FleetSettings"`) keep working
// without changes. New code should import directly from
// "./fleet/helpers" — these re-exports are a back-compat shim and
// can be removed once every callsite has been migrated.
export { PREMIUM_VOICES, DEFAULT_VOICE_BY_GENDER, AGENT_ROLES };

export default function FleetSettings() {
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Personal vs Business Studio. A Personal account ($9, one agent, your own
  // line) gets a calm two-pane, single-agent surface driven by the Assistant —
  // no fleet switcher, no seed-fleet, and an essentials-only tuning index.
  // Every other plan gets the full three-pane fleet cockpit.
  const { accountType } = useAccount();
  const isPersonal = accountType === "personal";
  // The Studio is one open canvas, not a tab wall. Default view is the build
  // canvas (your agents); templates are a starting point you summon, not the
  // front door. A template deploy lands back on the canvas (see ?agent= below).
  const [view, setView] = useState<"canvas" | "templates">("canvas");
  const [agents, setAgents] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<{ status: string; max_agents: number | null }>({
    status: "active",
    max_agents: 3,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentChannel, _setNewAgentChannel] = useState("voice");
  const [newAgentRole, _setNewAgentRole] = useState<RoleValue>("customer_service");
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  // Single-focus Studio: collapse the desktop agent list to a slim rail so the
  // editor is the focus. Defaults collapsed; the full list returns when no
  // agent is selected (you need it to pick or create one).
  const [listCollapsed, setListCollapsed] = useState(true);

  const [isConfigLoading, setIsConfigLoading] = useState(false);
  // Tenant-level connection status for the integration scoping panel.
  // Populated once on mount and refreshed when the OAuth popup posts
  // CRM_OAUTH_SUCCESS; powers the "Required integrations" chips so the
  // operator can see which of the agent's tools have a live connection
  // backing them.
  const [integrationStatus, setIntegrationStatus] = useState<Record<
    string,
    { connected: boolean }
  > | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await authFetch("/api/oauth/crm/status");
        if (!r.ok || cancelled) return;
        const data = await r.json();
        if (!cancelled) setIntegrationStatus(data);
      } catch {
        /* ignore — chips just won't show connection state */
      }
    })();
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "CRM_OAUTH_SUCCESS") {
        authFetch("/api/oauth/crm/status")
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) setIntegrationStatus(data);
          })
          .catch((err) => clientLog.error("fleet-settings:crm-status", err));
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
    };
  }, []);
  const [agentConfig, setAgentConfig] = useState<any>({
    personality: "",
    directives: [],
    knowledge: [],
  });
  // Tracks the currently-selected agent so async fetchAgentConfig calls
  // don't overwrite agentConfig with a stale agent's data when the operator
  // switches selection mid-flight. fetchAgentConfig is invoked from many
  // places (the selection effect, post-save refresh, manual refresh) so
  // a single ref-based guard is simpler than threading AbortController
  // through every caller.
  const selectedAgentIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedAgentIdRef.current = selectedAgent?.id ?? null;
  }, [selectedAgent?.id]);

  // Deep-link / template-deploy focus: when ?agent=<id> points at a different
  // agent (e.g. a template just deployed into the fleet), refresh the list and
  // put that agent on the canvas. Both tabs stay mounted, so this must react
  // to the param — a mount-time check alone would miss mid-session deploys.
  const requestedAgentId = searchParams.get("agent");
  useEffect(() => {
    if (!requestedAgentId || requestedAgentId === selectedAgentIdRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await authFetch("/api/agents");
        const data = await r.json();
        if (cancelled) return;
        const list = data.agents || [];
        setAgents(list);
        const match = list.find((a: { id: string }) => a.id === requestedAgentId);
        if (match) {
          setSelectedAgent(match);
          // A template just deployed (or a deep link) — snap back to the canvas
          // so the new agent is what you see, not the gallery you came from.
          setView("canvas");
        }
      } catch {
        /* non-critical — manual selection still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestedAgentId]);

  const fetchAgents = async () => {
    setIsLoading(true);
    try {
      const [agentsRes, settingsRes] = await Promise.all([
        authFetch("/api/agents").then((r) => r.json()),
        authFetch("/api/settings").then((r) => r.json()),
      ]);

      setAgents(agentsRes.agents || []);
      if (settingsRes) {
        const settings = settingsRes.settings || settingsRes;
        setSubscription({
          status: settings.subscription_status || "active",
          max_agents: settings.max_agents ?? null,
        });
      }

      if (!selectedAgent && agentsRes.agents?.length > 0) {
        // Deep-link focus: /agents?agent=<id> lands with that agent on the
        // canvas (template deploys route here). Falls back to the first agent.
        const requestedId = searchParams.get("agent");
        const requested = requestedId
          ? agentsRes.agents.find((a: { id: string }) => a.id === requestedId)
          : undefined;
        setSelectedAgent(requested ?? agentsRes.agents[0]);
      }

      // Notify the app-wide agents context so the chat rail + anything else
      // built on it reflect newly created/deleted agents without a reload.
      window.dispatchEvent(new Event(AGENTS_CHANGED_EVENT));
    } catch (e) {
      clientLog.error("fleet-settings:load-agents", e);
      toastError("Agent fleet unavailable", "Could not load agents. Please refresh.");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time fetch on mount
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      fetchAgentConfig(selectedAgent.id);
      fetchAgentPerformance(selectedAgent.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-keyed on selected agent id
  }, [selectedAgent?.id]);

  const fetchAgentConfig = async (id: string) => {
    setIsConfigLoading(true);
    try {
      const res = await authFetch(`/api/agent-config/${id}`);
      const data = await res.json();
      // Drop the response if the operator has since switched agents;
      // otherwise we'd render Agent A's personality/directives under
      // Agent B's header.
      if (selectedAgentIdRef.current !== id) return;
      setAgentConfig(data);
    } catch (e) {
      clientLog.error("fleet-settings:load-config", e);
      if (selectedAgentIdRef.current === id)
        toastError("Config unavailable", "Could not load agent configuration.");
    } finally {
      if (selectedAgentIdRef.current === id) setIsConfigLoading(false);
    }
  };

  const handleCreateAgent = async (overrideData?: {
    id: string;
    name: string;
    channel: string;
    role: string;
  }) => {
    const agentId = overrideData?.id || newAgentId;
    const agentName = overrideData?.name || newAgentName;
    const agentChannel = overrideData?.channel || newAgentChannel;
    const agentRole = overrideData?.role || newAgentRole;
    if (!agentName || !agentId) return;

    if (subscription.status !== "active" && subscription.status !== "trialing") {
      toastWarning("Subscription required", "Activate a billing plan to deploy agents.");
      return;
    }

    if (subscription.max_agents !== null && agents.length >= subscription.max_agents) {
      toastWarning(
        "Fleet capacity reached",
        `${subscription.max_agents} agents maximum on current plan.`,
      );
      return;
    }

    setIsCreating(true);
    try {
      const resp = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agentId,
          name: agentName,
          channel: agentChannel,
          role: agentRole,
        }),
      });
      const data = await safeJson(resp);

      if (!resp.ok) {
        const message =
          typeof data === "object" && data && "error" in data && typeof data.error === "string"
            ? data.error
            : "Please try again.";
        if (resp.status === 403) {
          toastWarning("Access denied", message || "Upgrade your plan.");
        } else if (resp.status === 401) {
          toastError("Session expired", message || "Please sign in again.");
        } else {
          toastError("Deployment failed", message);
        }
        return;
      }

      setNewAgentName("");
      setNewAgentId("");
      toastSuccess("Agent deployed", agentName);
      await fetchAgents();
      navigate(`/agents?agent=${encodeURIComponent(agentId)}`);
    } catch {
      toastError("Deployment failed", "Could not reach the server. Please try again.");
    }
    setIsCreating(false);
  };

  // Apply the server-side role personality template to the selected agent.
  const applyRoleTemplate = async (role: string) => {
    if (!selectedAgent) return;
    setIsApplyingTemplate(true);
    try {
      const resp = await authFetch(`/api/agents/${selectedAgent.id}/apply-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setAgentConfig((prev: any) => ({ ...prev, personality: data.content }));
        toastSuccess("Role template applied", `${role.replace(/_/g, " ")} personality loaded`);
      }
    } catch (e: any) {
      toastError("Template failed", e.message);
    }
    setIsApplyingTemplate(false);
  };

  const updateAgentMeta = async (updates: any) => {
    if (!selectedAgent) return;
    const body = { ...selectedAgent, ...updates };
    await authFetch(`/api/agents/${selectedAgent.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSelectedAgent(body);
    setAgents(agents.map((a) => (a.id === selectedAgent.id ? body : a)));
  };

  const toggleAgentTool = async (toolName: AgentToolName) => {
    if (!selectedAgent) return;
    const currentTools = resolveAgentTools(selectedAgent.role, selectedAgent.enabled_tools);
    const nextTools = currentTools.includes(toolName)
      ? currentTools.filter((name) => name !== toolName)
      : [...currentTools, toolName];
    await updateAgentMeta({ enabled_tools: nextTools });
  };

  const resetAgentToolsToRoleDefaults = async () => {
    if (!selectedAgent) return;
    await updateAgentMeta({ enabled_tools: null });
  };

  // Per-integration master toggle. Flips every tool tied to the given
  // integration on or off as a group — operator can say "Sarah uses
  // Apollo + Slack but not Zoom" in two clicks instead of toggling six
  // individual tools. The "core" group (no integration) is excluded
  // because it's always useful — every agent needs escalate_to_human,
  // create_fleet_task, etc. regardless of which third parties they wire.
  const toggleIntegrationGroup = async (integration: string, enable: boolean) => {
    if (!selectedAgent) return;
    const currentTools = resolveAgentTools(selectedAgent.role, selectedAgent.enabled_tools);
    const toolsInGroup = AGENT_TOOL_CATALOG.filter((t) => t.integration === integration).map(
      (t) => t.name,
    );
    if (toolsInGroup.length === 0) return;
    const nextTools = enable
      ? Array.from(new Set([...currentTools, ...toolsInGroup]))
      : currentTools.filter((name) => !toolsInGroup.includes(name));
    await updateAgentMeta({ enabled_tools: nextTools });
  };

  const [isDeletingAgent, setIsDeletingAgent] = useState<string | null>(null);
  const [agentStats, setAgentStats] = useState<Record<string, any>>({});

  const normalizeAgentPerformance = (data: any) => ({
    callCount: Number(data?.callCount ?? 0),
    totalMinutes: Number(data?.totalMinutes ?? 0),
    avgScore: Number(data?.avgScore ?? 0),
    sentiment: {
      positive: Number(data?.sentiment?.positive ?? 0),
      neutral: Number(data?.sentiment?.neutral ?? 0),
      negative: Number(data?.sentiment?.negative ?? 0),
    },
    sparkline: Array.isArray(data?.sparkline) ? data.sparkline : [],
  });

  const fetchAgentPerformance = async (id: string, force = false) => {
    if (agentStats[id] && !force) return; // already loaded; use force=true to refresh
    try {
      const r = await authFetch(`/api/agents/${id}/performance`);
      if (r.ok) {
        const data = await r.json();
        setAgentStats((prev) => ({ ...prev, [id]: normalizeAgentPerformance(data) }));
      }
    } catch {
      /* non-critical */
    }
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);

  const handleDirectorFocusAgent = (agentId: string | null) => {
    if (!agentId) {
      setSelectedAgent(null);
      navigate("/agents", { replace: true });
      return;
    }
    const match = agents.find((a) => a.id === agentId);
    if (match) setSelectedAgent(match);
    setView("canvas");
    navigate(`/agents?agent=${encodeURIComponent(agentId)}`, { replace: true });
  };

  const handleDeleteAgent = async (agentId: string) => {
    setIsDeletingAgent(agentId);
    try {
      const resp = await authFetch(`/api/agents/${agentId}`, { method: "DELETE" });
      if (resp.ok) {
        const remaining = agents.filter((a) => a.id !== agentId);
        setAgents(remaining);
        if (selectedAgent?.id === agentId) {
          setSelectedAgent(remaining.length > 0 ? remaining[0] : null);
        }
        toastSuccess("Agent decommissioned", deleteConfirm?.name ?? agentId);
      } else {
        const data = await resp.json().catch(() => ({}));
        toastError("Failed to decommission", data.error || "Please try again.");
      }
    } catch {
      toastError("Network error", "Failed to decommission agent.");
    }
    setIsDeletingAgent(null);
  };

  return (
    <>
      <ClientRouteViewport>
        <ClientToolbar
          left={
            <span className="app-toolbar-stat wl-label text-muted/80 tracking-[0.28em]">
              {view === "templates"
                ? "Start from a template"
                : isPersonal
                  ? "Your assistant"
                  : OPS_CHANNEL_TOOLBAR.fleet.agentsStat(agents.length)}
            </span>
          }
          actions={
            view === "templates" ? (
              <ShadButton
                type="button"
                variant="ghost"
                size="sm"
                disableAnimations
                onClick={() => setView("canvas")}
                className="gap-1.5 wl-label text-muted hover:text-brand"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to your agents
              </ShadButton>
            ) : (
              <ShadButton
                type="button"
                variant="outline"
                size="sm"
                disableAnimations
                onClick={() => setView("templates")}
                className="gap-1.5 wl-label border-border hover:border-brand/30 hover:text-brand"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Start from a template
              </ShadButton>
            )
          }
        />
        {/* One open canvas — no tab wall. The middle is now the Director chat:
            clients describe the exact agent they want, while the right rail
            exposes precise controls for voice, model, tools, rules, and context. */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div
            hidden={view !== "templates"}
            className="flex-1 min-h-0 flex flex-col overflow-hidden"
          >
            <AgentTemplates />
          </div>
          <div
            hidden={view !== "canvas"}
            className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden"
          >
            {/* Left: fleet switcher (Business). Collapsed once an agent is
                selected so the Assistant conversation and tuning controls get the
                prime space. A Personal account has one agent, so the switcher only
                surfaces for first-run creation, then steps out of the way. */}
            {(!isPersonal || !selectedAgent) && (
              <AgentListPanel
                agents={agents}
                selectedAgent={selectedAgent}
                isLoading={isLoading}
                isCreating={isCreating}
                isDeletingAgent={isDeletingAgent}
                agentStats={agentStats}
                subscription={subscription}
                isPersonal={isPersonal}
                onSelectAgent={setSelectedAgent}
                onDeleteAgent={(agent) => setDeleteConfirm(agent)}
                onCreateAgent={({ id, name, channel, role }) => {
                  handleCreateAgent({ id, name, channel, role });
                }}
                onSeedFleet={() => setSeedConfirmOpen(true)}
                onFetchPerformance={fetchAgentPerformance}
                collapsed={!isPersonal && listCollapsed && !!selectedAgent}
                onToggleCollapse={isPersonal ? undefined : () => setListCollapsed((v) => !v)}
              />
            )}

            {/* Middle: the agent canvas. Identity up top, an open stage in the
                center, and the Director co-pilot docked as a focused chat at the
                bottom — describe the agent you want in plain English; the precise
                controls live in the right rail. */}
            <section
              data-testid="studio-director-center"
              className="relative min-h-[60dvh] md:min-h-0 min-w-0 md:flex-1 flex flex-col border-y md:border-y-0 md:border-x border-border/70 bg-background/45"
              aria-label="Agent canvas"
            >
              {selectedAgent && (
                <>
                  {/* Identity hero — name, then who answers, in what voice, on
                      what brain, at what number. Anchors the open canvas. */}
                  <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border/50">
                    <div className="flex items-center gap-3 mb-3 min-w-0">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand/12 text-brand text-base font-semibold uppercase">
                        {String(selectedAgent.name ?? "A")
                          .trim()
                          .charAt(0) || "A"}
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold leading-tight text-foreground/90 font-display">
                          {selectedAgent.name || "Untitled agent"}
                        </h2>
                        <p className="wl-label capitalize text-muted/80">
                          {selectedAgent.role
                            ? String(selectedAgent.role).replace(/_/g, " ")
                            : "Agent"}
                        </p>
                      </div>
                    </div>
                    <AgentIdentityVitals agent={selectedAgent} />
                  </div>
                  {/* Open stage — the focal readiness moment that anchors the
                      co-pilot to the bottom. Shows where the agent stands and the
                      one thing to do next (works on every viewport). */}
                  <AgentReadinessStage
                    agent={selectedAgent}
                    agentConfig={agentConfig}
                    integrationStatus={integrationStatus}
                    accountType={accountType}
                  />
                </>
              )}
              {/* The Wireline Assistant, docked as a focused chat. Fills the
                  canvas as the first-run surface, then anchors below the
                  identity + readiness ribbon once an agent is selected. It
                  always grows to fill the remaining height and scrolls
                  internally, so the canvas fits any laptop/desktop viewport
                  without clipping. */}
              <div
                className={cn(
                  "flex flex-1 flex-col min-h-0",
                  selectedAgent && "border-t border-border/60 bg-background/60",
                )}
              >
                <DirectorWorkspace
                  focusAgentId={selectedAgent?.id ?? null}
                  onFocusAgentChange={handleDirectorFocusAgent}
                />
              </div>
            </section>

            {/* Right: precision tuning rail. The Director can propose changes in
                the middle, and clients can still manually customize everything. */}
            <aside
              data-testid="studio-tuning-rail"
              className="shrink-0 flex min-h-0 flex-col overflow-hidden border-t md:border-t-0 border-border/70 bg-card/70 dark:bg-velvet/35 md:w-[clamp(360px,30vw,420px)] xl:w-[clamp(380px,27vw,460px)]"
              aria-label="Agent tuning rail"
            >
              <div className="shrink-0 border-b border-border/80 px-4 py-3 bg-card/85 dark:bg-velvet/50">
                <div className="flex items-center justify-between gap-2">
                  <p className="wl-label text-brand tracking-[0.22em]">
                    {isPersonal ? "Personalize" : "Tune"}
                  </p>
                  <span className="wl-label-muted">Manual controls</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  {isPersonal
                    ? "Anything the Assistant sets up, you can adjust by hand — voice, what it knows, your number, and going live."
                    : "Everything the Assistant can change, you can fine-tune by hand — identity, voice, model, knowledge, tools, rules, and launch readiness."}
                </p>
              </div>
              <div className="flex-1 min-h-0 scroll-viewport flex flex-col">
                <TuningRailMap
                  selectedAgent={selectedAgent}
                  agentConfig={agentConfig}
                  integrationStatus={integrationStatus}
                  accountType={accountType}
                />
                <AgentConfigPanel
                  selectedAgent={selectedAgent}
                  setSelectedAgent={setSelectedAgent}
                  agentConfig={agentConfig}
                  setAgentConfig={setAgentConfig}
                  isConfigLoading={isConfigLoading}
                  fetchAgentConfig={fetchAgentConfig}
                  updateAgentMeta={updateAgentMeta}
                  toggleIntegrationGroup={toggleIntegrationGroup}
                  toggleAgentTool={toggleAgentTool}
                  resetAgentToolsToRoleDefaults={resetAgentToolsToRoleDefaults}
                  agentStats={agentStats}
                  fetchAgentPerformance={fetchAgentPerformance}
                  isApplyingTemplate={isApplyingTemplate}
                  applyRoleTemplate={applyRoleTemplate}
                  integrationStatus={integrationStatus}
                />
              </div>
            </aside>
          </div>
        </div>
      </ClientRouteViewport>
      <ConfirmModal
        open={seedConfirmOpen}
        title="Seed specialized agents?"
        message="This will deploy a set of pre-configured role-based agents into your fleet. Existing agents will not be affected."
        confirmLabel="Seed fleet"
        onConfirm={async () => {
          setSeedConfirmOpen(false);
          setIsCreating(true);
          try {
            const resp = await authFetch("/api/fleet/seed", { method: "POST" });
            if (resp.ok) await fetchAgents();
          } finally {
            setIsCreating(false);
          }
        }}
        onCancel={() => setSeedConfirmOpen(false)}
      />
      <ConfirmModal
        open={!!deleteConfirm}
        title="Delete agent?"
        message={`"${deleteConfirm?.name}" will be permanently removed along with all its training data. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={!!isDeletingAgent}
        onConfirm={async () => {
          if (!deleteConfirm) return;
          await handleDeleteAgent(deleteConfirm.id);
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </>
  );
}
