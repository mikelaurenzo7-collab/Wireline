import WorkspaceControlBand from "../components/layout/WorkspaceControlBand";
import { WorkspaceOperateIntro, WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import InsightsView from "../components/insights/InsightsView";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";
import { useAppChromeTabs } from "../hooks/useAppChromeTabs";

export default function InsightsPage() {
  const { agents, loading, degraded } = useAgents();
  const chrome = useAppChromeTabs();
  const firstRun = !loading && agents.length === 0 && !degraded;
  const hasActivityTabs =
    !firstRun && !chrome.showAdminTabs && "ariaLabel" in chrome && chrome.tabs.length > 0;

  const controls = hasActivityTabs ? (
    <WorkspaceControlBand
      embedded
      ariaLabel="Insights controls"
      primary={
        <WorkspaceTabStrip
          ariaLabel={chrome.ariaLabel}
          tabs={chrome.tabs}
          activeId={chrome.activeId}
          onSelect={chrome.setActiveId}
          density="compact"
          align="start"
          mobileSelect
          className="mb-0 border-b-0 pb-0"
        />
      }
      secondary={
        chrome.secondary && chrome.secondary.tabs.length > 1 ? (
          <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="hidden sm:inline">View</span>
            <select
              value={chrome.secondary.activeId}
              onChange={(event) => chrome.secondary?.setActiveId(event.target.value)}
              aria-label="Insights view"
              className="h-11 max-w-[12rem] rounded-lg border border-border bg-card px-2 text-xs font-semibold sm:h-9 text-foreground outline-none focus:border-primary/50"
            >
              {chrome.secondary.tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label}
                </option>
              ))}
            </select>
          </label>
        ) : undefined
      }
    />
  ) : undefined;

  return (
    <WorkspaceShell contentClassName="pt-0 pb-0" fullBleed>
      <WorkspacePageFrame
        mode="operate"
        className="flex min-h-0 flex-1 flex-col gap-0 pb-5 lg:pb-6"
      >
        <WorkspaceOperateIntro title="Insights" titleHidden tabs={controls} />
        <div className="flex flex-col md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain">
          <InsightsView />
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
