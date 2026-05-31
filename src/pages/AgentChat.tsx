import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Plus, LayoutDashboard, X, Compass } from "lucide-react";
import AgentWorkspace from "../components/AgentWorkspace";
import AgentDock from "../components/AgentDock";
import DirectorWorkspace from "../components/DirectorWorkspace";
import { useAgents } from "../contexts/AgentsContext";
import { useVisualViewportVar } from "../lib/use-visual-viewport";
import ClientRouteViewport from "../components/layout/ClientRouteViewport";
import ClientRouteLoading from "../components/layout/ClientRouteLoading";
import HubTabs, { TRAINING_HUB } from "../components/HubTabs";
import { cn } from "../lib/utils";

const DIRECTOR_ID = "director";

const ROLE_LABELS: Record<string, string> = {
  sales: "Sales",
  customer_service: "Customer Service",
  scheduler: "Scheduler",
  collections: "Collections",
  technical_support: "Technical Support",
  lead_qualifier: "Lead Qualifier",
};

function roleLabel(role: string | null): string {
  if (!role) return "Agent";
  return ROLE_LABELS[role] || role.replace(/_/g, " ");
}

export default function AgentChat() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { agents, loading } = useAgents();
  useVisualViewportVar();

  const [liveTools, setLiveTools] = useState<string[]>([]);
  const [composerSeed, setComposerSeed] = useState<{ text: string; nonce: number }>({
    text: "",
    nonce: 0,
  });
  const [dockOpen, setDockOpen] = useState(false);
  const nonceRef = useRef(0);

  const isDirector = !id || id === DIRECTOR_ID;
  const selected = isDirector ? undefined : agents.find((a) => a.id === id);

  useEffect(() => {
    if (loading || isDirector) return;
    if (!selected) navigate("/chat", { replace: true });
  }, [loading, isDirector, selected, navigate]);

  const launchPrompt = (text: string) => {
    nonceRef.current += 1;
    setComposerSeed({ text, nonce: nonceRef.current });
    setDockOpen(false);
  };

  if (loading) {
    return (
      <ClientRouteViewport>
        <ClientRouteLoading
          icon={<Compass className="w-7 h-7 animate-spin-slow" />}
          label="Loading cockpit"
        />
      </ClientRouteViewport>
    );
  }

  const activeAgent = isDirector ? undefined : selected;
  const showDirector = isDirector || !activeAgent;

  return (
    <ClientRouteViewport>
      <HubTabs tabs={TRAINING_HUB} label="Training hub" className="mb-3 shrink-0" />

      {/* ── Horizontal Agent Selection Bar ── */}
      <div className="shrink-0 mb-3 relative overflow-hidden">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1.5 px-1">
          {/* Director Selection Card */}
          <button
            onClick={() => navigate("/chat")}
            className={cn(
              "group shrink-0 flex items-center gap-2.5 px-4 py-2 border transition-all duration-300 relative overflow-hidden cursor-pointer",
              showDirector
                ? "border-brand/35 bg-white/70 dark:bg-white/5 shadow-[0_4px_16px_rgba(124,58,237,0.06)]"
                : "border-brand/10 bg-white/20 dark:bg-white/[0.02] hover:bg-white/50 dark:hover:bg-white/5 hover:border-brand/20",
            )}
          >
            {showDirector && (
              <span className="absolute inset-0 -z-10 bg-gradient-to-tr from-brand/5 to-brand-deep/5" />
            )}
            <span
              className={cn(
                "shrink-0 w-8 h-8 flex items-center justify-center transition-colors relative overflow-hidden",
                showDirector
                  ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25"
                  : "bg-brand/10 text-brand",
              )}
            >
              <Compass className="w-4 h-4" />
            </span>
            <div className="text-left">
              <span className="block text-[12px] font-semibold text-ink leading-none">
                Director
              </span>
              <span className="block text-[9px] uppercase tracking-[0.1em] text-muted-foreground mt-0.5">
                Strategist
              </span>
            </div>
          </button>

          {/* Spacer */}
          <div className="h-6 w-px bg-brand/15 shrink-0 mx-1" />

          {/* Active Agents list */}
          <div className="flex items-center gap-2">
            {agents.map((a) => {
              const isActive = !showDirector && a.id === activeAgent?.id;
              return (
                <button
                  key={a.id}
                  onClick={() => navigate(`/chat/${a.id}`)}
                  className={cn(
                    "group shrink-0 flex items-center gap-2.5 px-4 py-2 border transition-all duration-300 relative overflow-hidden cursor-pointer",
                    isActive
                      ? "border-brand/35 bg-white/70 dark:bg-white/5 shadow-[0_4px_16px_rgba(124,58,237,0.06)]"
                      : "border-brand/10 bg-white/20 dark:bg-white/[0.02] hover:bg-white/50 dark:hover:bg-white/5 hover:border-brand/20",
                  )}
                >
                  {isActive && (
                    <span className="absolute inset-0 -z-10 bg-gradient-to-tr from-brand/5 to-brand-deep/5" />
                  )}
                  <span
                    className={cn(
                      "shrink-0 w-8 h-8 flex items-center justify-center text-[11px] font-bold relative transition-colors",
                      isActive
                        ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand"
                        : "bg-brand/10 text-brand",
                    )}
                  >
                    {a.name.slice(0, 1).toUpperCase()}
                    {isActive && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-black" />
                    )}
                  </span>
                  <div className="text-left">
                    <span className="block text-[12px] font-semibold text-ink leading-none">
                      {a.name}
                    </span>
                    <span className="block text-[9px] uppercase tracking-[0.1em] text-muted-foreground mt-0.5">
                      {roleLabel(a.role)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Add Agent pill */}
          <button
            onClick={() => navigate("/agents")}
            className="group shrink-0 flex items-center gap-2 px-3.5 py-2.5 border border-dashed border-brand/20 hover:border-brand/40 text-brand hover:bg-brand/[0.02] transition-all duration-300 cursor-pointer"
          >
            <span className="shrink-0 w-8 h-8 bg-brand/5 border border-dashed border-brand/25 flex items-center justify-center group-hover:bg-brand/10 transition-colors">
              <Plus className="w-4 h-4" />
            </span>
            <span className="text-[12px] font-semibold">Deploy Agent</span>
          </button>
        </div>
      </div>

      {/* ── Main Layout Workspace Split ── */}
      <div className="flex-1 flex gap-3 lg:gap-4 min-h-0 min-w-0">
        {/* Active Workspace View — no outer box, content lives directly on background */}
        <motion.div
          key={showDirector ? "director" : activeAgent?.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden"
        >
          {showDirector ? (
            <DirectorWorkspace />
          ) : (
            <AgentWorkspace
              agentId={activeAgent!.id}
              agentName={activeAgent!.name}
              onToolsChange={setLiveTools}
              composerSeed={composerSeed}
            />
          )}
        </motion.div>

        {/* Agent Dock — no outer box, renders directly */}
        {!showDirector && activeAgent && (
          <>
            <aside className="hidden xl:flex xl:w-[20rem] shrink-0 min-h-0 flex-col overflow-hidden border-l border-black/[0.06] dark:border-brand/[0.10]">
              <AgentDock
                key={activeAgent.id}
                agentId={activeAgent.id}
                agentName={activeAgent.name}
                enabledTools={liveTools}
                onLaunch={launchPrompt}
              />
            </aside>

            {/* Floating Mobile Trigger */}
            <button
              onClick={() => setDockOpen(true)}
              className="xl:hidden fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-4 z-30 inline-flex items-center gap-2.5 px-5 py-3 bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-lg shadow-brand/25 text-sm font-semibold active:scale-95 transition-all cursor-pointer"
              aria-label="Open mission control"
            >
              <LayoutDashboard className="w-4 h-4" />
              Mission Control
            </button>

            <AnimatePresence>
              {dockOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setDockOpen(false)}
                    className="xl:hidden fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm"
                  />
                  <motion.aside
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 30, stiffness: 320 }}
                    className="xl:hidden fixed top-0 right-0 bottom-0 z-[85] w-[90vw] max-w-sm px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] bg-background border-l border-brand/15 flex flex-col"
                  >
                    <div className="flex items-center justify-end mb-2">
                      <button
                        onClick={() => setDockOpen(false)}
                        className="w-10 h-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-brand/5 transition-colors cursor-pointer"
                        aria-label="Close mission control"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      <AgentDock
                        agentId={activeAgent.id}
                        agentName={activeAgent.name}
                        enabledTools={liveTools}
                        onLaunch={launchPrompt}
                      />
                    </div>
                  </motion.aside>
                </>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </ClientRouteViewport>
  );
}