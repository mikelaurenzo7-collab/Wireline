import { Plus } from "lucide-react";
import { Link } from "react-router";

import { Button } from "../atoms/Button";
import { useStudioActiveAgentId } from "../../hooks/useStudioActiveAgentId";
import { useAccount } from "../../contexts/AccountContext";
import type { WorkspaceAgentSummary } from "../../contexts/AgentsContext";
import AgentPresenceSlot from "../AgentPresenceSlot";
import { customerAgentLanguage } from "../../lib/product-copy";

function readiness(agent: WorkspaceAgentSummary | null) {
  if (!agent) return null;
  return agent.phone_number ? "Live" : "Needs setup";
}

export default function StudioContextChrome() {
  const { agents, resolvedId } = useStudioActiveAgentId();
  const { accountType } = useAccount();
  const activeAgent = resolvedId ? (agents.find((agent) => agent.id === resolvedId) ?? null) : null;
  const readyLabel = readiness(activeAgent);
  const posture = activeAgent
    ? activeAgent.is_business_agent
      ? "business"
      : "personal"
    : accountType;
  const language = customerAgentLanguage(posture);

  return (
    <header
      className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
      aria-label={`${language.singular} context`}
    >
      <div className="flex min-h-[56px] items-center justify-between gap-3 px-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className={`shrink-0 font-[var(--wireline-font-mono)] text-[10px] uppercase tracking-[0.16em] text-primary ${
              activeAgent ? "hidden sm:inline-flex" : "inline-flex"
            }`}
          >
            {language.navLabel}
          </span>
          {activeAgent ? (
            <>
              <span aria-hidden="true" className="hidden text-muted-foreground/40 sm:inline">
                /
              </span>
              <span className="hidden shrink-0 sm:inline-flex">
                <AgentPresenceSlot
                  name={activeAgent.name}
                  agentId={activeAgent.id}
                  role={activeAgent.role}
                  isBusinessAgent={activeAgent.is_business_agent}
                  variant="badge"
                />
              </span>
              <h1 className="wl-preserve-case min-w-0 flex-1 truncate !whitespace-nowrap text-sm font-semibold text-foreground sm:max-w-[18rem] sm:flex-none">
                {activeAgent.name}
              </h1>
            </>
          ) : (
            <h1 className="sr-only">{language.plural}</h1>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {readyLabel ? (
            <span
              className={`inline-flex min-h-8 items-center rounded-md border px-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] sm:px-3 ${
                activeAgent?.phone_number
                  ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-foreground"
                  : "border-border bg-muted/50 text-muted-foreground"
              }`}
            >
              {readyLabel}
            </span>
          ) : null}
          {agents.length > 0 ? (
            <Button asChild variant="secondary" size="sm">
              <Link to="/studio?create=1">
                <Plus className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{language.createCta}</span>
                <span className="sm:hidden">New</span>
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
