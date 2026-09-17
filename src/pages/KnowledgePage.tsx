import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { BookOpen, MessageCircle } from "lucide-react";

import { Button, EmptyState, NativeSelect } from "../components/atoms";
import WorkspaceControlBand from "../components/layout/WorkspaceControlBand";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import WorkspaceShell from "../components/WorkspaceShell";
import WorkspaceRecovery from "../components/WorkspaceRecovery";
import { StatusNotice } from "../components/molecules/StatusNotice";
import KnowledgeBaseClaude from "../components/KnowledgeBaseClaude";
import ReportingPreferences from "../components/training/ReportingPreferences";
import RecentCallArtifactRequests from "../components/training/RecentCallArtifactRequests";
import WebsiteKnowledgeImport from "../components/training/WebsiteKnowledgeImport";
import { useAgents } from "../contexts/AgentsContext";

type KnowledgeTabId = "knowledge" | "reports";

const knowledgeTabs: Array<{
  id: KnowledgeTabId;
  label: string;
  shortLabel?: string;
  ariaLabel?: string;
}> = [
  {
    id: "knowledge",
    label: "Knowledge",
    shortLabel: "Knowledge",
    ariaLabel: "Bot knowledge",
  },
  { id: "reports", label: "Reports" },
];

function EmptyKnowledge() {
  return (
    <EmptyState
      fill
      density="compact"
      titleTone="ui"
      withHalo={false}
      className="wl-paper wl-paper-elevated mx-auto w-full max-w-[620px] px-8 py-12 text-center sm:px-10"
      icon={<BookOpen size={30} strokeWidth={1.7} />}
      title="Knowledge starts with a Bot"
      description="Create the Bot first, then add the facts, policies, and answers it may use with customers."
      actions={[
        { label: "Create Bot", to: "/studio?create=1", primary: true },
        { label: "Browse templates", to: "/templates" },
      ]}
    />
  );
}

export default function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { agents, loading, degraded, refresh } = useAgents();
  const [knowledgeRevision, setKnowledgeRevision] = useState(0);
  const requestedAgentId = params.get("agent");
  const agentId = requestedAgentId
    ? agents.find((agent) => agent.id === requestedAgentId)?.id || ""
    : agents[0]?.id || "";
  const rawRequestedTab = params.get("tab");
  const requestedTab = rawRequestedTab as KnowledgeTabId | null;
  const activeTab = knowledgeTabs.some((tab) => tab.id === requestedTab)
    ? requestedTab!
    : "knowledge";
  const populated = !loading && agents.length > 0;

  useEffect(() => {
    if (!rawRequestedTab || !["voice", "flows", "simulator"].includes(rawRequestedTab)) return;
    const studioParams = new URLSearchParams();
    if (agentId) studioParams.set("agent", agentId);
    studioParams.set("section", rawRequestedTab === "simulator" ? "test" : "setup");
    navigate(`/studio?${studioParams.toString()}`, { replace: true });
  }, [agentId, navigate, rawRequestedTab]);

  function setActiveTab(tab: KnowledgeTabId) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set("tab", tab);
        if (agentId) updated.set("agent", agentId);
        return updated;
      },
      { replace: true },
    );
  }

  const secondaryControls = (
    <>
      {agentId ? (
        <Button asChild variant="secondary" size="sm" className="shrink-0 justify-center">
          <Link to={`/studio?agent=${encodeURIComponent(agentId)}&section=test`}>
            <MessageCircle size={15} aria-hidden="true" />
            Test in Studio
          </Link>
        </Button>
      ) : null}
      {populated && activeTab === "knowledge" ? (
        <NativeSelect
          value={agentId}
          onChange={(event) =>
            setParams(
              (current) => {
                const updated = new URLSearchParams(current);
                updated.set("agent", event.target.value);
                updated.set("tab", activeTab);
                return updated;
              },
              { replace: true },
            )
          }
          aria-label="Choose Bot"
          className="min-w-[160px] max-w-[12rem] sm:w-auto"
        >
          {!agentId ? (
            <option value="" disabled>
              Choose a Bot
            </option>
          ) : null}
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </NativeSelect>
      ) : null}
    </>
  );

  return (
    <WorkspaceShell contentClassName={populated ? "pt-1 pb-24 sm:pb-6" : "pt-0"}>
      {loading || degraded || !agents.length ? (
        <WorkspacePageFrame mode="standard" className="flex min-h-0 flex-1 flex-col">
          <WorkspacePageIntro title="Knowledge" />
          {loading ? (
            <StatusNotice title="Loading Bots" aria-busy="true">
              Your knowledge workspace will be ready in a moment.
            </StatusNotice>
          ) : degraded ? (
            <WorkspaceRecovery onRetry={refresh} />
          ) : (
            <EmptyKnowledge />
          )}
        </WorkspacePageFrame>
      ) : (
        <WorkspacePageFrame mode="standard">
          <WorkspacePageIntro title="Knowledge" titleHidden />
          <WorkspaceControlBand
            ariaLabel="Knowledge controls"
            primary={
              <WorkspaceTabStrip
                ariaLabel="Knowledge sections"
                tabs={knowledgeTabs}
                activeId={activeTab}
                onSelect={(id) => setActiveTab(id as KnowledgeTabId)}
                density="compact"
                align="start"
                wrap
                className="mb-0 border-b-0 pb-0"
              />
            }
            secondary={secondaryControls}
          />

          {activeTab === "knowledge" && !agentId ? (
            <StatusNotice tone="warning" title="Choose an available Bot">
              The Bot in this link is no longer available in this workspace. Select a Bot above to
              view or edit its knowledge.
            </StatusNotice>
          ) : null}
          {activeTab === "knowledge" && agentId ? (
            <div className="space-y-5">
              <WebsiteKnowledgeImport
                agentId={agentId}
                onImported={() => setKnowledgeRevision((value) => value + 1)}
              />
              <KnowledgeBaseClaude key={`${agentId}:${knowledgeRevision}`} agentId={agentId} />
            </div>
          ) : null}
          {activeTab === "reports" ? (
            <div className="space-y-5">
              <ReportingPreferences />
              <RecentCallArtifactRequests />
            </div>
          ) : null}
        </WorkspacePageFrame>
      )}
    </WorkspaceShell>
  );
}
