import ComplianceCenter from "../components/ComplianceCenter";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function ComplianceCenterPage() {
  return (
    <WorkspaceShell contentClassName="flex min-h-0 flex-1 flex-col pt-1 pb-8">
      <WorkspacePageFrame narrow className="flex min-h-0 flex-1 flex-col">
        <WorkspacePageIntro align="start" title="Compliance" />
        <ComplianceCenter />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
