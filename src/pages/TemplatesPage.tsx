import AgentTemplates from "../components/AgentTemplates";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function TemplatesPage() {
  return (
    <WorkspaceShell title="Templates" contentClassName="pt-1 pb-10">
      <WorkspacePageFrame>
        <AgentTemplates />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
