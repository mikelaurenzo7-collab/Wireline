import AppChromeSubTabs from "../components/layout/AppChromeSubTabs";
import { WorkspaceOperateIntro, WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import InsightsView from "../components/insights/InsightsView";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";

export default function InsightsPage() {
  const { agents, loading, degraded } = useAgents();
  const firstRun = !loading && agents.length === 0 && !degraded;

  return (
    <WorkspaceShell contentClassName="pt-0 pb-0" fullBleed>
      <WorkspacePageFrame
        mode="operate"
        className="flex min-h-0 flex-1 flex-col gap-0 pb-5 lg:pb-6"
      >
        <WorkspaceOperateIntro
          title="Activity"
          titleHidden
          tabs={firstRun ? undefined : <AppChromeSubTabs density="compact" />}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          <InsightsView />
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
