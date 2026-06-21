import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import IntegrationsWorkspace from "../components/IntegrationsWorkspace";

export default function IntegrationsPage() {
  const [params] = useSearchParams();
  const agentId = params.get("agent") || "";

  return (
    <WorkspaceShell
      eyebrow="Your accounts & tools"
      title="Connections"
      contentClassName="pt-5"
      action={
        <div className="flex items-center gap-3">
          <Link
            to={agentId ? `/studio?agent=${encodeURIComponent(agentId)}` : "/studio"}
            className="workspace-btn-secondary px-3 py-2.5 text-sm"
          >
            Back to Studio
          </Link>
          <Link to="/studio?create=1" className="workspace-btn-primary px-4 py-2.5 text-sm">
            <Plus size={15} />
            New assistant
          </Link>
        </div>
      }
    >
      <IntegrationsWorkspace />
    </WorkspaceShell>
  );
}
