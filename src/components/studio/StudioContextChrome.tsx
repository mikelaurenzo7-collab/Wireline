import { ChevronDown, Plus, SlidersHorizontal, Users } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";

import { Button } from "../atoms/Button";
import BotMark from "../BotMark";
import { useAgents } from "../../contexts/AgentsContext";
import { useStudioActiveAgentId } from "../../hooks/useStudioActiveAgentId";
import { buildAgentOptionLabels } from "../../lib/agent-option-labels";
import { canOfferAnotherBot } from "../../lib/bot-roster-policy";
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
  const detailsOpen = searchParams.get("section") === "details";
  const activeAgentId = requestedId?.trim() || resolvedId;
  const activeAgent = activeAgentId
    ? (agents.find((agent) => agent.id === activeAgentId) ?? null)
    : null;
  const lineStatus = activeAgent ? agentLineStatus(activeAgent, phoneLookupDegraded) : null;
  const readyLabel = activeAgent ? agentReadinessLabel(activeAgent, phoneLookupDegraded) : null;
  const optionLabels = useMemo(() => buildAgentOptionLabels(agents), [agents]);
  const language = customerAgentLanguage();
  const { degraded: rosterDegraded, loading: rosterLoading } = useAgents();

  function selectAgent(agentId: string) {
    setSearchParams(
      () => {
        // A Bot switch can immediately follow a Conversation/Browser change.
        // Merge the current URL, not a previous render's panel preference.
        const next = new URLSearchParams(window.location.search);
        next.set("agent", agentId);
        next.delete("command");
        next.delete("commandNonce");
        if (next.get("section") === "details") next.delete("section");
        return next;
      },
      { replace: true },
    );
  }

  // With no Bot yet, the page's only job is the Create Your Bot card. A
  // header row holding just a tiny "Workspace" label and a divider read as
  // unfinished chrome, so keep only the page heading for assistive tech.
  // An unreachable or still-loading roster is not an empty one: keep the
  // header then, so it never pops in for an owner who does have Bots.
  const knownEmpty = agents.length === 0 && !rosterDegraded && !rosterLoading;
  if (knownEmpty) return <h1 className="sr-only">{language.plural}</h1>;

  return (
    <header className="wl-studio-context shrink-0" aria-label={`${language.singular} context`}>
      <div className="wl-studio-context-row flex min-h-[56px] flex-nowrap items-center justify-between gap-1 px-2 py-1.5 sm:gap-2 sm:px-5 sm:py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2.5">
          {activeAgent ? null : (
            <span className="inline-flex shrink-0 font-[var(--wireline-font-mono)] text-[10px] uppercase tracking-[0.16em] text-primary">
              {language.navLabel}
            </span>
          )}
          {activeAgent ? (
            <>
              <h1 className="min-w-0 md:max-w-[18rem]">
                <button
                  id="studio-bot-details-toggle"
                  type="button"
                  aria-label={`${activeAgent.name} details`}
                  aria-expanded={detailsOpen}
                  aria-controls={detailsOpen ? "studio-inspector" : undefined}
                  onClick={() => {
                    setSearchParams(
                      (current) =>
                        detailsOpen
                          ? clearStudioInspectorSectionParams(current)
                          : setStudioInspectorSectionParams(current, "details"),
                      { replace: true },
                    );
                  }}
                  className="wl-studio-identity wl-focus-ring-halo"
                >
                  <BotMark
                    seed={activeAgent.id}
                    name={activeAgent.name}
                    markKey={activeAgent.mark_key}
                    size={30}
                  />
                  <span className="wl-preserve-case min-w-0 flex-1 truncate !whitespace-nowrap">
                    {activeAgent.name}
                  </span>
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </button>
              </h1>
              {agents.length > 1 ? (
                <label className="wl-studio-switch-control" title="Switch Bot">
                  <span className="sr-only">Active Bot</span>
                  <select
                    value={activeAgent.id}
                    onChange={(event) => selectAgent(event.target.value)}
                    aria-label="Switch Bot"
                    className="wl-studio-bot-switch"
                  >
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {optionLabels.get(agent.id) || agent.name}
                      </option>
                    ))}
                  </select>
                  <Users
                    className="pointer-events-none size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                </label>
              ) : null}
              {!inspectorOpen && !detailsOpen ? (
                <Button
                  id="studio-settings-toggle"
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 shrink-0 gap-1.5 px-2 sm:px-2.5"
                  aria-label="Set Up Bot"
                  onClick={() =>
                    setSearchParams(
                      (current) => setStudioInspectorSectionParams(current, "setup"),
                      { replace: true },
                    )
                  }
                >
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  <span>Set Up</span>
                </Button>
              ) : null}
            </>
          ) : (
            <h1 className="sr-only">{language.plural}</h1>
          )}
        </div>

        <div className="flex shrink-0 flex-nowrap items-center gap-1">
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
          {agents.length > 0 && canOfferAnotherBot(agents.length) ? (
            <Button
              asChild
              variant="secondary"
              size="sm"
              className="min-h-11 min-w-11 px-0 sm:w-auto sm:px-3 lg:hidden"
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
