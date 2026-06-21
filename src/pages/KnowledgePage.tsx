import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import KnowledgeWorkspace from "../components/KnowledgeWorkspace";

export default function KnowledgePage() {
  const [params] = useSearchParams();
  const agentId = params.get("agent") || "";
  return (
    <WorkspaceShell
      eyebrow="Build"
      title="Knowledge"
      contentClassName="pt-1"
      action={<Link to={agentId ? `/studio?agent=${encodeURIComponent(agentId)}` : "/studio"} className="workspace-btn-secondary px-3 py-2.5 text-sm">Studio <ArrowUpRight size={14} /></Link>}
    >
      <KnowledgeWorkspace />
    </WorkspaceShell>
  );
}
