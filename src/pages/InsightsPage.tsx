import AppChromeSubTabs from "../components/layout/AppChromeSubTabs";
import { WorkspaceOperateIntro, WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import InsightsView from "../components/insights/InsightsView";
import WorkspaceShell from "../components/WorkspaceShell";

export default function InsightsPage() {
  return (
    <WorkspaceShell contentClassName="pt-0 pb-0" fullBleed>
      <WorkspacePageFrame mode="operate" className="flex min-h-0 flex-1 flex-col gap-0 pb-6">
        <WorkspaceOperateIntro title="Activity" tabs={<AppChromeSubTabs density="compact" />} />
        <div className="flex min-h-0 flex-1 flex-col">
          <InsightsView />
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
