import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { BookOpen, MessageCircle } from "lucide-react";

import { Button, EmptyState, NativeSelect } from "../components/atoms";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import WorkspaceShell from "../components/WorkspaceShell";
import WorkspaceRecovery from "../components/WorkspaceRecovery";
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
    label: "Business knowledge",
    shortLabel: "Knowledge",
    ariaLabel: "Business knowledge",
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
      title="Knowledge starts with a voice agent"
      description="Create the agent first, then add the business facts, policies, and answers it may use with customers."
      actions={[
        { label: "Create voice agent", to: "/studio?create=1", primary: true },
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
  const agentId = params.get("agent") || agents[0]?.id || "";
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

  return (
    <WorkspaceShell contentClassName={populated ? "pt-1 pb-24 sm:pb-6" : "pt-0"}>
      {!loading && !agents.length ? (
        <WorkspacePageFrame mode="standard" className="flex min-h-0 flex-1 flex-col">
          <WorkspacePageIntro title="Knowledge" />
          {/* An empty roster and an unreachable one are the same `agents.length`
              but opposite facts. Without this check a failed load rendered
              "Knowledge starts with a voice agent — create the agent
              first", so a customer whose agents were merely unreachable was
              told they had none and invited to build a duplicate. */}
          {degraded ? <WorkspaceRecovery onRetry={refresh} /> : <EmptyKnowledge />}
        </WorkspacePageFrame>
      ) : (
        <WorkspacePageFrame mode="standard">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <WorkspacePageIntro title="Knowledge" />
            </div>
            {/* One control row: section tabs, the Studio test action, and the
                agent picker share a baseline instead of stacking into three
                right-aligned rows under the title. */}
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
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
              <Button asChild variant="secondary" size="sm" className="justify-center">
                <Link to={`/studio?agent=${encodeURIComponent(agentId)}&section=test`}>
                  <MessageCircle size={15} aria-hidden="true" />
                  Test in Studio
                </Link>
              </Button>
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
                  aria-label="Choose voice agent"
                  className="min-w-[180px] sm:w-auto"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
            </div>
          </div>

          {activeTab === "knowledge" ? (
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
