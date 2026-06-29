import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { GraduationCap, Mic2, PlayCircle, Plus, WandSparkles } from "lucide-react";

import { Button, EmptyState, NativeSelect } from "../components/atoms";
import WorkspaceShell from "../components/WorkspaceShell";
import AgentAssetUpload from "../components/AgentAssetUpload";
import KnowledgeWorkspace from "../components/KnowledgeWorkspace";
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

function TrainingTabs({ activeTab, onChange }: { activeTab: TrainingTabId; onChange: (id: TrainingTabId) => void }) {
  return (
    <nav aria-label="Training sections" className="mb-7 flex min-h-[44px] items-center justify-center gap-2 overflow-x-auto border-b border-border/70 pb-3">
      {trainingTabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(tab.id)}
            className={`inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary/40 ${active ? "bg-primary text-primary-foreground shadow-[var(--wireline-elevation-sm)]" : "text-foreground hover:bg-muted"}`}
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
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="studio-card p-5 sm:p-6">
        <p className="wl-overline">Voice engine</p>
        <h2 className="mt-4 font-[var(--wireline-font-family-display)] text-2xl font-normal tracking-[-.025em] text-foreground">Wireline Voice — Flash</h2>
        <p className="mt-2 text-sm text-muted-foreground">Ultra-low latency synthesis with natural prosody.</p>
        <div className="mt-6 flex items-end gap-1.5 text-primary" aria-hidden="true">
          {[16, 28, 22, 36, 18].map((height, index) => <span key={index} className="w-1.5 rounded-full bg-current" style={{ height }} />)}
        </div>
        <Button type="button" className="mt-6"><Mic2 size={16} aria-hidden="true" />Preview voice</Button>
      </section>
      <section className="studio-card p-5 sm:p-6">
        <p className="wl-overline">Pronunciation dictionary</p>
        <div className="mt-4 grid gap-2">
          {[["Wireline", "WIRE-line"], ["Company", "clear company name"], ["Agent", "warm agent name"]].map(([word, sound]) => (
            <div key={word} className="flex items-center justify-between gap-4 rounded-xl bg-muted/45 px-4 py-3 text-sm">
              <span className="font-semibold text-foreground">{word}</span><span className="text-muted-foreground">→</span><span className="font-semibold text-primary">{sound}</span>
            </div>
          ))}
          <button type="button" className="mt-1 min-h-[44px] rounded-xl border border-dashed border-border bg-background text-sm font-semibold text-muted-foreground hover:border-primary/30 hover:bg-muted/40">+ Add pronunciation</button>
        </div>
      </section>
    </div>
  );
}

function FlowsTab() {
  const stages = ["Greet & Disarm", "Identify Intent", "Collect Info", "Execute Action", "Confirm & Close"];
  return (
    <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <section className="studio-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="font-[var(--wireline-font-family-display)] text-2xl font-normal tracking-[-.025em] text-foreground">Flow Composer</h2><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Linear stage progression</p></div>
          <Button type="button" size="icon" variant="secondary" aria-label="Add flow stage"><Plus size={16} /></Button>
        </div>
        <div className="mt-5 grid gap-3">
          {stages.map((stage, index) => <button key={stage} type="button" className={`flex min-h-[52px] items-center gap-3 rounded-xl border px-4 text-left text-sm font-semibold ${index === 0 ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-foreground"}`}><span className="grid size-6 place-items-center rounded-full bg-muted text-[11px] text-foreground">{index + 1}</span>{stage}</button>)}
        </div>
      </section>
      <section className="studio-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-lg bg-primary/10 font-mono text-sm font-semibold text-primary">1</span><div><h2 className="font-[var(--wireline-font-family-display)] text-2xl font-normal tracking-[-.025em] text-foreground">Greet & Disarm</h2><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Stage definition</p></div></div><Button type="button" variant="secondary" size="sm">Save Flow</Button></div>
        <div className="mt-5"><p className="wl-overline">Agent instructions</p><div className="mt-3 min-h-[132px] rounded-xl border border-border bg-background p-4 text-sm leading-6 text-foreground">Open warm and confident. Name yourself and the company in the first sentence. Earn permission before moving to the next ask.</div></div>
        <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Transition condition</p><p className="mt-3 text-foreground"><span className="font-semibold">IF:</span> Permission is granted or the response is handled politely.</p></div>
      </section>
    </div>
  );
}

function SimulatorTab() {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="studio-card p-5 sm:p-6"><p className="wl-overline">Scenario library</p><div className="mt-4 grid gap-2">{["Appointment booking", "Service question", "Pricing inquiry", "After-hours call"].map((title, index) => <button key={title} type="button" className={`min-h-[60px] rounded-xl border px-4 text-left ${index === 0 ? "border-primary/20 bg-primary/5" : "border-border bg-background"}`}><span className="block text-sm font-semibold text-foreground">{title}</span><span className="mt-1 block text-xs text-muted-foreground">Test response quality</span></button>)}</div></section>
      <section className="grid min-h-[340px] place-items-center rounded-2xl bg-[#1d1f1d] p-8 text-center text-white"><div><button type="button" className="mx-auto grid size-16 place-items-center rounded-full border border-emerald-400/80 text-emerald-300" aria-label="Run test call"><PlayCircle size={34} strokeWidth={1.6} /></button><h2 className="mt-6 font-[var(--wireline-font-family-display)] text-2xl font-normal tracking-[-.025em]">Run test call</h2><p className="mt-3 max-w-sm text-sm leading-6 text-white/60">Select a scenario and press play.</p></div></section>
    </div>
  );
}

export default function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const [trainingVersion, setTrainingVersion] = useState(0);
  const { agents, loading } = useAgents();
  const agentId = params.get("agent") || agents[0]?.id || "";
  const requestedTab = params.get("tab") as TrainingTabId | null;
  const activeTab = trainingTabs.some((tab) => tab.id === requestedTab) ? requestedTab! : "knowledge";
  const populated = !loading && agents.length > 0;

  function setActiveTab(tab: TrainingTabId) {
    setParams((current) => { const updated = new URLSearchParams(current); updated.set("tab", tab); if (agentId) updated.set("agent", agentId); return updated; }, { replace: true });
  }

  return (
    <WorkspaceShell eyebrow="Operating system" title="Training" contentClassName={populated ? "pt-1 pb-24 sm:pb-6" : "pt-0"} action={populated ? <NativeSelect value={agentId} onChange={(event) => setParams((current) => { const updated = new URLSearchParams(current); updated.set("agent", event.target.value); updated.set("tab", activeTab); return updated; }, { replace: true })} aria-label="Choose agent" className="min-w-[230px]">{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</NativeSelect> : undefined}>
      {!loading && !agents.length ? <EmptyTraining /> : <div className="flex min-h-0 flex-1 flex-col pb-8"><TrainingTabs activeTab={activeTab} onChange={setActiveTab} />{activeTab === "knowledge" ? <div className="grid min-w-0 flex-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]"><div className="min-h-0"><KnowledgeWorkspace key={`${agentId}-${trainingVersion}`} /></div><div className="min-h-0"><AgentAssetUpload agentId={agentId} onComplete={() => setTrainingVersion((value) => value + 1)} /></div></div> : null}{activeTab === "voice" ? <VoiceTab /> : null}{activeTab === "flows" ? <FlowsTab /> : null}{activeTab === "simulator" ? <SimulatorTab /> : null}</div>}
    </WorkspaceShell>
  );
}
