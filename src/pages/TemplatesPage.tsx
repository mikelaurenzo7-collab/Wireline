import AgentTemplates from "../components/AgentTemplates";
import WorkspaceShell from "../components/WorkspaceShell";

export default function TemplatesPage() {
  return (
    <WorkspaceShell eyebrow="Workspace" title="Templates" contentClassName="pt-2 pb-8">
      <AgentTemplates />
    </WorkspaceShell>
  );
}
