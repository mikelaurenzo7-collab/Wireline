import { useSearchParams } from "react-router";
import { Loader2 } from "lucide-react";
import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import PhoneSetupPanel from "../components/PhoneSetupPanel";
import PhoneCallHistoryPanel from "../components/PhoneCallHistoryPanel";
import CallOpsOverview from "../components/CallOpsOverview";
import OutboundHub from "../components/outbound/OutboundHub";
import AppointmentsPanel from "../components/AppointmentsPanel";
import WorkspaceControlBand from "../components/layout/WorkspaceControlBand";
import { WorkspaceOperateIntro, WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import { useAgents } from "../contexts/AgentsContext";
import {
  OUTBOUND_VIEW_TABS,
  resolveAppPageSecondaryTabId,
  resolveAppPageSubTabId,
} from "../lib/page-sub-tabs";

const PHONE_TABS = [
  { id: "logs", label: "History" },
  { id: "analytics", label: "Analytics" },
  { id: "outbound", label: "Outbound" },
  {
    id: "appointments",
    label: "Appointments",
    shortLabel: "Appts",
    ariaLabel: "Appointments",
  },
  { id: "setup", label: "Lines" },
] as const;

export default function PhonePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    agents,
    loading: agentsLoading,
    degraded: agentsDegraded,
    refresh: refreshAgents,
  } = useAgents();
  const tabParam = searchParams.get("tab");
  const legacyOutboundView = OUTBOUND_VIEW_TABS.some((tab) => tab.id === tabParam)
    ? tabParam
    : null;
  const primaryTab = resolveAppPageSubTabId(
    {
      pathname: "/phone",
      tabs: [...PHONE_TABS],
      defaultTab: "logs",
      ariaLabel: "Call sections",
      layoutIdPrefix: "phone-section",
    },
    legacyOutboundView ? "outbound" : tabParam,
  );
  const outboundView = resolveAppPageSecondaryTabId(
    { tabs: OUTBOUND_VIEW_TABS, defaultView: "dispatch" },
    searchParams.get("view") || legacyOutboundView,
  ) as (typeof OUTBOUND_VIEW_TABS)[number]["id"];
  const requestedAgentId = searchParams.get("agent")?.trim() || "";
  // An explicit Bot is a scope, not a preference to replace with all calls.
  const activeAgentId = requestedAgentId;
  const hasRequestedAgent = agents.some((agent) => agent.id === activeAgentId);
  const usesAgentScope = primaryTab === "logs" || primaryTab === "setup";
  const scopeLoading = Boolean(usesAgentScope && activeAgentId && agentsLoading);
  const scopeUnavailable = Boolean(
    usesAgentScope && activeAgentId && !agentsLoading && !hasRequestedAgent,
  );
  const scopeBlocked = scopeLoading || scopeUnavailable;

  function setPrimaryTab(id: string) {
    setSearchParams(
      (prev) => {
        if (id === "logs") prev.delete("tab");
        else prev.set("tab", id);
        if (id !== "outbound") prev.delete("view");
        return prev;
      },
      { replace: true },
    );
  }

  function setOutboundView(id: string) {
    setSearchParams(
      (prev) => {
        prev.set("tab", "outbound");
        if (id === "dispatch") prev.delete("view");
        else prev.set("view", id);
        return prev;
      },
      { replace: true },
    );
  }

  function setAgentScope(agentId: string) {
    setSearchParams(
      (prev) => {
        if (agentId) prev.set("agent", agentId);
        else prev.delete("agent");
        return prev;
      },
      { replace: true },
    );
  }

  const showAgentScope =
    (primaryTab === "logs" && (agents.length > 1 || activeAgentId)) || scopeBlocked;
  const agentScope = showAgentScope ? (
    <select
      value={activeAgentId}
      onChange={(event) => setAgentScope(event.target.value)}
      aria-label={primaryTab === "setup" ? "Choose Bot for Lines" : "Filter call history by Bot"}
      className="min-h-[44px] max-w-full shrink-0 rounded-lg border border-border bg-card px-3 text-base font-semibold text-foreground sm:min-h-9 sm:max-w-[10rem] sm:px-2 sm:text-xs wl-focus-ring-halo"
    >
      <option value="">All Bots</option>
      {activeAgentId && !hasRequestedAgent ? (
        <option value={activeAgentId} disabled>
          {agentsLoading ? "Loading Bot…" : "Selected Bot unavailable"}
        </option>
      ) : null}
      {agents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
        </option>
      ))}
    </select>
  ) : undefined;

  return (
    <WorkspaceShell contentClassName="pt-0 pb-0" fullBleed>
      <WorkspacePageFrame
        mode="operate"
        className="flex min-h-0 flex-1 flex-col gap-0 pb-5 lg:pb-4"
      >
        <WorkspaceOperateIntro
          title="Calls"
          titleHidden
          tabs={
            <WorkspaceControlBand
              embedded
              ariaLabel="Call controls"
              primary={
                <WorkspaceTabStrip
                  tabs={[...PHONE_TABS]}
                  activeId={primaryTab}
                  onSelect={setPrimaryTab}
                  ariaLabel="Call sections"
                  density="compact"
                  align="start"
                  mobileSelect
                  className="mb-0 min-w-0 flex-1 border-b-0 pb-0"
                />
              }
              secondary={agentScope}
            />
          }
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {scopeLoading ? (
            <div
              role="status"
              className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading selected Bot…
            </div>
          ) : scopeUnavailable ? (
            <StatusNotice tone="warning" title="Selected Bot Unavailable" className="m-3 sm:m-6">
              <p>
                {agentsDegraded
                  ? "We couldn't verify this Bot. Retry or choose another."
                  : "This Bot is no longer available. Choose another or view all Bots."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={refreshAgents}>
                  Retry
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAgentScope("")}>
                  All Bots
                </Button>
              </div>
            </StatusNotice>
          ) : null}
          {primaryTab === "logs" && !scopeBlocked && (
            <div className="contents" data-visual-qa-state="primary-logs">
              <PhoneCallHistoryPanel agentId={activeAgentId || null} />
            </div>
          )}
          {primaryTab === "analytics" && (
            <div className="contents" data-visual-qa-state="primary-analytics">
              <CallOpsOverview />
            </div>
          )}
          {primaryTab === "outbound" && (
            <div className="contents" data-visual-qa-state="primary-outbound">
              <div className="contents" data-visual-qa-state={`secondary-${outboundView}`}>
                <OutboundHub activeView={outboundView} onViewChange={setOutboundView} />
              </div>
            </div>
          )}
          {primaryTab === "appointments" && (
            <div className="contents" data-visual-qa-state="primary-appointments">
              <AppointmentsPanel />
            </div>
          )}
          {primaryTab === "setup" && !scopeBlocked && (
            <div
              className="mx-auto w-full max-w-[1180px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8"
              data-visual-qa-state="primary-setup"
            >
              <PhoneSetupPanel initialAgentId={activeAgentId} />
            </div>
          )}
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
