import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { BookOpen, Mic } from "lucide-react";

import { Button, EmptyState, NativeSelect } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import WorkspaceControlBand from "../components/layout/WorkspaceControlBand";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import WorkspaceShell from "../components/WorkspaceShell";
import WorkspaceRecovery from "../components/WorkspaceRecovery";
import KnowledgeBaseClaude from "../components/KnowledgeBaseClaude";
import KnowledgeQuickAdd from "../components/training/KnowledgeQuickAdd";
import WebsiteKnowledgeImport from "../components/training/WebsiteKnowledgeImport";
import { useAgents } from "../contexts/AgentsContext";
import { useStudioActiveAgentId } from "../hooks/useStudioActiveAgentId";
import { buildAgentOptionLabels } from "../lib/agent-option-labels";

function EmptyKnowledge() {
  return (
    <EmptyState
      fill
      density="compact"
      titleTone="ui"
      withHalo={false}
      className="wl-paper wl-paper-elevated mx-auto w-full max-w-[620px] px-8 py-12 text-center sm:px-10"
      icon={<BookOpen size={30} strokeWidth={1.7} />}
      title="Knowledge Starts with a Bot"
      description="Create the Bot first, then add the facts, policies, and answers it may use with customers."
      actions={[
        { label: "Create Bot", to: "/studio?create=1", primary: true },
        { label: "Browse templates", to: "/templates" },
      ]}
    />
  );
}

export function KnowledgeEditor({ agentId }: { agentId: string }) {
  const [knowledgeRevision, setKnowledgeRevision] = useState(0);
  const [knowledgeBusy, setKnowledgeBusy] = useState(true);
  const [importing, setImporting] = useState(false);
  const [teaching, setTeaching] = useState(false);
  return (
    <div className="space-y-5">
      <KnowledgeQuickAdd
        agentId={agentId}
        disabled={knowledgeBusy || importing}
        onSavingChange={setTeaching}
        onSaved={() => setKnowledgeRevision((value) => value + 1)}
      />
      <WebsiteKnowledgeImport
        agentId={agentId}
        disabled={knowledgeBusy || teaching}
        onImportingChange={setImporting}
        onImported={() => setKnowledgeRevision((value) => value + 1)}
      />
      <KnowledgeBaseClaude
        key={knowledgeRevision}
        agentId={agentId}
        externallyBusy={importing || teaching}
        onInteractionChange={setKnowledgeBusy}
      />
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
        <Button asChild variant="secondary" size="sm" className="min-h-11 shrink-0 justify-center">
          <Link to={`/studio?agent=${encodeURIComponent(agentId)}&workroom=test`}>
            <Mic size={15} aria-hidden="true" />
            Try It
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
          className="min-w-[160px] max-w-[12rem] sm:w-auto"
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
          <WorkspacePageIntro title="Knowledge" />
          {degraded ? <WorkspaceRecovery onRetry={refresh} /> : <EmptyKnowledge />}
        </WorkspacePageFrame>
      ) : (
        <WorkspacePageFrame mode="standard">
          <WorkspaceControlBand
            ariaLabel="Knowledge controls"
            primary={<h1 className="text-lg font-semibold text-foreground">Knowledge</h1>}
            secondary={secondaryControls}
          />

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
          {!requestedAgentUnavailable ? <KnowledgeEditor key={agentId} agentId={agentId} /> : null}
        </WorkspacePageFrame>
      )}
    </WorkspaceShell>
  );
}
