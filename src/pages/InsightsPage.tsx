import AppChromeSubTabs from "../components/layout/AppChromeSubTabs";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import InsightsView from "../components/insights/InsightsView";
import WorkspaceShell from "../components/WorkspaceShell";

export default function InsightsPage() {
  return (
    <WorkspaceShell contentClassName="pt-0 pb-0" fullBleed>
      <WorkspacePageFrame className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-4 pt-4 sm:px-6">
          <AppChromeSubTabs density="compact" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-6 sm:px-6">
          <InsightsView />
        </div>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
