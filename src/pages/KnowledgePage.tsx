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

function TrainingRail({ agentId }: { agentId: string }) {
  const encodedAgentId = encodeURIComponent(agentId);
  return (
    <aside
      className="hidden min-h-0 w-[196px] shrink-0 rounded-2xl border border-border bg-card p-2 lg:block"
      aria-label="Training sections"
    >
      <div className="px-3 py-3">
        <p className="wl-overline">Training</p>
        <p className="mt-2 text-sm leading-5 text-muted-foreground">Deep controls live here.</p>
      </div>
      <nav className="mt-2 grid gap-1">
        {trainingNav.map((item) => {
          const { label, note, icon: Icon } = item;
          const href =
            "section" in item
              ? `/training?agent=${encodedAgentId}&section=${item.section}`
              : "studioSub" in item
                ? `/studio?agent=${encodedAgentId}&tab=training&sub=${item.studioSub}`
                : `/studio?agent=${encodedAgentId}&tab=${item.studioTab}`;
          return (
            <Link
              key={label}
              to={href}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
        <div className="flex h-full min-h-0 gap-4">
          <TrainingRail agentId={agentId} />
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
      )}
    </WorkspaceShell>
  );
}
