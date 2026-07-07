import { Link, useSearchParams } from "react-router-dom";
import { GraduationCap, WandSparkles } from "lucide-react";

import { Button, EmptyState, NativeSelect } from "../components/atoms";
import { WorkspacePageFrame, WorkspacePageIntro } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import WorkspaceShell from "../components/WorkspaceShell";
import VoiceGallery from "../components/voice/VoiceGallery";
import KnowledgeBaseClaude from "../components/KnowledgeBaseClaude";
import AgentPresenceVoiceBridge from "../components/AgentPresenceVoiceBridge";
import WirelineLiveVoiceProfile from "../components/WirelineLiveVoiceProfile";
import { useAgents } from "../contexts/AgentsContext";

type TrainingTabId = "knowledge" | "voice" | "flows" | "simulator";

const trainingTabs: Array<{ id: TrainingTabId; label: string }> = [
  { id: "knowledge", label: "Knowledge" },
  { id: "voice", label: "Voice" },
  { id: "flows", label: "Flows" },
  { id: "simulator", label: "Simulator" },
];

function EmptyTraining() {
  return (
    <div className="grid min-h-[520px] flex-1 place-items-center py-8">
      <EmptyState
        density="default"
        className="studio-card w-full max-w-[620px] px-8 py-12 text-center sm:px-10"
        icon={<GraduationCap size={30} strokeWidth={1.7} />}
        title="Training starts with an agent"
        action={
          <div className="space-y-4">
            <p className="mx-auto max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
              Create the agent first, then add sources, tune the voice, rehearse flows, and run a
              live simulator from this workspace.
            </p>
            <div className="flex flex-col items-stretch justify-center gap-2 sm:flex-row">
              <Button asChild>
                <Link to="/studio?create=1">
                  <WandSparkles aria-hidden="true" size={16} />
                  Create agent
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

function FlowsTab({ agentId }: { agentId: string }) {
  return (
    <section className="studio-card mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <h2 className="wl-card-title">Flows</h2>
      <Button asChild>
        <Link to={`/studio?agent=${encodeURIComponent(agentId)}`}>Open Studio</Link>
      </Button>
    </section>
  );
}

function SimulatorTab({
  agentId,
  agentName,
  isBusinessAgent,
  agentRole,
}: {
  agentId: string;
  agentName: string;
  isBusinessAgent?: boolean;
  agentRole?: string | null;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="studio-card p-6">
        <h2 className="wl-card-title">Live voice test</h2>
        <div className="mt-5 space-y-4">
          <WirelineLiveVoiceProfile agentId={agentId} />
          <AgentPresenceVoiceBridge
            agentId={agentId}
            agentName={agentName}
            role={agentRole}
            isBusinessAgent={isBusinessAgent}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link to={`/studio?agent=${encodeURIComponent(agentId)}&view=workspace#agent-presence`}>
              Customize presence
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/phone?tab=logs">Open call history</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

export default function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const { agents, loading } = useAgents();
  const agentId = params.get("agent") || agents[0]?.id || "";
  const activeAgent = agents.find((agent) => agent.id === agentId) || agents[0];
  const requestedTab = params.get("tab") as TrainingTabId | null;
  const activeTab = trainingTabs.some((tab) => tab.id === requestedTab)
    ? requestedTab!
    : "knowledge";
  const populated = !loading && agents.length > 0;

  function setActiveTab(tab: TrainingTabId) {
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
        <EmptyTraining />
      ) : (
        <WorkspacePageFrame>
          <WorkspacePageIntro title="Training" />
          <div className="mb-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <WorkspaceTabStrip
              ariaLabel="Training sections"
              tabs={trainingTabs}
              activeId={activeTab}
              onSelect={(id) => setActiveTab(id as TrainingTabId)}
              className="mb-0 flex-1 border-b-0 pb-0"
            />
            {populated ? (
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
                aria-label="Choose agent"
                className="w-full min-w-[220px] sm:w-auto"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </NativeSelect>
            ) : null}
          </div>
          {activeTab === "knowledge" ? <KnowledgeBaseClaude agentId={agentId} /> : null}
          {activeTab === "voice" ? (
            <VoiceGallery agentId={agentId} agentName={activeAgent?.name} />
          ) : null}
          {activeTab === "flows" ? <FlowsTab agentId={agentId} /> : null}
          {activeTab === "simulator" && activeAgent ? (
            <SimulatorTab
              agentId={agentId}
              agentName={activeAgent.name}
              isBusinessAgent={activeAgent.is_business_agent}
              agentRole={activeAgent.role}
            />
          ) : null}
        </WorkspacePageFrame>
      )}
    </WorkspaceShell>
  );
}
