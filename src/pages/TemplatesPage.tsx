import AgentTemplates from "../components/AgentTemplates";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function TemplatesPage() {
  return (
    <WorkspaceShell
      eyebrow="Workspace"
      title="Templates"
      description="Start from a proven agent playbook — personal errands, front desk, sales, and support."
      contentClassName="pt-1 pb-10"
    >
      <WorkspacePageFrame>
        <AgentTemplates />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
