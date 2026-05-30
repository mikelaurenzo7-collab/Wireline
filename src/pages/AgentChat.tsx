/**
 * AgentChat — Wireline's primary control surface ("mission control").
 *
 * Chat is the main page and is ALWAYS rendered. A permanent "Director" sits at
 * the top of the left rail — the account-level AI manager that helps the
 * operator plan, hire, and coach their fleet. It's available from the very
 * first login, before any agents exist, so the chat surface is never a
 * dead-end. When the operator buys/creates agents, each one appears below the
 * Director in the rail with its OWN thread, live pulse, and action launchers.
 *
 * Three panes (desktop): rail (Director + agents) · conversation · the
 * mission-control dock (agents only). On smaller screens the rail collapses to
 * a horizontal switcher and the dock opens as a slide-over.
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
  // Keep the chat (now the primary surface) keyboard-aware on mobile: the
  // composer must stay above the software keyboard, which doesn't shrink dvh.
  useVisualViewportVar();

  // Live capability mirror + composer seed shared between the workspace and
  // the mission-control dock.
  const [liveTools, setLiveTools] = useState<string[]>([]);
  const [composerSeed, setComposerSeed] = useState<{ text: string; nonce: number }>({
    text: "",
    nonce: 0,
  });
  const [dockOpen, setDockOpen] = useState(false);
  const nonceRef = useRef(0);

  // The Director is the default. Any other id resolves to an owned agent.
  const isDirector = !id || id === DIRECTOR_ID;
  const selected = isDirector ? undefined : agents.find((a) => a.id === id);

  useEffect(() => {
    if (loading || isDirector) return;
    // Unknown / no-longer-owned agent id → fall back to the Director rather
    // than a dead URL. Deep links to a real agent still resolve directly.
    if (!selected) {
      navigate("/chat", { replace: true });
    }
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
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand to-brand-deep text-on-brand flex items-center justify-center shadow-lg shadow-brand/20">
              <Compass className="w-6 h-6" />
            </div>
          }
          label="Loading chat"
        />
      </ClientRouteViewport>
    );
  }

  // Resolve the active agent (when not on the Director). While an unknown id
  // redirects, fall back to the Director view so we never read undefined.
  const activeAgent = isDirector ? undefined : selected;
  const showDirector = isDirector || !activeAgent;

  return (
    <ClientRouteViewport>
      <HubTabs tabs={TRAINING_HUB} label="Training hub" className="mb-1 md:mb-2 shrink-0" />
      <div className="flex flex-col lg:flex-row gap-2 lg:gap-4 flex-1 min-h-0">
        {/* Rail — Director pinned on top, fleet below. Vertical on desktop,
          compact horizontal switcher on mobile. */}
        <aside className="shrink-0 lg:w-56">
          <div className="flex lg:flex-col gap-1.5 lg:gap-1.5 overflow-x-auto lg:overflow-visible scrollbar-hide pb-0.5 lg:pb-0">
            {/* Director — always present */}
            <button
              onClick={() => navigate("/chat")}
              className={cn(
                "shrink-0 lg:w-full text-left rounded-xl px-2 lg:px-3 py-1.5 lg:py-2.5 border transition-all duration-300 flex items-center gap-1.5 min-h-[36px] lg:min-h-0",
                showDirector
                  ? "border-brand/40 bg-brand/[0.06] shadow-sm shadow-brand/5 aurora-ring"
                  : "border-black/8 glass hover:border-brand/25 hover:-translate-y-px",
              )}
            >
              <span
                className={cn(
                  "shrink-0 w-7 h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center relative transition-transform",
                  showDirector
                    ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25"
                    : "bg-paper border border-black/12 text-ink",
                )}
                aria-hidden="true"
              >
                <Compass className="w-3.5 h-3.5" />
              </span>
              <span className="min-w-0 hidden sm:block">
                {/* Mobile-first: 10px body on <sm (user preference for dense mobile), 12px on lg+. 36px+ tap targets enforced on rail items. */}
                <span className="block text-[10px] lg:text-[12px] font-medium text-ink truncate max-w-[7rem] lg:max-w-none">
                  Director
                </span>
              </span>
            </button>

            {agents.map((a) => {
              const isActive = !showDirector && a.id === activeAgent?.id;
              return (
                <button
                  key={a.id}
                  onClick={() => navigate(`/chat/${a.id}`)}
                  className={cn(
                    // Mobile-first dense: 36px min tap target (Apple HIG + user preference), tighter 1.5px py on mobile, 10-11px text.
                    "shrink-0 lg:w-full text-left rounded-xl px-2 lg:px-3 py-1.5 lg:py-2.5 border transition-all duration-300 flex items-center gap-1.5 min-h-[36px] lg:min-h-0",
                    isActive
                      ? "border-brand/40 bg-brand/[0.06] shadow-sm shadow-brand/5 aurora-ring"
                      : "border-black/8 glass hover:border-brand/25 hover:-translate-y-px",
                  )}
                >
                  <span
                    className={cn(
                      "shrink-0 w-7 h-7 lg:w-8 lg:h-8 rounded-full flex items-center justify-center text-[11px] font-semibold relative transition-transform",
                      isActive
                        ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25"
                        : "bg-paper border border-black/12 text-ink",
                    )}
                    aria-hidden="true"
                  >
                    {a.name.slice(0, 1).toUpperCase()}
                    {isActive && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-paper" />
                    )}
                  </span>
                  <span className="min-w-0 hidden sm:block">
                    <span className="block text-[10px] lg:text-[12px] font-medium text-ink truncate max-w-[7rem] lg:max-w-none">
                      {a.name}
                    </span>
                    <span className="block text-[9px] lg:text-[10px] uppercase tracking-[0.18em] text-muted/70 truncate">
                      {roleLabel(a.role)}
                    </span>
                  </span>
                </button>
              );
            })}

            {/* Add-agent affordance */}
            <button
              onClick={() => navigate("/agents")}
              className="shrink-0 lg:w-full text-left rounded-xl px-2 lg:px-3 py-1.5 lg:py-2.5 border border-dashed border-black/15 text-muted hover:border-brand/30 hover:text-ink transition-all flex items-center gap-1.5 lg:mt-1 min-h-[36px] lg:min-h-0"
            >
              <span className="shrink-0 w-7 h-7 lg:w-8 lg:h-8 rounded-full bg-black/[0.03] border border-black/10 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </span>
              <span className="hidden sm:block text-[10px] lg:text-[12px] font-medium truncate">
                {agents.length === 0 ? "Create first" : "Add"}
              </span>
            </button>
          </div>
        </aside>

        {/* Conversation */}
        <motion.div
          key={showDirector ? "director" : activeAgent?.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="flex-1 min-w-0 min-h-0 rounded-2xl border border-black/8 glass overflow-hidden"
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

        {/* Mission-control dock — agents only (the Director routes via chips). */}
        {!showDirector && activeAgent && (
          <>
            <aside className="hidden xl:block xl:w-[19rem] shrink-0 min-h-0">
              <AgentDock
                key={activeAgent.id}
                agentId={activeAgent.id}
                agentName={activeAgent.name}
                enabledTools={liveTools}
                onLaunch={launchPrompt}
              />
            </aside>

            {/* Mobile / tablet dock trigger */}
            <button
              onClick={() => setDockOpen(true)}
              className="xl:hidden fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom,0px))] right-4 z-30 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-brand text-on-brand shadow-lg shadow-brand/25 text-[12px] font-medium min-h-[44px] active:scale-95 transition-transform"
              aria-label="Open mission control"
            >
              <LayoutDashboard className="w-4 h-4" />
              Control
            </button>

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
                    className="xl:hidden fixed top-0 right-0 bottom-0 z-50 w-[88vw] max-w-sm p-3 bg-paper"
                  >
                    <div className="flex items-center justify-end mb-2">
                      <button
                        onClick={() => setDockOpen(false)}
                        className="w-11 h-11 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-black/5 transition-colors"
                        aria-label="Close mission control"
                      >
                        <X className="w-5 h-5 sm:w-4 sm:h-4" />
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
