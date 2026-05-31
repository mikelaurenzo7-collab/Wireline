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
        <ClientRouteLoading
          icon={<GraduationCap className="w-8 h-8 text-brand/50" />}
          label="Loading training"
        />
      </ClientRouteViewport>
    );
  }

  if (agents.length === 0) {
    return (
      <ClientRouteViewport>
        <div className="flex flex-1 items-center justify-center min-h-[50vh] px-4">
          <div className="text-center max-w-sm space-y-4">
            <div className="relative w-16 h-16 mx-auto">
              <span
                aria-hidden
                className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150"
              />
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-lg shadow-brand/25 flex items-center justify-center">
                <GraduationCap className="w-8 h-8" />
              </div>
            </div>
            <h2 className="font-display italic text-xl text-ink">No agents to train yet</h2>
            <p className="text-sm text-muted leading-relaxed">
              Create your first agent in Chat, then return here to teach knowledge, voice,
              pronunciation, and conversational flow.
            </p>
            <motion.button
              type="button"
              onClick={() => navigate("/chat")}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand text-on-brand text-sm font-medium hover:bg-brand-deep transition-colors min-h-[44px] shadow-sm shadow-brand/20"
            >
              Go to Chat
              <ChevronRight className="w-4 h-4" />
            </motion.button>
          </div>
        </div>
      </ClientRouteViewport>
    );
  }

  return (
    <ClientRouteViewport>
      <HubTabs tabs={TRAINING_HUB} label="Training hub" className="mb-1 md:mb-2" />
      <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 flex-1 min-h-0">
        <aside className="shrink-0 lg:w-52">
          <div className="lg:hidden flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
            {agents.map((agent) => (
              <motion.button
                key={agent.id}
                type="button"
                onClick={() => selectAgent(agent.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-all text-[12px] min-h-[40px]",
                  agent.id === selectedAgentId
                    ? "border-brand/40 bg-brand/[0.06] text-ink font-medium aurora-ring shadow-sm shadow-brand/10"
                    : "border-black/8 glass text-muted hover:border-brand/25",
                )}
              >
                <Bot className="w-4 h-4 shrink-0" />
                <span className="truncate max-w-[120px]">{agent.name}</span>
              </motion.button>
            ))}
          </div>

          <div className="hidden lg:flex flex-col gap-1 h-full max-h-[calc(100dvh-12rem)] overflow-y-auto scrollbar-hide rounded-xl border border-black/8 glass p-2">
            <p className="px-2 py-1.5 mb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
              Agent
            </p>
            {agents.map((agent) => (
              <motion.button
                key={agent.id}
                type="button"
                onClick={() => selectAgent(agent.id)}
                whileHover={{ scale: 1.02, x: 2 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className={cn(
                  "w-full text-left flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-all group",
                  agent.id === selectedAgentId
                    ? "bg-brand/[0.08] border border-brand/25 text-ink shadow-sm shadow-brand/10"
                    : "border border-transparent hover:bg-brand/[0.04] hover:border-brand/10 text-muted",
                )}
              >
                <motion.div
                  animate={{
                    scale: agent.id === selectedAgentId ? [1, 1.1, 1] : 1,
                  }}
                  transition={{
                    duration: agent.id === selectedAgentId ? 0.4 : 0,
                  }}
                  className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
                    agent.id === selectedAgentId
                      ? "bg-brand/15 text-brand"
                      : "bg-black/[0.04] text-muted group-hover:text-brand/70",
                  )}
                >
                  <Bot className="w-3.5 h-3.5" />
                </motion.div>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-[12px] truncate leading-tight",
                      agent.id === selectedAgentId ? "font-semibold" : "font-medium",
                    )}
                  >
                    {agent.name}
                  </p>
                  {agent.role && (
                    <p className="text-[10px] text-muted/70 truncate capitalize">
                      {agent.role.replace(/_/g, " ")}
                    </p>
                  )}
                </div>
                {agent.id === selectedAgentId && (
                  <motion.div
                    initial={{ x: -4, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-brand/50 shrink-0" />
                  </motion.div>
                )}
              </motion.button>
            ))}
          </div>
        </aside>

        <main className="flex-1 min-w-0 min-h-0 flex flex-col rounded-xl border border-black/8 glass overflow-hidden">
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
