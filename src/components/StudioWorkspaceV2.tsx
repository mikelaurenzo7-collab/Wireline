import { BriefcaseBusiness, Plus, Sparkles } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { Button, EmptyState, Skeleton } from "../components/atoms";
import { useAgents } from "../contexts/AgentsContext";
import { PRODUCT_POSTURE } from "../lib/product-copy";
import StudioOverview from "./StudioOverview";
import StudioWorkroom from "./StudioWorkroom";

function StudioLoadingState() {
  return (
    <main
      className="grid min-h-[55vh] place-items-center bg-background px-4 sm:px-6 safe-area-insets"
      aria-busy="true"
      aria-label="Loading Studio"
    >
      <div className="w-full max-w-5xl space-y-4">
        <Skeleton shape="text" className="h-3 w-20" />
        <Skeleton shape="text" className="h-8 w-80 max-w-full" />
        <Skeleton shape="text" className="h-3 w-64" />
        <div className="pt-3">
          <Skeleton shape="surface" className="h-[280px] w-full rounded-[var(--radius-xl)]" />
        </div>
        <div className="flex gap-2 pt-1">
          <Skeleton shape="text" className="h-8 w-28 rounded-full" />
          <Skeleton shape="text" className="h-8 w-28 rounded-full" />
        </div>
      </div>
    </main>
  );
}

function StudioEmptyState() {
  return (
    <main className="grid min-h-[55vh] place-items-center bg-background px-4 py-6 sm:px-6 sm:py-8 safe-area-insets">
      <EmptyState
        density="default"
        className="studio-card w-full max-w-xl px-8 py-10 text-center"
        icon={<Sparkles size={28} strokeWidth={1.6} />}
        title="Forge one."
        description="Name. Voice. Direct."
        action={
          <div className="flex flex-wrap gap-3 pt-1 justify-center">
            <Button asChild>
              <Link to="/studio?create=1">
                <Plus aria-hidden="true" size={15} />
                {PRODUCT_POSTURE.personal.createCta}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/studio?create=1&posture=business">
                <BriefcaseBusiness aria-hidden="true" size={15} />
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
  const { agents, loading, degraded } = useAgents();
  const [params, setParams] = useSearchParams();
  const requestedId = params.get("agent");
  const active = agents.find((agent) => agent.id === requestedId) || agents[0];
  const mode = params.get("mode");
  const isWorkroom = mode === "workroom" || mode === "assistant";

  function selectAgent(agentId: string) {
    const next = new URLSearchParams(params);
    next.set("agent", agentId);
    next.delete("mode");
    next.delete("tab");
    next.delete("sub");
    next.delete("command");
    next.delete("commandNonce");
    setParams(next, { replace: true });
  }

  function openAssistant(agentId: string, command?: string) {
    const next = new URLSearchParams();
    next.set("agent", agentId);
    next.set("mode", "workroom");
    if (command?.trim()) {
      next.set("command", command.trim());
      next.set("commandNonce", String(Date.now()));
    }
    setParams(next);
  }

  function returnToOverview() {
    if (!active) return;
    setParams(new URLSearchParams({ agent: active.id }));
  }

  function openCreate() {
    setParams(new URLSearchParams({ create: "1" }));
  }

  if (loading) return <StudioLoadingState />;
  if (!active) return <StudioEmptyState />;

  if (isWorkroom) {
    return (
      <div className="wl-studio-operations h-full min-h-0 overflow-hidden">
        {/* Seamless context: agent + command passed from Overview/StudioOverview */}
        <StudioWorkroom
          agentId={active.id}
          agentName={active.name}
          initialCommand={params.get("command") || undefined}
          onBack={returnToOverview}
        />
      </div>
    );
  }

  return (
    <div className="wl-studio-operations h-full min-h-0 overflow-hidden">
      <StudioOverview
        active={active}
        agents={agents}
        degraded={degraded}
        onSelect={selectAgent}
        onOpen={openAssistant}
        onCreate={openCreate}
      />
    </div>
  );
}
