import AgentTemplates from "../components/AgentTemplates";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function TemplatesPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame mode="standard">
        <WorkspacePageIntro title="Templates" />
        <AgentTemplates />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
