import { Link, useSearchParams } from "react-router-dom";
import { BriefcaseBusiness, Plus, Sparkles } from "lucide-react";

import { Button, EmptyState, Skeleton } from "../components/atoms";
import { useAgents } from "../contexts/AgentsContext";
import { PRODUCT_POSTURE, PRODUCT_VERSATILITY } from "../lib/product-copy";
import AgentWorkspace from "./AgentWorkspace";

function StudioLoadingState() {
  return (
    <main className="grid min-h-[60vh] place-items-center bg-background px-6" aria-busy="true" aria-label="Loading Studio">
      <div className="w-full max-w-3xl space-y-4">
        <Skeleton shape="text" className="h-4 w-36" />
        <Skeleton shape="text" className="h-8 w-80 max-w-full" />
        <Skeleton shape="text" className="h-4 w-full max-w-2xl" />
        <Skeleton shape="surface" className="h-[260px] w-full" />
      </div>
    </main>
  );
}

function StudioEmptyState() {
  return (
    <main className="grid min-h-[60vh] place-items-center bg-background px-6 py-10">
      <EmptyState
        density="default"
        className="studio-card w-full max-w-2xl px-8 py-12 text-center"
        icon={<Sparkles size={30} strokeWidth={1.7} />}
        title="Create a personal assistant or business agent"
        description={`${PRODUCT_VERSATILITY.tagline} Open Studio with one clear brief, then add knowledge and connections as the job grows.`}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link to="/studio?create=1">
                <Plus aria-hidden="true" size={16} />
                {PRODUCT_POSTURE.personal.createCta}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/studio?create=1&posture=business">
                <BriefcaseBusiness aria-hidden="true" size={16} />
                {PRODUCT_POSTURE.business.createCta}
              </Link>
            </Button>
          </div>
        }
      />
    </main>
  );
}

export default function StudioWorkspaceV2() {
  const { agents, loading } = useAgents();
  const [params] = useSearchParams();
  const requestedId = params.get("agent");
  const active = agents.find((agent) => agent.id === requestedId) || agents[0];

  if (loading) return <StudioLoadingState />;
  if (!active) return <StudioEmptyState />;

  return <AgentWorkspace agentId={active.id} agentName={active.name} />;
}
