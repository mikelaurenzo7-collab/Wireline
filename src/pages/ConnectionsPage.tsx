import CrmConnectionCard from "../components/CrmConnectionCard";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function ConnectionsPage() {
  return (
    <WorkspaceShell
      title="Connections"
      description="Connect CRM, calendar, commerce, and team tools once — every agent in your workspace can use them on live calls, texts, and follow-up."
      eyebrow="Workspace"
      contentClassName="pt-1 pb-10"
    >
      <WorkspacePageFrame>
        <CrmConnectionCard />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
