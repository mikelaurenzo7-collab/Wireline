import { ChevronDown, Plus, SlidersHorizontal } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "../atoms/Button";
import WorkspaceSectionNav from "../layout/WorkspaceSectionNav";
import { useStudioActiveAgentId } from "../../hooks/useStudioActiveAgentId";
import { buildAgentOptionLabels } from "../../lib/agent-option-labels";
import { agentLineStatus, agentReadinessLabel } from "../../lib/agent-readiness";
import { customerAgentLanguage } from "../../lib/product-copy";
import {
  clearStudioInspectorSectionParams,
  setStudioInspectorSectionParams,
} from "../../lib/studio-route-state";

export default function StudioContextChrome() {
  const { agents, requestedId, resolvedId, phoneLookupDegraded } = useStudioActiveAgentId();
  const [searchParams, setSearchParams] = useSearchParams();
  const inspectorOpen = ["setup", "review"].includes(searchParams.get("section") || "");
  const activeAgentId = requestedId?.trim() || resolvedId;
  const activeAgent = activeAgentId
    ? (agents.find((agent) => agent.id === activeAgentId) ?? null)
    : null;
  const lineStatus = activeAgent ? agentLineStatus(activeAgent, phoneLookupDegraded) : null;
  const readyLabel = activeAgent ? agentReadinessLabel(activeAgent, phoneLookupDegraded) : null;
  const optionLabels = useMemo(() => buildAgentOptionLabels(agents), [agents]);
  const language = customerAgentLanguage();

  function selectAgent(agentId: string) {
    setSearchParams(
      () => {
        // A Bot switch can immediately follow a Conversation/Browser change.
        // Merge the current URL, not a previous render's panel preference.
        const next = new URLSearchParams(window.location.search);
        next.set("agent", agentId);
        next.delete("command");
        next.delete("commandNonce");
        return next;
      },
      { replace: true },
    );
  }

  return (
    <header className="wl-studio-context shrink-0" aria-label={`${language.singular} context`}>
      <div className="wl-studio-context-row flex min-h-[56px] flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-5">
        <div className="flex min-w-0 flex-[1_1_10rem] items-center gap-2.5 md:max-w-[18rem] md:flex-none">
          {activeAgent ? null : (
            <span className="inline-flex shrink-0 font-[var(--wireline-font-mono)] text-[10px] uppercase tracking-[0.16em] text-primary">
              {language.navLabel}
            </span>
          )}
          {activeAgent ? (
            <>
              {agents.length > 1 ? (
                <>
                  <h1 className="sr-only">{activeAgent.name}</h1>
                  <label className="relative min-w-0 max-w-[13rem] flex-1 sm:max-w-[18rem] sm:flex-none">
                    <span className="sr-only">Active Bot</span>
                    <select
                      value={activeAgent.id}
                      onChange={(event) => selectAgent(event.target.value)}
                      aria-label="Switch Bot"
                      className="wl-studio-bot-switch wl-preserve-case w-full appearance-none truncate pl-2 pr-8 text-base font-semibold text-foreground sm:text-sm"
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

        {activeAgent ? (
          <div className="order-3 w-full min-w-0 md:order-none md:w-auto md:flex-1">
            <WorkspaceSectionNav />
          </div>
        ) : null}

        <div className="flex max-w-full flex-wrap items-center gap-1">
          {activeAgent ? (
            <Button
              id="studio-settings-toggle"
              type="button"
              variant={inspectorOpen ? "secondary" : "ghost"}
              size="sm"
              className="min-h-[44px] px-2.5"
              aria-label="Set Up Bot"
              aria-expanded={inspectorOpen}
              aria-controls={inspectorOpen ? "studio-inspector" : undefined}
              onClick={() =>
                setSearchParams(
                  (current) =>
                    inspectorOpen
                      ? clearStudioInspectorSectionParams(current)
                      : setStudioInspectorSectionParams(current, "setup"),
                  { replace: true },
                )
              }
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Set Up
            </Button>
          ) : null}
          {readyLabel ? (
            // Status, not a control: quiet text with a state dot, so it never
            // reads as a third, disabled button between the real ones.
            <span
              className={`hidden items-center gap-1.5 px-2 text-xs font-medium md:inline-flex ${
                lineStatus === "live" ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${
                  lineStatus === "live" ? "bg-[var(--wireline-color-status-success)]" : "bg-current"
                }`}
              />
              {readyLabel}
            </span>
          ) : null}
          {agents.length > 0 ? (
            <Button
              asChild
              variant="secondary"
              size="sm"
              className="min-h-11 min-w-11 px-0 sm:w-auto sm:px-3"
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
