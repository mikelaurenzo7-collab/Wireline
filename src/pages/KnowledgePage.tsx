import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
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
  { label: "Knowledge", note: "Facts and preferences", icon: Database, section: "facts" },
  { label: "Instructions", note: "Rules and handoff", icon: ShieldCheck, section: "guidance" },
  { label: "Sources", note: "Files and context", icon: FileText, section: "sources" },
  { label: "Voice", note: "Sound and identity", icon: Mic2, studioSub: "voices" },
  { label: "Test call", note: "Practice before live", icon: PlayCircle, studioSub: "simulator" },
  { label: "Memory", note: "Thread and recall", icon: Brain, studioTab: "memory" },
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
    <section className="studio-card grid gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="wl-overline">Training map</p>
          <h2 className="mt-2 text-[var(--wireline-typography-h3-size)] font-semibold tracking-[-.03em] text-foreground">
            Facts, instructions, sources, voice, test calls, and memory.
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-5 text-muted-foreground">
          Create stays short. Training owns the detailed setup before anything goes live.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {trainingNav.map((item) => {
          const { label, note, icon: Icon } = item;
          const href = trainingHref(agentId, item);
          const isActive = "section" in item && activeSection === item.section;
          return (
            <Link
              key={label}
              to={href}
              aria-current={isActive ? "page" : undefined}
              className={`group flex min-h-[84px] items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                isActive
                  ? "border-primary/30 bg-accent text-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-primary/25 hover:bg-accent hover:text-foreground"
              }`}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{note}</span>
              </span>
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] transition-colors ${
                  isActive
                    ? "bg-card text-foreground"
                    : "bg-muted text-foreground group-hover:bg-card"
                }`}
              >
                <Icon size={16} aria-hidden="true" />
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
        className="studio-card w-full max-w-[512px] px-8 py-12 text-left sm:px-10"
        icon={<GraduationCap size={30} strokeWidth={1.7} />}
        title="Train the agent."
        description="Add facts, rules, tone, and sources once an agent exists."
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
      className="hidden min-h-0 w-[196px] shrink-0 rounded-2xl border border-border bg-card p-2 lg:block"
      aria-label="Training sections"
    >
      <div className="px-3 py-3">
        <p className="wl-overline">Training</p>
        <p className="mt-2 text-sm leading-5 text-muted-foreground">
          Facts, instructions, sources, voice, and memory.
        </p>
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
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${
                isActive
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{note}</span>
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
  const activeSection = params.get("section");
  const populated = !loading && agents.length > 0;

  return (
    <WorkspaceShell
      eyebrow="Operating system"
      title="Training"
      contentClassName={populated ? "pt-5" : "pt-0"}
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
            <div className="grid min-w-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
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
