import AgentTemplates from "../components/AgentTemplates";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "../components/atoms";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";

export default function TemplatesPage() {
  return (
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame mode="standard">
        <WorkspacePageIntro
          title="Templates"
          action={
            <Button asChild size="sm">
              <Link to="/studio?create=1">
                <Plus size={14} aria-hidden="true" />
                Create Bot
              </Link>
            </Button>
          }
        />
        <AgentTemplates />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
