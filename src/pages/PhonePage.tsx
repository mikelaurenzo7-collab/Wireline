import { Navigate, useSearchParams } from "react-router";
import { Loader2 } from "lucide-react";
import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceShell from "../components/WorkspaceShell";
import PhoneSetupPanel from "../components/PhoneSetupPanel";
import PhoneCallHistoryPanel from "../components/PhoneCallHistoryPanel";
import ReportingPreferences from "../components/training/ReportingPreferences";
import RecentCallArtifactRequests from "../components/training/RecentCallArtifactRequests";
import OutboundHub from "../components/outbound/OutboundHub";
import PreparedCallReview from "../components/outbound/PreparedCallReview";
import WorkspaceControlBand from "../components/layout/WorkspaceControlBand";
import { WorkspaceOperateIntro, WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import { useAgents } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { buildAgentOptionLabels } from "../lib/agent-option-labels";
import { useChannelEntitlements } from "../hooks/useChannelEntitlements";
import ChannelAccessNotice from "../components/ChannelAccessNotice";
import {
  OUTBOUND_VIEW_TABS,
  resolveAppPageSecondaryTabId,
  resolveAppPageSubTabId,
} from "../lib/page-sub-tabs";

// Call performance lives in Insights with every other channel; Calls owns the
// call log, outbound work, and the lines themselves.
const PHONE_TABS = [
  { id: "logs", label: "History" },
  { id: "reports", label: "Reports" },
  { id: "outbound", label: "Outbound" },
  { id: "setup", label: "Lines" },
] as const;

/** Readable ?tab= values from links and emails. */
const PHONE_TAB_ALIASES: Record<string, string> = { lines: "setup", history: "logs" };

export default function PhonePage() {
  const { user } = useAuth();
  const access = useChannelEntitlements();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    agents,
    loading: agentsLoading,
    degraded: agentsDegraded,
    refresh: refreshAgents,
  } = useAgents();
  const rawTabParam = searchParams.get("tab");
  const tabParam = (rawTabParam && PHONE_TAB_ALIASES[rawTabParam.toLowerCase()]) || rawTabParam;
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
  const scopeLoading = Boolean(activeAgentId && agentsLoading);
  const scopeUnavailable = Boolean(activeAgentId && !agentsLoading && !hasRequestedAgent);
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
    (["logs", "reports"].includes(primaryTab) && (agents.length > 1 || activeAgentId)) ||
    (primaryTab === "outbound" && activeAgentId) ||
    scopeBlocked;

  // Bookmarks to the retired Calls › Analytics tab open the same view in Insights.
  if (rawTabParam === "analytics") {
    return <Navigate to="/insights?tab=performance&view=calls" replace />;
  }
  const agentLabels = buildAgentOptionLabels(agents);
  const agentScope = showAgentScope ? (
    <select
      value={activeAgentId}
      onChange={(event) => setAgentScope(event.target.value)}
      aria-label={
        primaryTab === "setup"
          ? "Choose Bot for Lines"
          : primaryTab === "outbound"
            ? "Choose Bot for Outbound"
            : "Filter call history by Bot"
      }
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
          {agentLabels.get(agent.id) || agent.name}
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
          {searchParams.get("callRequest") ? (
            <PreparedCallReview
              key={`${user?.id}:${searchParams.get("callRequest")}`}
              requestKey={searchParams.get("callRequest")!}
              onClose={() =>
                setSearchParams(
                  (previous) => {
                    previous.delete("callRequest");
                    return previous;
                  },
                  { replace: true },
                )
              }
            />
          ) : null}
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
          {primaryTab === "reports" && !scopeBlocked && (
            <div className="mx-auto w-full max-w-[1180px] space-y-5 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
              <ReportingPreferences />
              <RecentCallArtifactRequests key={activeAgentId} agentId={activeAgentId || null} />
            </div>
          )}
          {primaryTab === "outbound" && !scopeBlocked && (
            <div className="contents" data-visual-qa-state="primary-outbound">
              <div className="contents" data-visual-qa-state={`secondary-${outboundView}`}>
                <OutboundHub
                  key={activeAgentId}
                  activeView={outboundView}
                  onViewChange={setOutboundView}
                  initialAgentId={activeAgentId}
                />
              </div>
            </div>
          )}
          {primaryTab === "setup" && !scopeBlocked && (
            <div
              className="mx-auto w-full max-w-[1180px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8"
              data-visual-qa-state="primary-setup"
            >
              {access.includes("voice") || access.includes("sms") ? (
                <PhoneSetupPanel
                  initialAgentId={activeAgentId}
                  voiceEnabled={access.includes("voice")}
                />
              ) : (
                <ChannelAccessNotice access={access} channel="voice" />
              )}
            </div>
          )}
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
