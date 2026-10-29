import { PanelRight, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { Button } from "../atoms/Button";
import { useStudioActiveAgentId } from "../../hooks/useStudioActiveAgentId";
import { agentLineStatus, agentReadinessLabel } from "../../lib/agent-readiness";
import { customerAgentLanguage } from "../../lib/product-copy";
import {
  clearStudioInspectorSectionParams,
  setStudioInspectorSectionParams,
} from "../../lib/studio-route-state";
import BotDetailsMenu from "./BotDetailsMenu";

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
  const language = customerAgentLanguage();
  const [panelOpen, setPanelOpen] = useState(() => searchParams.get("panel") === "computer");

  useEffect(() => {
    const handleState = (event: Event) => {
      const customEvent = event as CustomEvent<{ open?: boolean }>;
      if (typeof customEvent.detail?.open === "boolean") {
        setPanelOpen(customEvent.detail.open);
      }
    };
    window.addEventListener("wireline:studio-panel-state", handleState);
    return () => window.removeEventListener("wireline:studio-panel-state", handleState);
  }, []);

  function selectAgent(agentId: string) {
    setSearchParams(
      () => {
        // Keep the currently open browser or setup context while switching.
        // Task chat and draft sessions remain isolated per Bot.
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
          {activeAgent ? (
            <>
              <h1 className="sr-only">{activeAgent.name}</h1>
              <BotDetailsMenu
                agent={activeAgent}
                agents={agents}
                onSelectAgent={selectAgent}
              />
            </>
          ) : (
            <h1 className="wl-preserve-case text-sm font-semibold text-foreground">
              {language.navLabel}
            </h1>
          )}
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-1">
          {activeAgent ? (
            <>
              <Button
                id="studio-panel-toggle"
                type="button"
                variant={panelOpen || searchParams.get("panel") === "computer" ? "secondary" : "ghost"}
                size="sm"
                className="min-h-[44px] px-2.5"
                aria-label={panelOpen ? "Close Browser Panel" : "Open Browser Panel"}
                aria-expanded={panelOpen}
                title={panelOpen ? "Close Browser Panel" : "Open Browser Panel"}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent("wireline:studio-toggle-panel"));
                }}
              >
                <PanelRight
                  className={`size-4 ${panelOpen ? "text-primary" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">Browser</span>
              </Button>
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
            </>
          ) : null}
          {readyLabel ? (
            <span
              className={`hidden items-center gap-1.5 px-2 text-xs font-medium md:inline-flex ${
                lineStatus === "live" ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${
                  lineStatus === "live"
                    ? "bg-[var(--wireline-color-status-success)]"
                    : "bg-current"
                }`}
              />
              {readyLabel}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
