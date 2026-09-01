import { ChevronDown, Inbox, Phone, Plus } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "../atoms/Button";
import { useStudioActiveAgentId } from "../../hooks/useStudioActiveAgentId";
import AgentPresenceSlot from "../AgentPresenceSlot";
import { buildAgentOptionLabels } from "../../lib/agent-option-labels";
import { agentLineStatus, agentReadinessLabel } from "../../lib/agent-readiness";
import { customerAgentLanguage } from "../../lib/product-copy";

export default function StudioContextChrome() {
  const { agents, resolvedId, phoneLookupDegraded } = useStudioActiveAgentId();
  const [, setSearchParams] = useSearchParams();
  const activeAgent = resolvedId ? (agents.find((agent) => agent.id === resolvedId) ?? null) : null;
  const lineStatus = activeAgent ? agentLineStatus(activeAgent, phoneLookupDegraded) : null;
  const readyLabel = activeAgent ? agentReadinessLabel(activeAgent, phoneLookupDegraded) : null;
  const optionLabels = useMemo(() => buildAgentOptionLabels(agents), [agents]);
  const language = customerAgentLanguage();

  function selectAgent(agentId: string) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("agent", agentId);
        next.delete("command");
        next.delete("commandNonce");
        return next;
      },
      { replace: true },
    );
  }

  return (
    <header
      className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/90"
      aria-label={`${language.singular} context`}
    >
      <div className="flex min-h-[56px] items-center justify-between gap-2 px-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {activeAgent ? null : (
            <span className="inline-flex shrink-0 font-[var(--wireline-font-mono)] text-[10px] uppercase tracking-[0.16em] text-primary">
              {language.navLabel}
            </span>
          )}
          {activeAgent ? (
            <>
              <span className="hidden shrink-0 sm:inline-flex">
                <AgentPresenceSlot
                  name={activeAgent.name}
                  agentId={activeAgent.id}
                  markKey={activeAgent.mark_key}
                  role={activeAgent.role}
                  isBusinessAgent={activeAgent.is_business_agent}
                  variant="badge"
                />
              </span>
              {agents.length > 1 ? (
                <>
                  <h1 className="sr-only">{activeAgent.name}</h1>
                  <label className="relative min-w-0 max-w-[13rem] flex-1 sm:max-w-[18rem] sm:flex-none">
                    <span className="sr-only">Active Bot</span>
                    <select
                      value={activeAgent.id}
                      onChange={(event) => selectAgent(event.target.value)}
                      aria-label="Switch Bot"
                      className="wl-preserve-case h-9 w-full appearance-none truncate rounded-lg border border-transparent bg-transparent pl-2 pr-8 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-muted/55 focus:border-border focus:bg-card"
                    >
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {optionLabels.get(agent.id) || agent.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </label>
                </>
              ) : (
                <h1 className="wl-preserve-case min-w-0 flex-1 truncate !whitespace-nowrap text-sm font-semibold text-foreground sm:max-w-[18rem] sm:flex-none">
                  {activeAgent.name}
                </h1>
              )}
            </>
          ) : (
            <h1 className="sr-only">{language.plural}</h1>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {activeAgent ? (
            <>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden size-9 px-0 lg:inline-flex"
                aria-label={`Open ${activeAgent.name} Inbox`}
              >
                <Link to={`/inbox?agent=${encodeURIComponent(activeAgent.id)}`}>
                  <Inbox className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="hidden size-9 px-0 lg:inline-flex"
                aria-label={`Open ${activeAgent.name} calls`}
              >
                <Link to={`/phone?agent=${encodeURIComponent(activeAgent.id)}`}>
                  <Phone className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            </>
          ) : null}
          {readyLabel ? (
            <span
              className={`hidden min-h-8 items-center rounded-md border px-2.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] md:inline-flex ${
                lineStatus === "live"
                  ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-foreground"
                  : "border-border bg-muted/50 text-muted-foreground"
              }`}
            >
              {readyLabel}
            </span>
          ) : null}
          {agents.length > 0 ? (
            <Button
              asChild
              variant="secondary"
              size="sm"
              className="size-9 px-0 sm:size-auto sm:px-3"
            >
              <Link to="/studio?create=1" aria-label={language.createCta}>
                <Plus className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">New</span>
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
