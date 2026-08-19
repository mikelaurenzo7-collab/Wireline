import { useSearchParams } from "react-router";
import WorkspaceShell from "../components/WorkspaceShell";
import PhoneSetupPanel from "../components/PhoneSetupPanel";
import PhoneCallHistoryPanel from "../components/PhoneCallHistoryPanel";
import OutboundHub from "../components/outbound/OutboundHub";
import AppointmentsPanel from "../components/AppointmentsPanel";
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
  const { agents } = useAgents();
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
  const activeAgentId = agents.some((agent) => agent.id === requestedAgentId)
    ? requestedAgentId
    : "";

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

  const showAgentScope = primaryTab === "logs" && (agents.length > 1 || activeAgentId);

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
            <div className="flex min-w-0 items-center gap-2">
              <WorkspaceTabStrip
                tabs={[...PHONE_TABS]}
                activeId={primaryTab}
                onSelect={setPrimaryTab}
                ariaLabel="Call sections"
                density="compact"
                align="start"
                className="mb-0 min-w-0 flex-1 border-b-0 pb-0"
              />
              {showAgentScope ? (
                <select
                  value={activeAgentId}
                  onChange={(event) => setAgentScope(event.target.value)}
                  aria-label="Filter call history by Bot"
                  className="h-9 max-w-[10rem] shrink-0 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-foreground outline-none focus:border-primary/50"
                >
                  <option value="">All Bots</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          }
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {primaryTab === "logs" && <PhoneCallHistoryPanel agentId={activeAgentId || null} />}
          {primaryTab === "outbound" && (
            <OutboundHub activeView={outboundView} onViewChange={setOutboundView} />
          )}
          {primaryTab === "appointments" && <AppointmentsPanel />}
          {primaryTab === "setup" && (
            <div className="mx-auto w-full max-w-[1180px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
              <PhoneSetupPanel />
            </div>
          )}
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}