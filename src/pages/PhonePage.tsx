import { useSearchParams, Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import CallLogsClaude from "../components/CallLogsClaude";
import OutboundHub from "../components/outbound/OutboundHub";
import { EmptyState, Button } from "../components/atoms";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import {
  OUTBOUND_VIEW_TABS,
  resolveAppPageSecondaryTabId,
  resolveAppPageSubTabId,
} from "../lib/page-sub-tabs";

const PHONE_TABS = [
  { id: "logs", label: "Call History" },
  { id: "outbound", label: "Outbound" },
  { id: "appointments", label: "Appointments" },
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
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border px-4 py-2">
          <WorkspaceTabStrip
            tabs={[...PHONE_TABS]}
            activeId={primaryTab}
            onSelect={setPrimaryTab}
            ariaLabel="Phone sections"
            density="compact"
            align="start"
            className="mb-0 border-b-0 pb-0"
          />
        </div>
        <div className="flex-1 min-h-0 overflow-hidden">
          {primaryTab === "logs" && <CallLogsClaude />}
          {primaryTab === "outbound" && (
            <OutboundHub activeView={outboundView} onViewChange={setOutboundView} />
          )}
          {primaryTab === "appointments" && (
            <div className="grid flex-1 place-items-center px-6 py-10">
              <EmptyState
                className="studio-card w-full max-w-lg px-6 py-10 text-center"
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
      </div>
    </WorkspaceShell>
  );
}
