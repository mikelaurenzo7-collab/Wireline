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
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link to={studioHref}>
              <ArrowLeft aria-hidden="true" size={15} />
              Studio
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/studio?create=1">
              <Plus aria-hidden="true" size={15} />
              New assistant
            </Link>
          </Button>
        </div>
      }
    >
      <ActionsWorkspace />
    </WorkspaceShell>
  );
}
