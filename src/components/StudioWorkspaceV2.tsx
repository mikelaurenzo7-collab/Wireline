import { Link, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useAgents } from "../contexts/AgentsContext";
import { PRODUCT_POSTURE, PRODUCT_VERSATILITY } from "../lib/product-copy";
import AgentWorkspace from "./AgentWorkspace";

function StudioEmptyState() {
  return (
    <main className="grid min-h-[60vh] place-items-center bg-background px-6 text-center">
      <div className="max-w-md">
        <p className="studio-kicker">{PRODUCT_VERSATILITY.eyebrow}</p>
        <h1 className="mt-2 font-[var(--wl-font-display)] text-2xl font-semibold tracking-[-0.03em] text-foreground">
          Create a personal assistant or business agent
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {PRODUCT_VERSATILITY.tagline} Open Studio with one clear brief, then add knowledge and
          connections as the job grows.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link to="/studio?create=1" className="studio-primary-button text-sm">
            <Plus size={16} />
            {PRODUCT_POSTURE.personal.createCta}
          </Link>
          <Link to="/studio?create=1&posture=business" className="studio-secondary-button text-sm">
            {PRODUCT_POSTURE.business.createCta}
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function StudioWorkspaceV2() {
  const { agents, loading } = useAgents();
  const [params] = useSearchParams();
  const requestedId = params.get("agent");
  const active = agents.find((agent) => agent.id === requestedId) || agents[0];

  if (loading) {
    return (
      <main className="grid min-h-[60vh] place-items-center bg-background px-6 text-sm text-muted-foreground">
        Loading studio…
      </main>
    );
  }

  if (!active) {
    return <StudioEmptyState />;
  }

  return <AgentWorkspace agentId={active.id} agentName={active.name} />;
}
