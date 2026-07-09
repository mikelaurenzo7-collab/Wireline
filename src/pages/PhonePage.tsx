import { useSearchParams, Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import PhoneCallHistoryPanel from "../components/PhoneCallHistoryPanel";
import OutboundHub from "../components/outbound/OutboundHub";
import { EmptyState, Button } from "../components/atoms";
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
  { id: "appointments", label: "Appts" },
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
      <WorkspacePageFrame mode="operate" className="flex min-h-0 flex-1 flex-col gap-0 pb-0">
        <WorkspaceOperateIntro
          title="Phone"
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
        <div className="flex min-h-0 flex-1 flex-col overflow-visible">
          {primaryTab === "logs" && <PhoneCallHistoryPanel />}
          {primaryTab === "outbound" && (
            <OutboundHub activeView={outboundView} onViewChange={setOutboundView} />
          )}
          {primaryTab === "appointments" && (
            <div className="flex w-full flex-col items-center px-4 py-8 sm:px-6">
              <EmptyState
                framed
                density="compact"
                titleTone="ui"
                withHalo={false}
                className="w-full max-w-lg"
                icon={<CalendarDays className="size-5" aria-hidden />}
                title="Appointments sync through calendar connections"
                description="Connect Google Workspace or Microsoft 365 from Connections to let agents book on live calls."
                action={
                  <Button asChild>
                    <Link to="/connections">Open Connections</Link>
                  </Button>
                }
              />
            </div>
          )}
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
