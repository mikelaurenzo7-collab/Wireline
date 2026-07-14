import { PhoneCall, Play, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../atoms/Button";
import { useStudioActiveAgentId } from "../../hooks/useStudioActiveAgentId";
import type { WorkspaceAgentSummary } from "../../contexts/AgentsContext";
import AgentPresenceSlot from "../AgentPresenceSlot";

function employeeHref(agent: WorkspaceAgentSummary, section: "setup" | "test" | "overview") {
  const query = new URLSearchParams({ agent: agent.id, section });
  return `/studio?${query.toString()}`;
}

function readiness(agent: WorkspaceAgentSummary | null) {
  if (!agent) return null;
  return agent.phone_number ? "Live" : "Setup";
}

export default function StudioContextChrome() {
  const { agents, resolvedId } = useStudioActiveAgentId();
  const activeAgent = resolvedId ? (agents.find((agent) => agent.id === resolvedId) ?? null) : null;
  const readyLabel = readiness(activeAgent);

  return (
    <header
      className="wl-studio-context-chrome shrink-0 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
      aria-label="AI employee context"
    >
      <div className="flex min-h-[56px] items-center justify-between gap-2 px-3 sm:gap-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <span className="shrink-0 font-[var(--wireline-font-mono)] text-[10px] uppercase tracking-[0.16em] text-primary">
            AI Employee
          </span>
          {activeAgent ? (
            <>
              <span aria-hidden="true" className="text-muted-foreground/50">
                /
              </span>
              <div className="inline-flex min-w-0 items-center gap-2 font-semibold text-foreground">
                <span className="hidden shrink-0 sm:inline-flex">
                  <AgentPresenceSlot
                    name={activeAgent.name}
                    agentId={activeAgent.id}
                    role={activeAgent.role}
                    isBusinessAgent={activeAgent.is_business_agent}
                    variant="badge"
                  />
                </span>
                <h1 className="block max-w-[9rem] truncate text-sm font-semibold sm:max-w-[14rem]">
                  {activeAgent.name}
                </h1>
              </div>
            </>
          ) : (
            <h1 className="sr-only">AI employees</h1>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {readyLabel ? (
            <span className="hidden min-h-9 items-center rounded-lg border border-border bg-muted/50 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:inline-flex">
              {readyLabel}
            </span>
          ) : null}
          {activeAgent ? (
            <>
              <Button asChild variant="secondary" size="sm">
                <Link to={employeeHref(activeAgent, "test")}>
                  <Play className="size-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Test employee</span>
                  <span className="sm:hidden">Test</span>
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/settings/phone">
                  <PhoneCall className="size-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Connect calls</span>
                  <span className="sm:hidden">Connect</span>
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/studio?create=1">
                <Plus className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">New AI employee</span>
                <span className="sm:hidden">New</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
