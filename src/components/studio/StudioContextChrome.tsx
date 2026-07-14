import { ArrowRight, Plus, Zap } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { Button } from "../atoms/Button";
import { useStudioActiveAgentId } from "../../hooks/useStudioActiveAgentId";
import type { WorkspaceAgentSummary } from "../../contexts/AgentsContext";
import AgentPresenceSlot from "../AgentPresenceSlot";

function studioHref(agent: WorkspaceAgentSummary, suffix?: string) {
  const query = new URLSearchParams({ agent: agent.id });
  if (suffix) query.set("view", suffix);
  return `/studio?${query.toString()}`;
}

function readiness(agent: WorkspaceAgentSummary | null) {
  if (!agent) return null;
  return agent.phone_number ? "Active" : "Training";
}

export default function StudioContextChrome() {
  const [params] = useSearchParams();
  const { agents, resolvedId } = useStudioActiveAgentId();
  const workspaceView = params.get("view") === "workspace";
  const activeAgent = resolvedId ? (agents.find((agent) => agent.id === resolvedId) ?? null) : null;
  const readyLabel = readiness(activeAgent);

  return (
    <header
      className="wl-studio-context-chrome shrink-0 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
      aria-label="Studio context"
    >
      <div className="flex min-h-[52px] items-center justify-between gap-2 px-3 sm:gap-3 sm:px-5">
        <div className="min-w-0 flex items-center gap-2 sm:gap-2.5">
          <span className="shrink-0 font-[var(--wireline-font-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--wireline-color-action-primary-default)]">
            Studio
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
            <h1 className="sr-only">Studio</h1>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {readyLabel ? (
            <span className="hidden min-h-[36px] items-center rounded-lg border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] px-3 font-[var(--wireline-font-mono)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--wireline-color-action-primary-default)] sm:inline-flex">
              • {readyLabel}
            </span>
          ) : null}
          {activeAgent ? (
            <>
              <Button asChild variant="secondary" size="sm">
                <Link to={`/knowledge?agent=${encodeURIComponent(activeAgent.id)}&tab=simulator`}>
                  <span className="sm:hidden">Test</span>
                  <span className="hidden sm:inline">Run test call</span>
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link
                  to={
                    workspaceView ? studioHref(activeAgent) : studioHref(activeAgent, "workspace")
                  }
                >
                  {workspaceView ? "Canvas" : "Deploy"}
                  <ArrowRight className="hidden size-3.5 sm:block" aria-hidden="true" />
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/studio?create=1">
                <Zap size={14} aria-hidden="true" />
                <span className="hidden sm:inline">New agent</span>
                <Plus className="size-4 sm:hidden" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
