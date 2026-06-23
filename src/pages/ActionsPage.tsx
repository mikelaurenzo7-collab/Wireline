import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import ActionsWorkspace from "../components/ActionsWorkspace";

export default function ActionsPage() {
  const [params] = useSearchParams();
  const agentId = params.get("agent") || "";

  return (
    <WorkspaceShell
      eyebrow="Full versatility"
      title="Connections"
      contentClassName="pt-5"
      action={
        <div className="flex items-center gap-3">
          <Link
            to={agentId ? `/studio?agent=${encodeURIComponent(agentId)}` : "/studio"}
            className="studio-secondary-button text-sm"
          >
            Back to Studio
          </Link>
          <Link to="/studio?create=1" className="studio-primary-button text-sm">
            <Plus size={15} />
            New assistant
          </Link>
        </div>
      }
    >
      <ActionsWorkspace />
    </WorkspaceShell>
  );
}
