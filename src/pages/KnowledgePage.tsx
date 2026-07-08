import { Link, useSearchParams } from "react-router-dom";
import { GraduationCap, GitBranch, WandSparkles } from "lucide-react";

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
        className="wl-paper wl-paper-elevated w-full max-w-[620px] px-8 py-12 text-center sm:px-10"
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
    <EmptyState
      density="default"
      className="wl-paper wl-paper-elevated mx-auto max-w-lg px-8 py-12 text-center"
      icon={<GitBranch size={28} strokeWidth={1.7} aria-hidden="true" />}
      title="Call flows live in Studio"
      action={
        <div className="space-y-3">
          <p className="mx-auto max-w-[44ch] text-sm leading-relaxed text-muted-foreground">
            Flow composer for routing, handoffs, and escalation is in Studio today. A dedicated
            Training flows surface is coming soon.
          </p>
          <Button asChild>
            <Link to={`/studio?agent=${encodeURIComponent(agentId)}&view=workspace`}>
              <WandSparkles aria-hidden="true" size={16} />
              Open flow composer
            </Link>
          </Button>
        </div>
      }
    />
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
      <section className="wl-paper wl-paper-elevated p-6">
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <WorkspacePageIntro title="Training" align="start" />
            <WorkspaceTabStrip
              ariaLabel="Training sections"
              tabs={trainingTabs}
              activeId={activeTab}
              onSelect={(id) => setActiveTab(id as TrainingTabId)}
              density="compact"
              align="start"
              wrap
              className="mb-0 w-full border-b-0 pb-0 sm:w-auto"
            />
          </div>
          {populated ? (
            <div className="mb-2 flex justify-end sm:-mt-2">
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
            </div>
          ) : null}
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
