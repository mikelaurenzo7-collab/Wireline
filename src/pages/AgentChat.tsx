/**
 * AgentChat — the dedicated per-agent chat workspace page.
 *
 * The chat is the primary control surface: operators direct each agent in
 * plain language and approve the config changes, capability toggles, and
 * outbound actions the agent proposes. To avoid role/job confusion, every
 * agent gets its OWN thread + page; a persistent left rail switches between
 * them (collapsing to a horizontal switcher on mobile).
 *
 * Gating: this page is only reachable when the operator has ≥1 agent. The
 * nav item is hidden otherwise (see Sidebar/TopBar), and accessing the route
 * directly with zero agents renders a friendly empty state rather than a
 * dead chat surface.
 */
import React, { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { MessagesSquare, Plus } from "lucide-react";
import AgentWorkspace from "../components/AgentWorkspace";
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

  if (loading) {
    return <div className="min-h-[60vh]" aria-busy="true" />;
  }

  // No agents → friendly empty state. The nav already hides Chat in this
  // case, but a direct visit (bookmark, stale link) lands here.
  if (!hasAgents) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-24 px-6 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
          <MessagesSquare className="w-6 h-6 text-brand" />
        </div>
        <h1 className="font-display italic text-2xl text-ink mb-2">No agents yet</h1>
        <p className="text-[13px] text-muted leading-relaxed mb-6">
          Chat is where you direct your agents in plain language — adjust their voice, switch on new
          capabilities, and send follow-ups with one tap. Create your first agent to begin.
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
      <aside className="shrink-0 lg:w-60">
        <div className="hidden lg:block text-[10px] uppercase tracking-[0.22em] text-muted/70 px-2 mb-2">
          Your agents
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
                    "shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold",
                    isActive
                      ? "bg-brand text-on-brand"
                      : "bg-paper border border-black/12 text-ink",
                  )}
                  aria-hidden="true"
                >
                  {a.name.slice(0, 1).toUpperCase()}
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

      {/* Active agent's chat */}
      <motion.div
        key={activeId}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 min-h-0 rounded-2xl border border-black/8 glass overflow-hidden"
      >
        <AgentWorkspace agentId={activeId} agentName={activeName} />
      </motion.div>
    </div>
  );
}
