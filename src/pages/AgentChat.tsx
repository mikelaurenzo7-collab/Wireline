/**
 * AgentChat — Wireline's primary control surface ("mission control").
 *
 * Refactored with shadcn/ui design system. Three-pane layout:
 *   - Rail: Director + agent list (ScrollArea on desktop)
 *   - Center: conversation workspace
 *   - Dock: mission-control panel (xl+ only, slide-over on mobile)
 */
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
import { ScrollArea } from "../components/ui/shadcn/ScrollArea";
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
          icon={
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
              <Compass className="w-6 h-6" />
            </div>
          }
          label="Loading chat"
        />
      </ClientRouteViewport>
    );
  }

  const activeAgent = isDirector ? undefined : selected;
  const showDirector = isDirector || !activeAgent;

  return (
    <ClientRouteViewport>
      <HubTabs tabs={TRAINING_HUB} label="Training hub" className="mb-2 shrink-0" />
      <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 flex-1 min-h-0">
        {/* ── Rail ─────────────────────────────────────────────── */}
        <aside className="shrink-0 lg:w-52">
          <div className="relative">
            <ScrollArea className="h-full">
              <div className="flex lg:flex-col gap-1 lg:gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 pr-1 sm:pr-0">
                {/* Director button */}
                <motion.button
                  onClick={() => navigate("/chat")}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className={cn(
                    "shrink-0 lg:w-full text-left rounded-lg px-2.5 py-2 border transition-all flex items-center gap-2 min-h-11 lg:min-h-0",
                    showDirector
                      ? "border-primary/30 bg-primary/[0.06] shadow-sm shadow-primary/10"
                      : "border-transparent hover:bg-accent hover:border-primary/15",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all",
                      showDirector
                        ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Compass className="w-3.5 h-3.5" />
                  </span>
                  <span className="min-w-0 hidden sm:block flex-1">
                    <span className="flex items-center justify-between gap-1">
                      <span className="block text-xs font-medium text-foreground truncate max-w-[7rem] lg:max-w-none">
                        Director
                      </span>
                      {agents.length > 0 && (
                        <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-muted text-[9px] font-mono font-semibold text-muted-foreground px-1">
                          {agents.length}
                        </span>
                      )}
                    </span>
                  </span>
                </motion.button>

                {/* Agent items */}
                {agents.map((a) => {
                  const isActive = !showDirector && a.id === activeAgent?.id;
                  return (
                    <motion.button
                      key={a.id}
                      onClick={() => navigate(`/chat/${a.id}`)}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className={cn(
                        "shrink-0 lg:w-full text-left rounded-lg px-2.5 py-2 border transition-all flex items-center gap-2 min-h-11 lg:min-h-0",
                        isActive
                          ? "border-primary/30 bg-primary/[0.06] shadow-sm shadow-primary/10"
                          : "border-transparent hover:bg-accent hover:border-primary/15",
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0 w-9 h-9 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold relative transition-all",
                          isActive
                            ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {a.name.slice(0, 1).toUpperCase()}
                        {isActive && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 20 }}
                            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background"
                            style={{ background: "#10b981" }}
                          >
                            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
                          </motion.span>
                        )}
                      </span>
                      <span className="min-w-0 hidden sm:block">
                        <span className="block text-xs font-medium text-foreground truncate">
                          {a.name}
                        </span>
                        <span className="block text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 truncate">
                          {roleLabel(a.role)}
                        </span>
                      </span>
                    </motion.button>
                  );
                })}

                {/* Add agent */}
                <motion.button
                  onClick={() => navigate("/agents")}
                  whileHover={{ scale: 1.02, borderStyle: "solid" }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  className="shrink-0 lg:w-full text-left rounded-lg px-2.5 py-2 border border-dashed border-border text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all flex items-center gap-2 lg:mt-1 min-h-11 lg:min-h-0"
                >
                  <span className="shrink-0 w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-muted border flex items-center justify-center">
                    <Plus className="w-3.5 h-3.5" />
                  </span>
                  <span className="hidden sm:block text-xs font-medium truncate">
                    {agents.length === 0 ? "Create first" : "Add"}
                  </span>
                </motion.button>
              </div>
            </ScrollArea>
            <div className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-gradient-to-r from-background to-transparent lg:hidden" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-background to-transparent lg:hidden" />
          </div>
        </aside>

        {/* ── Conversation ─────────────────────────────────────── */}
        <motion.div
          key={showDirector ? "director" : activeAgent?.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 min-w-0 min-h-0 rounded-lg border bg-card overflow-hidden"
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

        {/* ── Dock ─────────────────────────────────────────────── */}
        {!showDirector && activeAgent && (
          <>
            <aside className="hidden xl:block xl:w-[18rem] shrink-0 min-h-0">
              <AgentDock
                key={activeAgent.id}
                agentId={activeAgent.id}
                agentName={activeAgent.name}
                enabledTools={liveTools}
                onLaunch={launchPrompt}
              />
            </aside>

            {/* Mobile dock trigger with enhanced animation */}
            <motion.button
              onClick={() => setDockOpen(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="xl:hidden fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-4 z-30 inline-flex items-center gap-2 px-4 min-h-11 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 text-sm font-medium"
              aria-label="Open mission control"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Control</span>
              <motion.span
                initial={{ scale: 1 }}
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50"
                aria-hidden="true"
              />
            </motion.button>

            <AnimatePresence>
              {dockOpen && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setDockOpen(false)}
                    className="xl:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                  />
                  <motion.aside
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 30, stiffness: 320 }}
                    className="xl:hidden fixed top-0 right-0 bottom-0 z-50 w-[92vw] max-w-sm px-4 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-[max(1rem,env(safe-area-inset-bottom,0px))] bg-background border-l"
                  >
                    <div className="flex items-center justify-end mb-2">
                      <button
                        onClick={() => setDockOpen(false)}
                        className="w-11 h-11 sm:w-8 sm:h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        aria-label="Close mission control"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="h-[calc(100%-2.5rem)]">
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
