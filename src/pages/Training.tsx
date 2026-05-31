/**
 * Training — agent knowledge, voice, pronunciation, simulator, and flow.
 */
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  GraduationCap,
  Bot,
  ChevronRight,
  Database,
  Mic,
  BookOpen,
  PlayCircle,
  Workflow,
} from "lucide-react";
import AgentTraining from "../components/AgentTraining";
import { useAgents } from "../contexts/AgentsContext";
import ClientRouteViewport from "../components/layout/ClientRouteViewport";
import ClientRouteLoading from "../components/layout/ClientRouteLoading";
import ClientSubTabs from "../components/layout/ClientSubTabs";
import HubTabs, { TRAINING_HUB } from "../components/HubTabs";
import { EmptyState } from "../components/ui/EmptyState";
import { cn } from "../lib/utils";

const SUB_TABS = [
  { id: "database", label: "Knowledge", icon: Database },
  { id: "voices", label: "Voices", icon: Mic },
  { id: "pronunciation", label: "Pronunciation", icon: BookOpen },
  { id: "simulator", label: "Simulator", icon: PlayCircle },
  { id: "flow", label: "Flow", icon: Workflow },
] as const;

export default function Training() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { agents, loading } = useAgents();

  const selectedAgentId = searchParams.get("agent") || (agents[0]?.id ?? "");
  const activeSubTab = searchParams.get("tab") || "database";

  const selectAgent = (id: string) => {
    setSearchParams((prev) => {
      prev.set("agent", id);
      return prev;
    });
  };

  const setSubTab = (tab: string) => {
    setSearchParams((prev) => {
      prev.set("tab", tab);
      return prev;
    });
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  if (loading) {
    return (
      <ClientRouteViewport>
        <ClientRouteLoading icon={<GraduationCap className="w-7 h-7" />} label="Loading training" />
      </ClientRouteViewport>
    );
  }

  if (agents.length === 0) {
    return (
      <ClientRouteViewport>
        <div className="flex flex-1 items-center justify-center min-h-[50vh] px-4">
          <EmptyState
            icon={GraduationCap}
            title="No agents to train yet"
            description="Create your first agent in Chat, then return here to teach knowledge, voice, pronunciation, and conversational flow."
            actions={[{ label: "Go to Chat", onClick: () => navigate("/chat"), primary: true }]}
          />
        </div>
      </ClientRouteViewport>
    );
  }

  return (
    <ClientRouteViewport>
      <HubTabs tabs={TRAINING_HUB} label="Training hub" className="mb-1 md:mb-2" />
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        <aside className="shrink-0 lg:w-[280px] flex flex-col">
          <div className="lg:hidden flex items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => selectAgent(agent.id)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3.5 py-2 border transition-all text-[12px] min-h-[40px] rounded-lg",
                  agent.id === selectedAgentId
                    ? "border-brand/45 bg-brand/12 text-ink font-semibold shadow-md shadow-brand/10"
                    : "border-black/8 glass text-muted hover:border-brand/25",
                )}
              >
                <Bot className="w-4 h-4 shrink-0" />
                <span className="truncate max-w-[120px]">{agent.name}</span>
              </button>
            ))}
          </div>

          <div className="hidden lg:flex flex-col gap-1.5 h-full max-h-[calc(100dvh-12rem)] overflow-y-auto scrollbar-hide border border-black/8 glass p-3 relative">
            <p className="px-2 py-1.5 mb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-brand/70 font-semibold">
              Select Agent
            </p>
            <div className="space-y-1.5">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => selectAgent(agent.id)}
                  className={cn(
                    "w-full text-left flex items-center gap-2.5 px-3 py-2.5 transition-all rounded-lg border group relative overflow-hidden",
                    agent.id === selectedAgentId
                      ? "border-brand/35 text-ink"
                      : "border-transparent hover:bg-brand/[0.03] hover:border-brand/12 text-muted",
                  )}
                  style={
                    agent.id === selectedAgentId
                      ? {
                          background:
                            "linear-gradient(135deg, rgba(139, 63, 214, 0.08), rgba(139, 63, 214, 0.04))",
                        }
                      : undefined
                  }
                >
                  {agent.id === selectedAgentId && (
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[3px]"
                      style={{ background: "linear-gradient(to bottom, #8B3FD6, #6B2B99)" }}
                    />
                  )}
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors",
                      agent.id === selectedAgentId
                        ? "border-brand/30 bg-brand/12 text-brand"
                        : "border-black/8 bg-black/[0.02] text-muted group-hover:text-brand group-hover:border-brand/20 group-hover:bg-brand/5",
                    )}
                  >
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-[12px] truncate leading-tight",
                        agent.id === selectedAgentId
                          ? "font-semibold text-ink"
                          : "font-medium text-ink/80",
                      )}
                    >
                      {agent.name}
                    </p>
                    {agent.role && (
                      <p className="text-[10px] text-muted/70 truncate capitalize mt-0.5">
                        {agent.role.replace(/_/g, " ")}
                      </p>
                    )}
                  </div>
                  {agent.id === selectedAgentId && (
                    <ChevronRight className="w-3.5 h-3.5 text-brand/55 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 min-h-0 flex flex-col border border-black/8 glass overflow-hidden relative">
          <header className="shrink-0 border-b border-black/6 bg-paper/60 backdrop-blur-sm px-3 sm:px-4 pt-3 pb-2 lg:pt-2">
            <div className="lg:hidden flex items-center gap-2 mb-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                <GraduationCap className="w-4 h-4 text-brand" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted">Training</p>
                <h1 className="text-sm font-semibold text-ink truncate">
                  {selectedAgent?.name ?? "Agent"}
                </h1>
              </div>
            </div>
            <ClientSubTabs
              tabs={[...SUB_TABS]}
              activeId={activeSubTab}
              onChange={setSubTab}
              aria-label="Training modules"
              className="mb-0"
            />
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <AnimatePresence mode="wait">
              {selectedAgentId && (
                <motion.div
                  key={`${selectedAgentId}-${activeSubTab}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  className="h-full min-h-0"
                >
                  <AgentTraining
                    embeddedAgentId={selectedAgentId}
                    initialSubTab={activeSubTab}
                    onSubTabChange={setSubTab}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </ClientRouteViewport>
  );
}
