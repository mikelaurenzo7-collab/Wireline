import { Link, useSearchParams } from "react-router-dom";
import { WandSparkles } from "lucide-react";
import WorkspaceShell from "../components/WorkspaceShell";
import IntegrationsWorkspace from "../components/IntegrationsWorkspace";

export default function IntegrationsPage() {
  const [params] = useSearchParams();
  const agentId = params.get("agent") || "";
  return <WorkspaceShell eyebrow="Build" title="Integrations" contentClassName="pt-3" action={<Link to={agentId ? `/studio?agent=${encodeURIComponent(agentId)}` : "/studio"} className="inline-flex items-center gap-2 rounded-xl bg-[#1d1d1f] px-3 py-2.5 text-sm font-semibold text-white"><WandSparkles size={15} />Studio</Link>}><IntegrationsWorkspace /></WorkspaceShell>;
}
