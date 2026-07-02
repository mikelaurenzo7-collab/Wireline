import { Link, useSearchParams } from "react-router-dom";
import { GraduationCap, Phone, WandSparkles } from "lucide-react";

import { Button, EmptyState, NativeSelect } from "../components/atoms";
import { WorkspacePageFrame } from "../components/layout/WorkspacePageFrame";
import { WorkspaceTabStrip } from "../components/layout/WorkspaceTabStrip";
import WorkspaceShell from "../components/WorkspaceShell";
import VoiceGallery from "../components/voice/VoiceGallery";
import KnowledgeBaseClaude from "../components/KnowledgeBaseClaude";
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
    <div className="grid h-full min-h-[520px] place-items-center py-8">
      <EmptyState
        density="default"
        className="studio-card w-full max-w-[512px] px-8 py-12 text-center sm:px-10"
        icon={<GraduationCap size={30} strokeWidth={1.7} />}
        title="Train it."
        description="Docs. Voice. Flows. Test calls."
        action={
          <Button asChild>
            <Link to="/studio?create=1">
              <WandSparkles aria-hidden="true" size={16} />
              Wire agent
            </Link>
          </Button>
        }
      />
    </div>
  );
}

function FlowsTab({ agentId }: { agentId: string }) {
  return (
    <section className="studio-card mx-auto max-w-xl p-8 text-center">
      <p className="wl-overline">Conversation flows</p>
      <h2 className="mt-3 font-[var(--wireline-font-family-display)] text-2xl tracking-[-0.02em] text-foreground">
        Shape how calls move stage by stage.
      </h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Greeting, intent capture, handoff, and close rules live with each agent in Studio. Train
        keeps knowledge and voice; Studio owns the live conversation design.
      </p>
      <Button asChild className="mt-6">
        <Link to={`/studio?agent=${encodeURIComponent(agentId)}`}>Open Studio</Link>
      </Button>
    </section>
  );
}

function SimulatorTab({ agentId, agentName }: { agentId: string; agentName?: string }) {
  return (
    <section className="studio-card mx-auto max-w-xl p-8 text-center">
      <p className="wl-overline">Test calls</p>
      <h2 className="mt-3 font-[var(--wireline-font-family-display)] text-2xl tracking-[-0.02em] text-foreground">
        Hear {agentName || "your agent"} before the line goes live.
      </h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        Run a browser test from Studio, or review completed calls once your Wireline number is
        active.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link to={`/studio?agent=${encodeURIComponent(agentId)}`}>
            <Phone size={15} aria-hidden="true" />
            Test in Studio
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/call-logs">Review call logs</Link>
        </Button>
      </div>
    </section>
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
    <WorkspaceShell
      eyebrow="Training"
      title="Train"
      description="Knowledge, voice, flows, and test calls for each agent in your workspace."
      contentClassName={populated ? "pt-1 pb-24 sm:pb-6" : "pt-0"}
      action={
        populated ? (
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
            className="min-w-[220px]"
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </NativeSelect>
        ) : undefined
      }
    >
      {!loading && !agents.length ? (
        <EmptyTraining />
      ) : (
        <WorkspacePageFrame>
          <WorkspaceTabStrip
            ariaLabel="Training sections"
            tabs={trainingTabs}
            activeId={activeTab}
            onSelect={(id) => setActiveTab(id as TrainingTabId)}
            className="mb-7"
          />
          {activeTab === "knowledge" ? <KnowledgeBaseClaude agentId={agentId} /> : null}
          {activeTab === "voice" ? (
            <VoiceGallery agentId={agentId} agentName={activeAgent?.name} />
          ) : null}
          {activeTab === "flows" ? <FlowsTab agentId={agentId} /> : null}
          {activeTab === "simulator" ? (
            <SimulatorTab agentId={agentId} agentName={activeAgent?.name} />
          ) : null}
        </WorkspacePageFrame>
      )}
    </WorkspaceShell>
  );
}
