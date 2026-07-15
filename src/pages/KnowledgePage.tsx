import { useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, MessageCircle, WandSparkles } from "lucide-react";

import { Button, EmptyState } from "../components/atoms";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/shadcn/Select";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import WorkspaceShell from "../components/WorkspaceShell";
import KnowledgeBaseClaude from "../components/KnowledgeBaseClaude";
import ReportingPreferences from "../components/training/ReportingPreferences";
import RecentCallArtifactRequests from "../components/training/RecentCallArtifactRequests";
import { useAgents } from "../contexts/AgentsContext";

type KnowledgeTabId = "knowledge" | "reports";

const knowledgeTabs: Array<{ id: KnowledgeTabId; label: string }> = [
  { id: "knowledge", label: "Business knowledge" },
  { id: "reports", label: "Reports" },
];

function EmptyKnowledge() {
  return (
    <div className="grid min-h-[520px] flex-1 place-items-center py-8">
      <EmptyState
        density="default"
        className="wl-paper wl-paper-elevated w-full max-w-[620px] px-8 py-12 text-center sm:px-10"
        icon={<BookOpen size={30} strokeWidth={1.7} />}
        title="Knowledge starts with an AI employee"
        action={
          <div className="space-y-4">
            <p className="mx-auto max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
              Create the employee first, then add the business facts, policies, and answers it may use with customers.
            </p>
            <div className="flex flex-col items-stretch justify-center gap-2 sm:flex-row">
              <Button asChild>
                <Link to="/studio?create=1">
                  <WandSparkles aria-hidden="true" size={16} />
                  Create AI employee
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/templates">Browse templates</Link>
              </Button>
            </div>
          </div>
        }
      />
    </div>
  );
}

export default function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { agents, loading } = useAgents();
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
        <EmptyKnowledge />
      ) : (
        <WorkspacePageFrame mode="standard">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <WorkspacePageIntro title="Knowledge" />
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                Approved facts, rules, and tone for each AI employee.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <WorkspaceTabStrip
                ariaLabel="Knowledge sections"
                tabs={knowledgeTabs}
                activeId={activeTab}
                onSelect={(id) => setActiveTab(id as KnowledgeTabId)}
                density="compact"
                align="start"
                wrap
                className="mb-0 w-full border-b-0 pb-0 sm:w-auto"
              />
              <Button asChild variant="secondary" size="sm" className="justify-center">
                <Link to={`/studio?agent=${encodeURIComponent(agentId)}&section=test`}>
                  <MessageCircle size={15} aria-hidden="true" />
                  Test in Studio
                </Link>
              </Button>
            </div>
          </div>

          {populated && activeTab === "knowledge" ? (
            <div className="mb-2 w-full sm:-mt-2 sm:ml-auto sm:max-w-xs">
              <Select
                value={agentId}
                onValueChange={(value) =>
                  setParams(
                    (current) => {
                      const updated = new URLSearchParams(current);
                      updated.set("agent", value);
                      updated.set("tab", activeTab);
                      return updated;
                    },
                    { replace: true },
                  )
                }
              >
                <SelectTrigger aria-label="Choose AI employee">
                  <SelectValue placeholder="Choose AI employee" />
                </SelectTrigger>
                <SelectContent className="max-h-[min(20rem,55dvh)]">
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {activeTab === "knowledge" ? <KnowledgeBaseClaude agentId={agentId} /> : null}
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
