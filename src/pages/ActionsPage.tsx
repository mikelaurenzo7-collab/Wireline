import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "../components/atoms";
import WorkspaceShell from "../components/WorkspaceShell";
import ActionsWorkspace from "../components/ActionsWorkspace";

export default function ActionsPage() {
  return (
    <WorkspaceShell
      eyebrow="Workspace"
      title="Wire"
      contentClassName="pt-1 pb-8"
      action={
        <Button asChild size="sm" className="min-w-0">
          <Link to="/studio?create=1">
            <Plus aria-hidden="true" size={15} />
            <span className="truncate">New agent</span>
          </Link>
        </Button>
      }
    >
      <ActionsWorkspace />
    </WorkspaceShell>
  );
}
