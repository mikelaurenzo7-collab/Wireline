import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Brain,
  Database,
  FileText,
  GraduationCap,
  Mic2,
  PlayCircle,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import { Button, EmptyState, NativeSelect } from "../components/atoms";
import WorkspaceShell from "../components/WorkspaceShell";
import AgentAssetUpload from "../components/AgentAssetUpload";
import KnowledgeWorkspace from "../components/KnowledgeWorkspace";
import { useAgents } from "../contexts/AgentsContext";

const trainingNav = [
  { label: "Knowledge", note: "Facts", icon: Database, section: "facts" },
  { label: "Instructions", note: "Rules", icon: ShieldCheck, section: "guidance" },
  { label: "Sources", note: "Context", icon: FileText, section: "sources" },
  { label: "Voice", note: "Sound", icon: Mic2, studioSub: "voices" },
  { label: "Test call", note: "Practice", icon: PlayCircle, studioSub: "simulator" },
  { label: "Memory", note: "Recall", icon: Brain, studioTab: "memory" },
] as const;

type TrainingNavItem = (typeof trainingNav)[number];

function trainingHref(agentId: string, item: TrainingNavItem) {
  const encodedAgentId = encodeURIComponent(agentId);
  if ("section" in item) return `/training?agent=${encodedAgentId}&section=${item.section}`;
  if ("studioSub" in item)
    return `/studio?agent=${encodedAgentId}&tab=training&sub=${item.studioSub}`;
  return `/studio?agent=${encodedAgentId}&tab=${item.studioTab}`;
}

function TrainingSurfaceMap({
  agentId,
  activeSection,
}: {
  agentId: string;
  activeSection: string | null;
}) {
  return (
    <section className="studio-card grid gap-3 p-4 sm:p-5">
      <div className="wl-centered-header">
        <p className="studio-kicker">Train</p>
        <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.02em] text-foreground">
          Pick a lane.
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Facts, instructions, sources, voice, test calls, and memory.
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {trainingNav.map((item, idx) => {
          const { label, note, icon: Icon } = item;
          const href = trainingHref(agentId, item);
          const isActive = "section" in item && activeSection === item.section;
          return (
            <Link
              key={label}
              to={href}
              aria-current={isActive ? "page" : undefined}
              aria-label={`Open ${label}`}
              className={`group flex min-h-[60px] items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-all active:scale-[0.992] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary ${
                isActive
                  ? "border-primary/45 bg-accent text-foreground shadow-[var(--wireline-elevation-sm)]"
                  : "border-border bg-background text-muted-foreground hover:border-primary/25 hover:bg-accent hover:text-foreground"
              }`}
            >
              <span className="min-w-0 flex items-center gap-3">
                <span className="w-4 font-mono text-[10px] tabular-nums text-muted-foreground/70">
                  0{idx + 1}
                </span>
                <span>
                  <span className="block text-sm font-semibold tracking-[-0.01em] text-foreground">
                    {label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-muted-foreground">
                    {note}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-foreground">
                <span
                  className={`grid size-8 place-items-center rounded-lg transition-colors ${
                    isActive ? "bg-card" : "bg-muted group-hover:bg-card"
                  }`}
                >
                  <Icon size={15} aria-hidden="true" />
                </span>
                <ArrowRight
                  size={14}
                  aria-hidden="true"
                  className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                />
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function EmptyTraining() {
  return (
    <div className="grid h-full min-h-[520px] place-items-center py-8">
      <EmptyState
        density="default"
        className="studio-card w-full max-w-[512px] px-8 py-12 text-center sm:px-10"
        icon={<GraduationCap size={30} strokeWidth={1.7} />}
        title="Train it."
        description="Facts. Rules. Voice."
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

function TrainingRail({
  agentId,
  activeSection,
}: {
  agentId: string;
  activeSection: string | null;
}) {
  return (
    <aside
      className="hidden min-h-0 w-[196px] shrink-0 rounded-2xl border border-border bg-card p-2 xl:block"
      aria-label="Training sections"
    >
      <div className="px-3 py-3 text-center wl-centered-header">
        <p className="wl-overline">Train</p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">Facts. Rules. Voice.</p>
      </div>
      <nav className="mt-2 grid gap-1">
        {trainingNav.map((item) => {
          const { label, note, icon: Icon } = item;
          const href = trainingHref(agentId, item);
          const isActive = "section" in item && activeSection === item.section;
          return (
            <Link
              key={label}
              to={href}
              aria-current={isActive ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-[9px] text-left transition-all ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon size={15} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold tracking-[-0.005em] text-foreground">
                  {label}
                </span>
                <span className="block truncate text-[10px] leading-tight text-muted-foreground/80">
                  {note}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export default function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const [trainingVersion, setTrainingVersion] = useState(0);
  const { agents, loading } = useAgents();
  const agentId = params.get("agent") || agents[0]?.id || "";
  const activeSection = params.get("section") || "facts";
  const populated = !loading && agents.length > 0;

  return (
    <WorkspaceShell
      eyebrow="Operating system"
      title="Training"
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
                  return updated;
                },
                { replace: true },
              )
            }
            aria-label="Choose agent"
            className="min-w-[230px]"
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
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <TrainingSurfaceMap agentId={agentId} activeSection={activeSection} />
          <div className="flex min-h-0 gap-4">
            <TrainingRail agentId={agentId} activeSection={activeSection} />
            <div className="grid min-w-0 flex-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-h-0">
                <KnowledgeWorkspace key={`${agentId}-${trainingVersion}`} />
              </div>
              <div className="min-h-0">
                <AgentAssetUpload
                  agentId={agentId}
                  onComplete={() => setTrainingVersion((value) => value + 1)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}
