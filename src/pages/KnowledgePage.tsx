import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { MessageCircle } from "lucide-react";

import { Button, EmptyState, NativeSelect } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import WorkspaceRecovery from "../components/WorkspaceRecovery";
import KnowledgeBaseClaude from "../components/KnowledgeBaseClaude";
import AboutYouMemories from "../components/training/AboutYouMemories";
import WebsiteKnowledgeImport from "../components/training/WebsiteKnowledgeImport";
import { useAgents } from "../contexts/AgentsContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
import { buildAgentOptionLabels } from "../lib/agent-option-labels";

function EmptyKnowledge() {
  // The Workspace creates Bo for an account without a Bot, so this only shows
  // until that first visit.
  return (
    <EmptyState
      headingAs="h2"
      fill
      density="compact"
      titleTone="ui"
      withHalo={false}
      className="wl-paper wl-paper-elevated mx-auto w-full max-w-[620px] px-8 py-12 text-center sm:px-10"
      title="Meet Your Bot First"
      actions={[{ label: "Open Workspace", to: "/studio", primary: true }]}
    />
  );
}

/**
 * The library of what a Bot knows. Typing new knowledge happens in one place,
 * the Workspace chat ("tell Bo"); this page adds what is too big to type
 * (documents, a website) and lets the owner review, fix, or remove anything.
 */
export function KnowledgeEditor({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [knowledgeRevision, setKnowledgeRevision] = useState(0);
  const [knowledgeBusy, setKnowledgeBusy] = useState(true);
  const [importing, setImporting] = useState(false);
  return (
    <div className="space-y-5">
      <WebsiteKnowledgeImport
        agentId={agentId}
        disabled={knowledgeBusy}
        onImportingChange={setImporting}
        onImported={() => setKnowledgeRevision((value) => value + 1)}
      />
      <KnowledgeBaseClaude
        key={knowledgeRevision}
        agentId={agentId}
        externallyBusy={importing}
        onInteractionChange={setKnowledgeBusy}
      />
      <AboutYouMemories key={agentId} agentId={agentId} agentName={agentName} />
    </div>
  );
}

export default function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { agents, loading, degraded, refresh } = useAgents();
  const agentLabels = buildAgentOptionLabels(agents);
  const { requestedId, resolvedId } = useStudioActiveAgentId();
  // A requested Bot is an explicit scope. A stale link must never fall back to
  // another Bot and let the owner save knowledge to the wrong one.
  const requestedAgentId = requestedId?.trim() || "";
  const requestedAgentUnavailable = Boolean(
    requestedAgentId && !agents.some((agent) => agent.id === requestedAgentId),
  );
  const agentId = requestedAgentUnavailable ? "" : resolvedId || "";
  const agentName = agents.find((agent) => agent.id === agentId)?.name || "Your Bot";
  const rawRequestedTab = params.get("tab");
  const populated = !loading && agents.length > 0;

  useEffect(() => {
    if (!rawRequestedTab || !["voice", "flows", "simulator"].includes(rawRequestedTab)) return;
    const studioParams = new URLSearchParams();
    // Studio validates this request against its roster. Preserve it while the
    // shared roster is loading or unavailable instead of silently changing Bots.
    const studioAgentId = requestedId?.trim() || agentId;
    if (studioAgentId) studioParams.set("agent", studioAgentId);
    studioParams.set("section", rawRequestedTab === "simulator" ? "test" : "setup");
    navigate(`/studio?${studioParams.toString()}`, { replace: true });
  }, [agentId, navigate, rawRequestedTab, requestedId]);

  // Keep bookmarked report links useful while Calls becomes their single owner.
  if (rawRequestedTab === "reports") {
    return <Navigate to={`/phone?${params.toString()}`} replace />;
  }

  const secondaryControls = (
    <>
      {agentId ? (
        <Button
          asChild
          variant="secondary"
          size="sm"
          className="min-h-11 shrink-0 justify-center rounded-lg border-border/80 px-3.5 shadow-2xs sm:min-h-9"
        >
          <Link to={`/studio?agent=${encodeURIComponent(agentId)}`}>
            <MessageCircle size={15} aria-hidden="true" />
            Teach in Chat
          </Link>
        </Button>
      ) : null}
      {populated ? (
        <NativeSelect
          value={agentId}
          onChange={(event) =>
            setParams(
              (current) => {
                const updated = new URLSearchParams(current);
                updated.set("agent", event.target.value);
                updated.delete("tab");
                return updated;
              },
              { replace: true },
            )
          }
          aria-label="Choose Bot"
          className="min-w-[160px] max-w-[13rem] rounded-lg border-border/80 bg-card/95 font-medium shadow-2xs sm:h-9 sm:w-auto sm:py-1.5 sm:text-xs"
        >
          {requestedAgentUnavailable ? (
            <option value="" disabled>
              Choose a Bot
            </option>
          ) : null}
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agentLabels.get(agent.id) ?? agent.name}
            </option>
          ))}
        </NativeSelect>
      ) : null}
    </>
  );

  return (
    <WorkspaceShell contentClassName={populated ? "pt-1 pb-24 sm:pb-6" : "pt-0"}>
      {!loading && !agents.length ? (
        <WorkspacePageFrame mode="standard" className="flex min-h-0 flex-1 flex-col">
          <WorkspacePageIntro title="Knowledge" size="compact" />
          {degraded ? <WorkspaceRecovery onRetry={refresh} /> : <EmptyKnowledge />}
        </WorkspacePageFrame>
      ) : (
        <WorkspacePageFrame mode="standard">
          <WorkspacePageIntro title="Knowledge" size="compact" action={secondaryControls} />
          {!requestedAgentUnavailable && agentId ? (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              Everything {agentName} knows. To teach it something new, tell it in chat. Add
              documents or your website here, and fix or remove anything.
            </p>
          ) : null}

          {requestedAgentUnavailable && !loading ? (
            <StatusNotice
              tone="warning"
              title={degraded ? "Bot Lookup Unavailable" : "Bot Unavailable"}
              action={
                degraded ? (
                  <Button type="button" variant="secondary" size="sm" onClick={refresh}>
                    Retry
                  </Button>
                ) : undefined
              }
            >
              {degraded
                ? "We couldn't verify the Bot in this link. Retry or choose a Bot above before adding knowledge."
                : "The Bot in this link is no longer available. Choose a Bot above before adding knowledge."}
            </StatusNotice>
          ) : null}
          {!requestedAgentUnavailable ? (
            <KnowledgeEditor key={agentId} agentId={agentId} agentName={agentName} />
          ) : null}
        </WorkspacePageFrame>
      )}
    </WorkspaceShell>
  );
}
