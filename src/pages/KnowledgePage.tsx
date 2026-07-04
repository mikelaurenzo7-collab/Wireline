import { Link, useSearchParams } from "react-router-dom";
import { GraduationCap, Phone, WandSparkles } from "lucide-react";

import { Button, EmptyState, NativeSelect } from "../components/atoms";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import WorkspaceShell from "../components/WorkspaceShell";
import VoiceGallery from "../components/voice/VoiceGallery";
import KnowledgeBaseClaude from "../components/KnowledgeBaseClaude";
import RoleplaySandbox from "../components/RoleplaySandbox";
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
        className="studio-card w-full max-w-[512px] px-8 py-12 text-center sm:px-10"
        icon={<GraduationCap size={30} strokeWidth={1.7} />}
        title="No agents yet"
        action={
          <Button asChild>
            <Link to="/studio?create=1">
              <WandSparkles aria-hidden="true" size={16} />
              Create agent
            </Link>
          </Button>
        }
      />
    </div>
  );
}

function FlowsTab({ agentId }: { agentId: string }) {
  return (
    <section className="studio-card mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <h2 className="wl-card-title">Flows</h2>
      <p className="text-sm leading-6 text-muted-foreground">Call rules live in Studio.</p>
      <Button asChild>
        <Link to={`/studio?agent=${encodeURIComponent(agentId)}`}>Open Studio</Link>
      </Button>
    </section>
  );
}

function SimulatorTab({ agentId, agentName }: { agentId: string; agentName: string }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="studio-card p-6">
        <h2 className="wl-card-title">Simulator</h2>
        <p className="mt-2 max-w-[52ch] text-sm leading-6 text-muted-foreground">
          Hear {agentName} with your rules and training — then review the transcript in call logs.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild>
            <Link to={`/studio?agent=${encodeURIComponent(agentId)}&view=workspace`}>
              <Phone size={15} aria-hidden="true" />
              Agent presence in Studio
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/call-logs">Open call logs</Link>
          </Button>
        </div>
      </section>
      <RoleplaySandbox agentId={agentId} agentName={agentName} />
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
          <div className="mb-7 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
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
            <SimulatorTab agentId={agentId} agentName={activeAgent.name} />
          ) : null}
        </WorkspacePageFrame>
      )}
    </WorkspaceShell>
  );
}
