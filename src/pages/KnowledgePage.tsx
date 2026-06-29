import { Link, useSearchParams } from "react-router-dom";
import { GraduationCap, Mic2, PlayCircle, Plus, WandSparkles } from "lucide-react";

import { Button, EmptyState, NativeSelect } from "../components/atoms";
import WorkspaceShell from "../components/WorkspaceShell";
import KnowledgeBaseClaude from "../components/KnowledgeBaseClaude";
import { useAgents } from "../contexts/AgentsContext";

type TrainingTabId = "knowledge" | "voice" | "flows" | "simulator";

const trainingTabs: Array<{ id: TrainingTabId; label: string }> = [
  { id: "knowledge", label: "Knowledge" },
  { id: "voice", label: "Voice" },
  { id: "flows", label: "Flows" },
  { id: "simulator", label: "Simulator" },
];

const MONO_LABEL =
  "font-[var(--wireline-font-mono)] text-[10px] uppercase tracking-[0.14em] text-[var(--wireline-color-text-tertiary)]";

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

function TrainingTabs({
  activeTab,
  onChange,
}: {
  activeTab: TrainingTabId;
  onChange: (id: TrainingTabId) => void;
}) {
  return (
    <nav
      aria-label="Training sections"
      className="mb-7 flex min-h-[44px] items-center gap-2 overflow-x-auto border-b border-[var(--wireline-color-border-default)] pb-3"
    >
      {trainingTabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(tab.id)}
            className="inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-[6px] px-4 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--wireline-color-action-primary-default)]"
            style={
              active
                ? {
                    background: "var(--wireline-color-action-primary-default)",
                    color: "var(--wireline-color-text-onAction)",
                  }
                : { color: "var(--wireline-color-text-secondary)" }
            }
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function VoiceTab() {
  return (
    <div className="flex w-full flex-col gap-6">
      <header>
        <h1 className="font-[var(--wireline-font-family-display)] text-[clamp(1.5rem,1.2rem+1.2vw,2.25rem)] font-normal leading-[1.05] tracking-[-0.02em] text-[var(--wireline-color-text-primary)]">
          Voice Configuration
        </h1>
        <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-[var(--wireline-color-text-secondary)] sm:text-sm">
          Configure voice, pronunciation, and speech patterns per agent.
        </p>
      </header>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-[14px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-6">
          <p className={MONO_LABEL}>Voice engine</p>
          <h2 className="mt-3 font-[var(--wireline-font-family-display)] text-[22px] font-normal leading-tight tracking-[-0.01em] text-[var(--wireline-color-text-primary)]">
            Wireline Voice — Flash
          </h2>
          <p className="mt-1.5 text-[13px] text-[var(--wireline-color-text-secondary)]">
            Ultra-low latency synthesis with natural prosody.
          </p>
          <div className="mt-5 flex h-8 items-end gap-1" aria-hidden="true">
            {[40, 80, 60, 95, 50, 75, 45, 88].map((height, index) => (
              <span
                key={index}
                className="w-1 rounded-sm"
                style={{
                  height: `${height}%`,
                  background:
                    index % 2 === 0
                      ? "var(--wireline-color-action-primary-default)"
                      : "var(--wireline-color-action-primary-container)",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            className="mt-5 inline-flex items-center gap-2 rounded-[8px] px-4 py-2 text-[13px] font-semibold"
            style={{
              background: "var(--wireline-color-action-primary-default)",
              color: "var(--wireline-color-text-onAction)",
            }}
          >
            <Mic2 size={15} aria-hidden="true" />
            Preview voice
          </button>
        </section>
        <section className="rounded-[14px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-6">
          <p className={MONO_LABEL}>Pronunciation dictionary</p>
          <div className="mt-4 grid gap-2">
            {[
              ["Wireline", "WIRE-line"],
              ["Dr. Patel", "Doctor Pah-TELL"],
              ["HIPAA", "HIP-uh"],
            ].map(([word, sound]) => (
              <div
                key={word}
                className="flex items-center gap-3 rounded-[8px] bg-[var(--wireline-color-surface-subtle)] px-3 py-2.5 text-[13px]"
              >
                <span className="flex-1 font-semibold text-[var(--wireline-color-text-primary)]">
                  {word}
                </span>
                <span className="text-[var(--wireline-color-text-tertiary)]">→</span>
                <span className="font-semibold text-[var(--wireline-color-action-primary-default)]">
                  {sound}
                </span>
              </div>
            ))}
            <button
              type="button"
              className="mt-1 min-h-[40px] rounded-[8px] border border-dashed border-[var(--wireline-color-border-strong)] text-[12px] font-medium text-[var(--wireline-color-text-tertiary)] transition-colors hover:border-[var(--wireline-color-action-primary-default)] hover:text-[var(--wireline-color-action-primary-default)]"
            >
              + Add pronunciation
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function FlowsTab() {
  const stages = [
    "Greet & Disarm",
    "Identify Intent",
    "Collect Info",
    "Execute Action",
    "Confirm & Close",
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className="flex flex-col gap-3">
        <div className="rounded-[14px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-[var(--wireline-font-family-display)] text-[20px] font-normal tracking-[-0.01em] text-[var(--wireline-color-text-primary)]">
                Flow Composer
              </h2>
              <p className={`mt-1 ${MONO_LABEL}`}>Linear stage progression</p>
            </div>
            <button
              type="button"
              aria-label="Add flow stage"
              className="grid size-8 place-items-center rounded-full text-[14px]"
              style={{
                background: "var(--wireline-color-feedback-success-surface)",
                color: "var(--wireline-color-action-primary-default)",
              }}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[14px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-3">
          {stages.map((stage, index) => {
            const active = index === 0;
            return (
              <div key={stage}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-[10px] border px-3 py-3 text-left text-[12px] font-medium transition-colors"
                  style={
                    active
                      ? {
                          borderColor: "var(--wireline-color-action-primary-default)",
                          background: "var(--wireline-color-feedback-success-surface)",
                          color: "var(--wireline-color-action-primary-pressed)",
                          borderWidth: "2px",
                          fontWeight: 600,
                        }
                      : {
                          borderColor: "var(--wireline-color-border-default)",
                          color: "var(--wireline-color-text-primary)",
                        }
                  }
                >
                  <span
                    className="grid size-[22px] place-items-center rounded-full font-[var(--wireline-font-mono)] text-[9px] font-bold"
                    style={
                      active
                        ? {
                            background: "var(--wireline-color-action-primary-default)",
                            color: "var(--wireline-color-text-onAction)",
                          }
                        : {
                            background: "var(--wireline-color-surface-subtle)",
                            color: "var(--wireline-color-text-secondary)",
                          }
                    }
                  >
                    {index + 1}
                  </span>
                  <span className="flex-1">{stage}</span>
                  {index === stages.length - 1 ? (
                    <span className="font-[var(--wireline-font-mono)] text-[8px] uppercase tracking-[0.1em] text-[var(--wireline-color-status-warning)]">
                      Terminal
                    </span>
                  ) : null}
                </button>
                {index < stages.length - 1 ? (
                  <div
                    aria-hidden="true"
                    className="ml-[26px] h-2 w-px"
                    style={{ background: "var(--wireline-color-feedback-success-border)" }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
      <section className="flex flex-col rounded-[14px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)]">
        <div className="flex items-center justify-between border-b border-[var(--wireline-color-border-default)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span
              className="grid size-9 place-items-center rounded-[9px] font-[var(--wireline-font-family-display)] text-[18px]"
              style={{
                background: "var(--wireline-color-feedback-success-surface)",
                color: "var(--wireline-color-action-primary-pressed)",
              }}
            >
              1
            </span>
            <div>
              <h3 className="font-[var(--wireline-font-family-display)] text-[20px] font-normal tracking-[-0.01em] text-[var(--wireline-color-text-primary)]">
                Greet & Disarm
              </h3>
              <p className={`mt-0.5 ${MONO_LABEL}`}>Stage definition</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-[7px] px-3.5 py-1.5 text-[12px] font-semibold"
            style={{
              background: "var(--wireline-color-feedback-success-surface)",
              color: "var(--wireline-color-action-primary-pressed)",
            }}
          >
            Save Flow
          </button>
        </div>
        <div className="flex-1 space-y-5 p-5">
          <div>
            <p
              className="mb-2 font-[var(--wireline-font-mono)] text-[9px] uppercase tracking-[0.14em]"
              style={{ color: "var(--wireline-color-action-primary-default)" }}
            >
              Agent Instructions
            </p>
            <textarea
              defaultValue="Open warm and confident. Name yourself + the company in the first sentence. Earn the next 30 seconds with a permission-based ask."
              className="min-h-[120px] w-full resize-y rounded-[10px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-subtle)] p-3.5 text-[13px] leading-relaxed text-[var(--wireline-color-text-primary)] focus:bg-[var(--wireline-color-surface-default)] focus:outline-none focus:ring-1 focus:ring-[var(--wireline-color-action-primary-default)]"
            />
          </div>
          <div>
            <p
              className="mb-2 font-[var(--wireline-font-mono)] text-[9px] uppercase tracking-[0.14em]"
              style={{ color: "var(--wireline-color-action-primary-default)" }}
            >
              → Transition condition
            </p>
            <div className="rounded-[10px] border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] p-3.5 text-[13px] leading-relaxed">
              <span
                className="font-[var(--wireline-font-mono)] text-[10px] font-bold"
                style={{ color: "var(--wireline-color-action-primary-pressed)" }}
              >
                IF:{" "}
              </span>
              The caller grants permission to continue, or pushes back politely.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function SimulatorTab() {
  const scenarios = [
    { title: "Appointment booking", note: "Caller wants to schedule a visit", active: true },
    { title: "Angry caller — billing dispute", note: "Tests escalation handling", active: false },
    { title: "Pricing inquiry", note: "Tests knowledge accuracy", active: false },
    { title: "After-hours call", note: "Tests routing rules", active: false },
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-[14px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-6">
        <p className={MONO_LABEL}>Scenario library</p>
        <div className="mt-4 flex flex-col gap-2">
          {scenarios.map((scenario) => (
            <button
              key={scenario.title}
              type="button"
              className="rounded-[8px] border px-3.5 py-3 text-left transition-colors"
              style={
                scenario.active
                  ? {
                      borderColor: "var(--wireline-color-feedback-success-border)",
                      background: "var(--wireline-color-feedback-success-surface)",
                    }
                  : {
                      borderColor: "var(--wireline-color-border-default)",
                    }
              }
            >
              <div
                className="text-[13px] font-semibold"
                style={{
                  color: scenario.active
                    ? "var(--wireline-color-action-primary-pressed)"
                    : "var(--wireline-color-text-primary)",
                }}
              >
                {scenario.title}
              </div>
              <div
                className="mt-0.5 text-[11px]"
                style={{
                  color: scenario.active
                    ? "var(--wireline-color-action-primary-default)"
                    : "var(--wireline-color-text-tertiary)",
                }}
              >
                {scenario.note}
              </div>
            </button>
          ))}
        </div>
      </section>
      <section
        className="grid min-h-[320px] place-items-center rounded-[14px] p-8 text-center"
        style={{
          background: "var(--wireline-color-text-primary)",
          color: "var(--wireline-color-canvas-default)",
        }}
      >
        <div>
          <button
            type="button"
            aria-label="Run test call"
            className="mx-auto grid size-16 place-items-center rounded-full border-2 transition-transform hover:scale-105"
            style={{ borderColor: "var(--wireline-color-status-success)" }}
          >
            <PlayCircle
              size={28}
              strokeWidth={1.5}
              style={{ color: "var(--wireline-color-status-success)" }}
            />
          </button>
          <h2 className="mt-5 font-[var(--wireline-font-family-display)] text-[22px] font-normal tracking-[-0.01em]">
            Run test call
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-white/60">
            Select a scenario and press play to hear your agent live.
          </p>
        </div>
      </section>
    </div>
  );
}

export default function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const { agents, loading } = useAgents();
  const agentId = params.get("agent") || agents[0]?.id || "";
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
        <div className="flex min-h-0 flex-1 flex-col pb-8">
          <TrainingTabs activeTab={activeTab} onChange={setActiveTab} />
          {activeTab === "knowledge" ? <KnowledgeBaseClaude agentId={agentId} /> : null}
          {activeTab === "voice" ? <VoiceTab /> : null}
          {activeTab === "flows" ? <FlowsTab /> : null}
          {activeTab === "simulator" ? <SimulatorTab /> : null}
        </div>
      )}
    </WorkspaceShell>
  );
}
