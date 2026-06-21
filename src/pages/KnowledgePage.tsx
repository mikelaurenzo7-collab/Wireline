import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import KnowledgeWorkspace from "../components/KnowledgeWorkspace";

export default function KnowledgePage() {
  const [params] = useSearchParams();
  const agentId = params.get("agent") || "";
  return <WorkspaceShell eyebrow="Build" title="Knowledge" contentClassName="pt-3" action={<Link to={agentId ? `/studio?agent=${encodeURIComponent(agentId)}` : "/studio"} className="inline-flex items-center gap-2 rounded-xl border border-black/[.1] bg-white px-3 py-2.5 text-sm font-semibold">Studio <ArrowUpRight size={14} /></Link>}><KnowledgeWorkspace /></WorkspaceShell>;
}
