import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
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
      contentClassName="pt-5"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Link to={studioHref} className="studio-secondary-button text-sm">
            <ArrowLeft size={15} />
            Studio
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
