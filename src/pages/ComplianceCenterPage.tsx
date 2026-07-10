import ComplianceCenter from "../components/ComplianceCenter";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import SettingsTabs from "../components/settings/SettingsTabs";
import WorkspaceShell from "../components/WorkspaceShell";

export default function ComplianceCenterPage() {
  return (
    <WorkspaceShell contentClassName="flex min-h-0 flex-1 flex-col pt-1 pb-8">
      <WorkspacePageFrame mode="narrow" className="flex min-h-0 flex-1 flex-col">
        <SettingsTabs />
        <ComplianceCenter />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
