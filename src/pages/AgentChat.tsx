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
      <HubTabs tabs={TRAINING_HUB} label="Training hub" className="mb-2 shrink-0" />

      {/* ── Agent Orbit Strip — Wireline Identity ──
       * Horizontal selection with orbital activity indicators.
       * Each agent avatar shows a pulsing orbit ring when active. */}
      <div className="shrink-0 mb-2 relative overflow-hidden">
        <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-hide py-1.5 px-1 scroll-viewport">
          {/* Director — orbital indicator */}
          <button
            onClick={() => navigate("/chat")}
            className={cn(
              "touch-press group shrink-0 flex items-center gap-2.5 px-3.5 py-2 transition-all duration-200 relative overflow-hidden cursor-pointer",
              showDirector ? "wl-panel-elevated" : "hover:bg-white/40 dark:hover:bg-white/[0.04]",
            )}
          >
            <span className="wl-orbit" data-active={showDirector}>
              <span
                className={cn(
                  "shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors relative overflow-hidden",
                  showDirector
                    ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25"
                    : "bg-brand/8 text-brand",
                )}
              >
                <Compass className="w-4 h-4" />
              </span>
            </span>
            <div className="text-left">
              <span className="block text-[12px] font-semibold text-ink leading-none tracking-[-0.01em]">
                Director
              </span>
              <span className="block wl-label text-muted-foreground mt-0.5 opacity-70">
                Strategist
              </span>
            </div>
          </button>

          {/* Ambient divider */}
          <div className="h-7 w-px bg-gradient-to-b from-transparent via-brand/15 to-transparent shrink-0 mx-0.5" />

          {/* Active Agents — orbital ring per agent */}
          <div className="flex items-center gap-2">
            {agents.map((a) => {
              const isActive = !showDirector && a.id === activeAgent?.id;
              return (
                <button
                  key={a.id}
                  onClick={() => navigate(`/chat/${a.id}`)}
                  className={cn(
                    "touch-press group shrink-0 flex items-center gap-2.5 px-3.5 py-2 transition-all duration-200 relative overflow-hidden cursor-pointer",
                    isActive ? "wl-panel-elevated" : "hover:bg-white/40 dark:hover:bg-white/[0.04]",
                  )}
                >
                  <span className="wl-orbit" data-active={isActive}>
                    <span
                      className={cn(
                        "shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold relative transition-colors",
                        isActive
                          ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand"
                          : "bg-brand/8 text-brand",
                      )}
                    >
                      {a.name.slice(0, 1).toUpperCase()}
                    </span>
                  </span>
                  <div className="text-left">
                    <span className="block text-[12px] font-semibold text-ink leading-none tracking-[-0.01em]">
                      {a.name}
                    </span>
                    <span className="block wl-label text-muted-foreground mt-0.5 opacity-70">
                      {roleLabel(a.role)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Deploy Agent — dashed orbit invite */}
          <button
            onClick={() => navigate("/agents")}
            className="touch-press group shrink-0 flex items-center gap-2 px-3.5 py-2 text-brand hover:bg-brand/[0.03] transition-all duration-200 cursor-pointer"
          >
            <span className="shrink-0 w-9 h-9 rounded-full border border-dashed border-brand/25 flex items-center justify-center group-hover:border-brand/40 group-hover:bg-brand/5 transition-colors">
              <Plus className="w-4 h-4" />
            </span>
            <span className="text-[12px] font-semibold tracking-[-0.01em]">Deploy</span>
          </button>
        </div>
      </div>

      {/* ── Main Workspace — Specular Depth Container ── */}
      <div className="flex-1 flex gap-3 lg:gap-4 min-h-0 min-w-0">
        {/* Active Workspace View — isolated scroll viewport */}
        <motion.div
          key={showDirector ? "director" : activeAgent?.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 min-w-0 min-h-0 wl-panel-elevated overflow-hidden flex flex-col"
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

        {/* Agent Dock — specular side panel */}
        {!showDirector && activeAgent && (
          <>
            <aside className="hidden xl:block xl:w-[20rem] shrink-0 min-h-0 wl-panel overflow-hidden">
              <AgentDock
                key={activeAgent.id}
                agentId={activeAgent.id}
                agentName={activeAgent.name}
                enabledTools={liveTools}
                onLaunch={launchPrompt}
              />
            </aside>

            {/* Floating Mobile Trigger — touch-press feedback */}
            <button
              onClick={() => setDockOpen(true)}
              className="touch-press xl:hidden fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-4 z-30 inline-flex items-center gap-2.5 px-5 py-3 rounded-full bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-lg shadow-brand/25 text-sm font-semibold transition-all cursor-pointer"
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
                    className="xl:hidden fixed inset-0 z-[80] bg-black/50 backdrop-blur-md"
                  />
                  <motion.aside
                    initial={{ y: "100%" }}
                    animate={{ y: 0 }}
                    exit={{ y: "100%" }}
                    transition={{ type: "spring", damping: 32, stiffness: 340 }}
                    className="xl:hidden fixed left-0 right-0 bottom-0 z-[85] max-h-[85dvh] rounded-t-2xl px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom,0px))] wl-panel-elevated flex flex-col"
                  >
                    {/* Bottom sheet drag handle */}
                    <div className="flex justify-center mb-3">
                      <div className="w-9 h-1 rounded-full bg-ink/15 dark:bg-white/20" />
                    </div>
                    <div className="flex items-center justify-between mb-2 px-1">
                      <span className="wl-label text-muted">Mission Control</span>
                      <button
                        onClick={() => setDockOpen(false)}
                        className="touch-press w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-brand/5 transition-colors cursor-pointer"
                        aria-label="Close mission control"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex-1 min-h-0 scroll-viewport">
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
