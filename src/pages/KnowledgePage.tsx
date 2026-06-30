import { Link, useSearchParams } from "react-router-dom";
import { GraduationCap, Mic2, PlayCircle, Plus, WandSparkles } from "lucide-react";

import { Button, NativeSelect } from "../components/atoms";
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

function EmptyTraining() {
  const lanes = [
    {
      icon: GraduationCap,
      label: "Knowledge",
      body: "Upload FAQs, scripts, policies, and grounded source material before the first live call.",
    },
    {
      icon: Mic2,
      label: "Voice",
      body: "Shape pronunciation, tone, and how the agent sounds when the line picks up.",
    },
    {
      icon: Plus,
      label: "Flows",
      body: "Define handoff rules, stage-by-stage call behavior, and the final confirmation step.",
    },
    {
      icon: PlayCircle,
      label: "Simulator",
      body: "Run practice calls before anything goes live so weak spots show up early.",
    },
  ] as const;

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 py-6">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <div className="wl-card-lg">
          <p className="wl-eyebrow wl-eyebrow-primary">Train before go-live</p>
          <h2 className="wl-title-tight mt-3">
            Docs, voice, flows, and test calls in one clean setup lane.
          </h2>
          <p className="wl-body mt-4 max-w-2xl">
            Train gives every agent the source material, tone, limits, and practice reps it needs before the first caller reaches the line.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link to="/studio?create=1">
                <WandSparkles aria-hidden="true" size={16} />
                Create agent
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/templates">
                <Plus aria-hidden="true" size={16} />
                Browse templates
              </Link>
            </Button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="wl-card flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--wireline-color-feedback-success-surface)] text-primary">
              <GraduationCap size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="wl-card-heading">Training first</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                A useful line starts with grounded instructions, not a blank shell.
              </p>
            </div>
          </div>
          <div className="wl-card flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-muted text-primary">
              <PlayCircle size={18} aria-hidden="true" />
            </span>
            <div>
              <p className="wl-card-heading">Practice before production</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Test behavior, escalation, and tone before real callers hit the line.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" aria-label="Training surfaces">
        {lanes.map(({ icon: Icon, label, body }) => (
          <article key={label} className="wl-card min-h-[210px]">
            <span className="grid size-10 place-items-center rounded-[10px] bg-muted text-primary">
              <Icon size={18} aria-hidden="true" />
            </span>
            <h3 className="wl-card-heading mt-5 text-base">{label}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
          </article>
        ))}
      </section>
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
            className={`inline-flex min-h-[36px] shrink-0 items-center justify-center rounded-[6px] px-4 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--wireline-color-action-primary-default)] ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
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
        <h1 className="wl-display-3">Voice configuration</h1>
        <p className="wl-body-sm mt-1.5 max-w-prose">
          Configure voice, pronunciation, and speech patterns per agent.
        </p>
      </header>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="wl-card-lg">
          <p className="wl-eyebrow">Voice engine</p>
          <h2 className="wl-display-4 mt-3">Wireline Voice — Flash</h2>
          <p className="mt-1.5 text-[13px] text-[var(--wireline-color-text-secondary)]">
            Ultra-low latency synthesis with natural prosody.
          </p>
          <div className="mt-5 flex h-8 items-end gap-1" aria-hidden="true">
            {[40, 80, 60, 95, 50, 75, 45, 88].map((height, index) => (
              <span
                key={index}
                className={`w-1 rounded-sm ${index % 2 === 0 ? "bg-primary" : "bg-[var(--wireline-color-action-primary-container)]"}`}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <button
            type="button"
            className="mt-5 inline-flex items-center gap-2 rounded-[8px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground"
          >
            <Mic2 size={15} aria-hidden="true" />
            Preview voice
          </button>
        </section>
        <section className="wl-card-lg">
          <p className="wl-eyebrow">Pronunciation dictionary</p>
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
    "Greet and disarm",
    "Identify intent",
    "Collect info",
    "Execute action",
    "Confirm and close",
  ];
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <section className="flex flex-col gap-3">
        <div className="wl-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="wl-display-4">Flow composer</h2>
              <p className="wl-eyebrow mt-1">Linear stage progression</p>
            </div>
            <button
              type="button"
              aria-label="Add flow stage"
              className="grid size-8 place-items-center rounded-full bg-[var(--wireline-color-feedback-success-surface)] text-primary"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 rounded-[14px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-3">
          {stages.map((stage, index) => (
            <button
              key={stage}
              type="button"
              className={`rounded-[8px] px-3 py-2.5 text-left text-[13px] font-semibold transition-colors ${
                index === 0
                  ? "bg-[var(--wireline-color-feedback-success-surface)] text-primary"
                  : "text-[var(--wireline-color-text-secondary)] hover:bg-[var(--wireline-color-surface-subtle)]"
              }`}
            >
              {stage}
            </button>
          ))}
        </div>
      </section>
      <section className="wl-card-lg min-h-[320px]">
        <p className="wl-eyebrow">Selected stage</p>
        <h2 className="wl-display-4 mt-3">Greet and disarm</h2>
        <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">
          The agent opens with identity, purpose, and a calm path forward. Keep the greeting short enough for live calls.
        </p>
        <div className="mt-5 rounded-[12px] bg-muted p-4 text-sm leading-6 text-muted-foreground">
          "Hi, this is Wireline calling for the account owner. I can help get this handled — may I ask what this is regarding?"
        </div>
      </section>
    </div>
  );
}

function SimulatorTab() {
  return (
    <div className="grid min-h-[360px] place-items-center rounded-[14px] border border-dashed border-[var(--wireline-color-border-strong)] bg-[var(--wireline-color-surface-default)] p-8 text-center">
      <div>
        <p className="wl-eyebrow wl-eyebrow-primary">Simulator</p>
        <h2 className="wl-display-3 mt-3">Practice calls before launch.</h2>
        <p className="mt-3 max-w-[42ch] text-sm leading-6 text-muted-foreground">
          Run a scenario, inspect the transcript, then tighten the voice, facts, or handoff rules before the agent goes live.
        </p>
      </div>
    </div>
  );
}

export default function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab") as TrainingTabId | null;
  const activeTab: TrainingTabId = trainingTabs.some((tab) => tab.id === requestedTab)
    ? (requestedTab as TrainingTabId)
    : "knowledge";
  const { agents, loading } = useAgents();
  const hasAgents = !loading && agents.length > 0;

  function setActiveTab(tab: TrainingTabId) {
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set("tab", tab);
        return updated;
      },
      { replace: true },
    );
  }

  return (
    <WorkspaceShell eyebrow="Train" title="Training" contentClassName="pt-2 pb-8">
      {hasAgents ? (
        <div className="flex min-h-full flex-col">
          <TrainingTabs activeTab={activeTab} onChange={setActiveTab} />
          {activeTab === "knowledge" ? <KnowledgeBaseClaude /> : null}
          {activeTab === "voice" ? <VoiceTab /> : null}
          {activeTab === "flows" ? <FlowsTab /> : null}
          {activeTab === "simulator" ? <SimulatorTab /> : null}
        </div>
      ) : (
        <EmptyTraining />
      )}
    </WorkspaceShell>
  );
}
