import AgentTemplates from "../components/AgentTemplates";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function TemplatesPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-10">
      <WorkspacePageFrame>
        <WorkspacePageIntro
          eyebrow="Workspace"
          title="Templates"
          description="Start from a proven agent recipe, then train and deploy in minutes."
        />
        <AgentTemplates />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
