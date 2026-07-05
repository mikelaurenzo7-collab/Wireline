import CrmConnectionCard from "../components/CrmConnectionCard";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function ConnectionsPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame>
        <WorkspacePageIntro
          eyebrow="Integrations"
          title="Connections"
          description="Wire CRMs, calendars, and notification channels so your agents can act on live work."
        />
        <CrmConnectionCard />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
