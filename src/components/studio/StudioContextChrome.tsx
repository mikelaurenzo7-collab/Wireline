import { ArrowRight, Plus, Zap } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

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
      aria-label="Agent Studio controls"
    >
      <div className="flex min-h-[58px] items-center justify-between gap-4 px-3 sm:px-5">
        <div className="min-w-0">
          <nav
            aria-label="Studio breadcrumb"
            className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground"
          >
            <Link
              to="/overview"
              className="hidden shrink-0 transition-colors hover:text-foreground sm:inline"
            >
              ← Dashboard
            </Link>
            <span aria-hidden="true" className="hidden opacity-45 sm:inline">
              /
            </span>
            <Link
              to="/studio"
              className="shrink-0 font-[var(--wireline-font-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--wireline-color-action-primary-default)] transition-colors hover:text-foreground"
            >
              Agent Studio
            </Link>
            {activeAgent ? (
              <>
                <span aria-hidden="true" className="opacity-45">
                  /
                </span>
                <span className="truncate font-semibold text-foreground inline-flex items-center gap-2">
                  <AgentPresenceSlot
                    name={activeAgent.name}
                    agentId={activeAgent.id}
                    role={activeAgent.role}
                    isBusinessAgent={activeAgent.is_business_agent}
                    variant="badge"
                  />
                  {activeAgent.name}
                </span>
              </>
            ) : null}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {readyLabel ? (
            <span className="hidden min-h-[36px] items-center rounded-lg border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] px-3 font-[var(--wireline-font-mono)] text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--wireline-color-action-primary-default)] sm:inline-flex">
              • {readyLabel}
            </span>
          ) : null}
          {activeAgent ? (
            <>
              <Link
                to={`/knowledge?agent=${encodeURIComponent(activeAgent.id)}&tab=simulator`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 sm:px-4 sm:text-sm"
              >
                Run test call
              </Link>
              <Link
                to={workspaceView ? studioHref(activeAgent) : studioHref(activeAgent, "workspace")}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-[var(--wireline-elevation-sm)] transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 sm:px-4 sm:text-sm"
              >
                {workspaceView ? "Canvas" : "Deploy"}
                <ArrowRight className="hidden size-3.5 sm:block" aria-hidden="true" />
              </Link>
            </>
          ) : (
            <Link
              to="/studio?create=1"
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-[var(--wireline-elevation-sm)] transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 sm:px-4 sm:text-sm"
            >
              <Zap size={14} aria-hidden="true" />
              <span className="hidden sm:inline">New agent</span>
              <Plus className="size-4 sm:hidden" aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
