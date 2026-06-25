import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "../components/atoms";
import WorkspaceShell from "../components/WorkspaceShell";
import ActionsWorkspace from "../components/ActionsWorkspace";

export default function ActionsPage() {
  const [params] = useSearchParams();
  const agentId = params.get("agent") || "";
  const studioHref = agentId ? `/studio?agent=${encodeURIComponent(agentId)}` : "/studio";

  return (
    <WorkspaceShell
      eyebrow="Workspace"
      title="Connections"
      contentClassName="py-6"
      action={
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <Button asChild variant="secondary" size="sm" className="shrink-0">
            <Link to={studioHref} aria-label="Back to Studio">
              <ArrowLeft aria-hidden="true" size={15} />
              <span className="hidden sm:inline">Studio</span>
            </Link>
          </Button>
          <Button asChild size="sm" className="min-w-0">
            <Link to="/studio?create=1">
              <Plus aria-hidden="true" size={15} />
              <span className="truncate">New assistant</span>
            </Link>
          </Button>
        </div>
      }
    >
      <ActionsWorkspace />
    </WorkspaceShell>
  );
}
