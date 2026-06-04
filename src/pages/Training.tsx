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
import { EmptyState } from "../components/ui/EmptyState";
import { cn } from "../lib/utils";
import { ShadButton } from "../components/ui/shadcn/ShadButton";

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
      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0">
        <aside className="shrink-0 lg:w-[260px] flex flex-col">
          {/* Mobile: horizontal orbit strip */}
          <div className="lg:hidden flex items-center gap-2 overflow-x-auto scrollbar-hide scroll-viewport pb-2 stagger-children">
            {agents.map((agent) => (
              <ShadButton
                key={agent.id}
                type="button"
                disableAnimations
                variant={agent.id === selectedAgentId ? "secondary" : "ghost"}
                onClick={() => selectAgent(agent.id)}
                className={cn(
                  "touch-press shrink-0 h-auto gap-2 px-3 py-2 text-[12px] min-h-[40px]",
                  agent.id === selectedAgentId
                    ? "wl-panel-elevated font-semibold text-ink"
                    : "text-muted hover:bg-white/40 dark:hover:bg-white/[0.04]",
                )}
              >
                <span className="wl-orbit" data-active={agent.id === selectedAgentId}>
                  <span
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors",
                      agent.id === selectedAgentId
                        ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand"
                        : "bg-brand/8 text-brand",
                    )}
                  >
                    <Bot className="w-3.5 h-3.5" />
                  </span>
                </span>
                <span className="truncate max-w-[100px]">{agent.name}</span>
              </ShadButton>
            ))}
          </div>

          {/* Desktop: vertical agent list with specular depth */}
          <div className="hidden lg:flex flex-col gap-1.5 h-full max-h-[calc(100dvh-12rem)] scroll-viewport wl-panel p-3 relative">
            <p className="px-2 py-1.5 mb-1 wl-label text-brand/70">Select Agent</p>
            <div className="space-y-1 stagger-children">
              {agents.map((agent) => (
                <ShadButton
                  key={agent.id}
                  type="button"
                  disableAnimations
                  variant={agent.id === selectedAgentId ? "secondary" : "ghost"}
                  onClick={() => selectAgent(agent.id)}
                  className={cn(
                    "touch-press w-full h-auto justify-start text-left gap-2.5 px-3 py-2.5 group relative overflow-hidden",
                    agent.id === selectedAgentId
                      ? "wl-panel-elevated text-ink"
                      : "hover:bg-brand/[0.03] text-muted",
                  )}
                >
                  <span className="wl-orbit" data-active={agent.id === selectedAgentId}>
                    <span
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors",
                        agent.id === selectedAgentId
                          ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand"
                          : "bg-brand/8 text-brand group-hover:bg-brand/12",
                      )}
                    >
                      <Bot className="w-4 h-4" />
                    </span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-[12px] truncate leading-tight tracking-[-0.01em]",
                        agent.id === selectedAgentId
                          ? "font-semibold text-ink"
                          : "font-medium text-ink/80",
                      )}
                    >
                      {agent.name}
                    </p>
                    {agent.role && (
                      <p className="text-[10px] text-ink/40 truncate capitalize mt-0.5">
                        {agent.role.replace(/_/g, " ")}
                      </p>
                    )}
                  </div>
                  {agent.id === selectedAgentId && (
                    <ChevronRight className="w-3.5 h-3.5 text-brand/55 shrink-0" />
                  )}
                </ShadButton>
              ))}
            </div>
          </div>
        </aside>

        {/* Main content — elevated workspace panel */}
        <main className="flex-1 min-w-0 min-h-0 flex flex-col wl-panel-elevated overflow-hidden relative">
          <header className="shrink-0 border-b border-brand/6 bg-white/40 dark:bg-black/20 backdrop-blur-sm px-3 sm:px-4 pt-3 pb-2 lg:pt-2">
            <div className="lg:hidden flex items-center gap-2 mb-2 min-w-0">
              <span className="wl-orbit" data-active="true">
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-brand/15 to-brand/8 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4 text-brand" />
                </span>
              </span>
              <div className="min-w-0">
                <p className="wl-label text-muted">Training</p>
                <h1 className="text-sm font-semibold text-ink truncate tracking-[-0.01em]">
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

          <div className="flex-1 min-h-0 scroll-viewport">
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
