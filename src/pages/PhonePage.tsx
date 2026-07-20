import { useSearchParams } from "react-router-dom";
import WorkspaceShell from "../components/WorkspaceShell";
import PhoneCallHistoryPanel from "../components/PhoneCallHistoryPanel";
import OutboundHub from "../components/outbound/OutboundHub";
import AppointmentsPanel from "../components/AppointmentsPanel";
import { WorkspaceOperateIntro, WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
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
] as const;

export default function PhonePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const legacyOutboundView = OUTBOUND_VIEW_TABS.some((tab) => tab.id === tabParam)
    ? tabParam
    : null;
  const primaryTab = resolveAppPageSubTabId(
    {
      pathname: "/phone",
      tabs: [...PHONE_TABS],
      defaultTab: "logs",
      ariaLabel: "Phone sections",
      layoutIdPrefix: "phone-section",
    },
    legacyOutboundView ? "outbound" : tabParam,
  );
  const outboundView = resolveAppPageSecondaryTabId(
    { tabs: OUTBOUND_VIEW_TABS, defaultView: "dispatch" },
    searchParams.get("view") || legacyOutboundView,
  ) as (typeof OUTBOUND_VIEW_TABS)[number]["id"];

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

  return (
    <WorkspaceShell contentClassName="pt-0 pb-0" fullBleed>
      <WorkspacePageFrame
        mode="operate"
        className="flex min-h-0 flex-1 flex-col gap-0 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] lg:pb-4"
      >
        <WorkspaceOperateIntro
          title="Calls"
          tabs={
            <WorkspaceTabStrip
              tabs={[...PHONE_TABS]}
              activeId={primaryTab}
              onSelect={setPrimaryTab}
              ariaLabel="Phone sections"
              density="compact"
              align="start"
              className="mb-0 border-b-0 pb-0"
            />
          }
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {primaryTab === "logs" && <PhoneCallHistoryPanel />}
          {primaryTab === "outbound" && (
            <OutboundHub activeView={outboundView} onViewChange={setOutboundView} />
          )}
          {primaryTab === "appointments" && <AppointmentsPanel />}
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
