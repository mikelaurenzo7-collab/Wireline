import LegacyConnectionGrants from "../components/LegacyConnectionGrants";
import MailboxConnectionCard from "../components/MailboxConnectionCard";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import { Button } from "../components/atoms";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";

export default function ConnectionsPage() {
  const { resolvedId } = useStudioActiveAgentId();
  return (
    <WorkspaceShell contentClassName="pt-1 pb-6">
      <WorkspacePageFrame mode="standard" className="gap-3">
        <WorkspacePageIntro
          title="Connections"
          action={
            resolvedId ? (
              <Button asChild variant="secondary" size="sm">
                <Link to={`/studio?agent=${encodeURIComponent(resolvedId)}&section=review`}>
                  Bot Phone &amp; Email
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : undefined
          }
        />

        <MailboxConnectionCard />

        <LegacyConnectionGrants />
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
