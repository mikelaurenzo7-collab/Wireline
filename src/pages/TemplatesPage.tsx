import AgentTemplates from "../components/AgentTemplates";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function TemplatesPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame mode="standard">
        <WorkspacePageIntro
          title="Bot Templates"
          description="Start with an employee role, then configure the voice, channels, knowledge, tools, rules, and handoffs for the job."
        />
        <AgentTemplates />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
