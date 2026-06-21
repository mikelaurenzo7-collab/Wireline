import { Link, useSearchParams } from "react-router-dom";
import { WandSparkles } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import IntegrationsWorkspace from "../components/IntegrationsWorkspace";

export default function IntegrationsPage() {
  const [params] = useSearchParams();
  const agentId = params.get("agent") || "";
  return (
    <WorkspaceShell
      eyebrow="Build"
      title="Actions"
      contentClassName="pt-1"
      action={<Link to={agentId ? `/studio?agent=${encodeURIComponent(agentId)}` : "/studio"} className="workspace-btn-secondary px-3 py-2.5 text-sm"><WandSparkles size={15} />Studio</Link>}
    >
      <IntegrationsWorkspace />
    </WorkspaceShell>
  );
}
