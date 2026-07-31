import ComplianceCenter from "../components/ComplianceCenter";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import SettingsTabs from "../components/settings/SettingsTabs";
import WorkspaceShell from "../components/WorkspaceShell";

export default function ComplianceCenterPage() {
  return (
    <WorkspaceShell contentClassName="flex min-h-0 flex-1 flex-col pt-1 pb-8">
      <WorkspacePageFrame mode="standard" className="flex min-h-0 flex-1 flex-col">
        <SettingsTabs />
        {/* The selected Settings tab already reads "Compliance"; the heading is
            assistive-tech only. Without it the page outline started at h2. */}
        <WorkspacePageIntro title="Compliance" titleHidden />
        <ComplianceCenter />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
