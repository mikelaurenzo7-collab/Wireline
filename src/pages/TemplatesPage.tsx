import AgentTemplates from "../components/AgentTemplates";
import { Link } from "react-router";
import { Plus } from "lucide-react";
import { Button } from "../components/atoms";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import { useAgents } from "../contexts/AgentsContext";
import { canOfferAnotherBot } from "../lib/bot-roster-policy";

export default function TemplatesPage() {
  const { agents, loading, degraded } = useAgents();
  // A single-Bot workspace adds a template's tasks to its Bot instead.
  const offerAnotherBot = loading || degraded || canOfferAnotherBot(agents.length);
  return (
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame mode="standard">
        <WorkspacePageIntro
          title="Templates"
          action={
            offerAnotherBot ? (
              <Button asChild size="sm">
                <Link to="/studio?create=1">
                  <Plus size={14} aria-hidden="true" />
                  Create Bot
                </Link>
              </Button>
            ) : undefined
          }
        />
        <AgentTemplates />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
