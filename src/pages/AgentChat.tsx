/**
 * AgentChat — Wireline's primary control surface ("mission control").
 *
 * Chat is the main page: operators direct each agent in plain language and
 * approve the config changes, capability toggles, and outbound actions
 * (calls / emails / texts / bookings) the agent proposes. To avoid role/job
 * confusion, every agent gets its OWN thread; a persistent left rail switches
 * between them and a right-hand dock frames the conversation with the agent's
 * live pulse, full capability map, and one-tap action launchers.
 *
 * Three panes (desktop): agent rail · conversation · mission-control dock.
 * On smaller screens the rail collapses to a horizontal switcher and the dock
 * opens as a slide-over. Accessing /chat with zero agents renders a friendly
 * onboarding state instead of a dead surface.
 */
import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { MessagesSquare, Plus, LayoutDashboard, X } from "lucide-react";
import AgentWorkspace from "../components/AgentWorkspace";
import AgentDock from "../components/AgentDock";
import { useAgents } from "../contexts/AgentsContext";
import { cn } from "../lib/utils";

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
  const { agents, loading, hasAgents } = useAgents();

  // Live capability mirror + composer seed shared between the workspace and
  // the mission-control dock.
  const [liveTools, setLiveTools] = useState<string[]>([]);
  const [composerSeed, setComposerSeed] = useState<{ text: string; nonce: number }>({
    text: "",
    nonce: 0,
  });
  const [dockOpen, setDockOpen] = useState(false);
  const nonceRef = useRef(0);

  // Resolve which agent is selected. With no :id, land on the first agent.
  const selected = id ? agents.find((a) => a.id === id) : agents[0];

  useEffect(() => {
    if (loading) return;
    if (!hasAgents) return;
    // Redirect bare /chat (or an unknown id) to the first agent's chat so
    // the URL is always deep-linkable and shareable.
    if (!id || !selected) {
      navigate(`/chat/${agents[0].id}`, { replace: true });
    }
  }, [loading, hasAgents, id, selected, agents, navigate]);

  const launchPrompt = (text: string) => {
    nonceRef.current += 1;
    setComposerSeed({ text, nonce: nonceRef.current });
    setDockOpen(false);
  };

  if (loading) {
    return <div className="min-h-[60vh]" aria-busy="true" />;
  }

  // No agents → friendly onboarding state. Chat is always reachable (it's the
  // main page), so a zero-agent operator lands here and is guided to create.
  if (!hasAgents) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-24 px-6 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
          <MessagesSquare className="w-6 h-6 text-brand" />
        </div>
        <h1 className="font-display italic text-2xl text-ink mb-2">Your control room awaits</h1>
        <p className="text-[13px] text-muted leading-relaxed mb-6">
          Chat is where you run your fleet in plain language — adjust each agent's voice, switch on
          new capabilities, and launch calls, emails, and texts with one tap. Create your first
          agent to begin.
        </p>
        <button
          onClick={() => navigate("/agents")}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-on-brand text-[13px] font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Create an agent
        </button>
      </div>
    );
  }

  const activeId = selected?.id ?? agents[0].id;
  const activeName = selected?.name ?? agents[0].name;

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100dvh-9rem)] min-h-[480px]">
      {/* Agent rail — vertical on desktop, horizontal switcher on mobile */}
      <aside className="shrink-0 lg:w-56">
        <div className="hidden lg:block text-[10px] uppercase tracking-[0.22em] text-muted/70 px-2 mb-2">
          Your fleet
        </div>
        <div className="flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible scrollbar-hide pb-1 lg:pb-0">
          {agents.map((a) => {
            const isActive = a.id === activeId;
            return (
              <button
                key={a.id}
                onClick={() => navigate(`/chat/${a.id}`)}
                className={cn(
                  "shrink-0 lg:w-full text-left rounded-xl px-3 py-2.5 border transition-all flex items-center gap-2.5",
                  isActive
                    ? "border-brand/40 bg-brand/[0.06]"
                    : "border-black/8 glass hover:border-brand/25",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold relative",
                    isActive
                      ? "bg-brand text-on-brand"
                      : "bg-paper border border-black/12 text-ink",
                  )}
                  aria-hidden="true"
                >
                  {a.name.slice(0, 1).toUpperCase()}
                  {isActive && (
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-paper" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-medium text-ink truncate max-w-[8.5rem] lg:max-w-none">
                    {a.name}
                  </span>
                  <span className="block text-[10px] uppercase tracking-[0.18em] text-muted/70 truncate">
                    {roleLabel(a.role)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Active agent's conversation */}
      <motion.div
        key={activeId}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 min-w-0 min-h-0 rounded-2xl border border-black/8 glass overflow-hidden"
      >
        <AgentWorkspace
          agentId={activeId}
          agentName={activeName}
          onToolsChange={setLiveTools}
          composerSeed={composerSeed}
        />
      </motion.div>

      {/* Mission-control dock — static column on xl, slide-over below */}
      <aside className="hidden xl:block xl:w-[19rem] shrink-0 min-h-0">
        <AgentDock
          key={activeId}
          agentId={activeId}
          agentName={activeName}
          enabledTools={liveTools}
          onLaunch={launchPrompt}
        />
      </aside>

      {/* Mobile / tablet dock trigger */}
      <button
        onClick={() => setDockOpen(true)}
        className="xl:hidden fixed bottom-20 right-4 z-30 inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-brand text-on-brand shadow-lg text-[12px] font-medium"
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
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-ink hover:bg-black/5 transition-colors"
                  aria-label="Close mission control"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="h-[calc(100%-2.5rem)]">
                <AgentDock
                  agentId={activeId}
                  agentName={activeName}
                  enabledTools={liveTools}
                  onLaunch={launchPrompt}
                />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
