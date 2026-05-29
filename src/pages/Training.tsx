/**
 * Training — Dedicated sidebar page for agent training & customization.
 *
 * Elevates training from a tab within the chat workspace to its own
 * first-class surface. Operators land here to teach, tune, and refine
 * their agents: knowledge base, voice cloning, pronunciation rules,
 * call simulation, and conversational flow design.
 *
 * Layout: agent selector rail (left) + training workspace (right).
 * Mobile: agent selector becomes a horizontal pill switcher at the top.
 */
import React, { useState } from "react";
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

  const [_mobileAgentOpen, setMobileAgentOpen] = useState(false);

  const selectAgent = (id: string) => {
    setSearchParams((prev) => {
      prev.set("agent", id);
      return prev;
    });
    setMobileAgentOpen(false);
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
      <div className="flex items-center justify-center min-h-[60vh]" aria-busy="true">
        <div className="flex flex-col items-center gap-3 animate-pulse">
          <GraduationCap className="w-8 h-8 text-brand/40" />
          <span className="text-sm text-muted">Loading training…</span>
        </div>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-sm space-y-4 px-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-brand/8 flex items-center justify-center">
            <GraduationCap className="w-8 h-8 text-brand/60" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">No agents to train</h2>
          <p className="text-sm text-muted leading-relaxed">
            Create your first agent in Chat, then come back here to teach it everything it needs to
            know — knowledge, voice, pronunciation, and conversational flow.
          </p>
          <button
            onClick={() => navigate("/chat")}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand/90 transition-colors"
          >
            Go to Chat
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:gap-4 h-[calc(var(--app-vvh,100dvh)-7rem)] sm:h-[calc(var(--app-vvh,100dvh)-9rem)] lg:h-[calc(100dvh-8.5rem)] min-h-[400px]">
      {/* ─── Agent Selector Rail ────────────────────────────────────── */}
      {/* Desktop: vertical rail. Mobile: horizontal pill switcher */}
      <aside className="shrink-0 lg:w-52">
        {/* Mobile: horizontal scrolling agent pills */}
        <div className="lg:hidden">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => selectAgent(agent.id)}
                className={cn(
                  "shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-sm",
                  agent.id === selectedAgentId
                    ? "border-brand/40 bg-brand/[0.06] text-foreground font-medium"
                    : "border-border/50 bg-surface/50 text-muted hover:border-brand/20 hover:bg-brand/[0.03]",
                )}
              >
                <Bot className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[120px]">{agent.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Desktop: vertical agent list */}
        <div className="hidden lg:flex flex-col gap-1 h-full overflow-y-auto scrollbar-hide rounded-xl border border-border/50 bg-surface/30 p-2">
          <div className="px-2 py-1.5 mb-1">
            <h3 className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted/70">
              Select Agent
            </h3>
          </div>
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => selectAgent(agent.id)}
              className={cn(
                "w-full text-left flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-all group",
                agent.id === selectedAgentId
                  ? "bg-brand/[0.08] border border-brand/25 text-foreground"
                  : "border border-transparent hover:bg-brand/[0.04] hover:border-brand/10 text-muted",
              )}
            >
              <div
                className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                  agent.id === selectedAgentId
                    ? "bg-brand/15 text-brand"
                    : "bg-muted/8 text-muted/60 group-hover:bg-brand/8 group-hover:text-brand/60",
                )}
              >
                <Bot className="w-3.5 h-3.5" />
              </div>
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
                  <p className="text-[10px] text-muted/60 truncate leading-tight mt-0.5">
                    {agent.role.replace(/_/g, " ")}
                  </p>
                )}
              </div>
              {agent.id === selectedAgentId && (
                <ChevronRight className="w-3.5 h-3.5 text-brand/50 shrink-0" />
              )}
            </button>
          ))}
        </div>
      </aside>

      {/* ─── Training Workspace ─────────────────────────────────────── */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col rounded-xl border border-border/50 bg-surface/20 overflow-hidden">
        {/* Header with sub-tab navigation */}
        <header className="shrink-0 border-b border-border/50 bg-surface/40 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4 text-brand" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-semibold text-foreground truncate">
                {selectedAgent?.name ?? "Training"}
              </h1>
              <p className="text-[11px] text-muted truncate">Teach, tune, and refine your agent</p>
            </div>
          </div>
          {/* Sub-tab pills — horizontally scrollable on mobile */}
          <div className="flex items-center gap-1 px-3 sm:px-4 pb-2 overflow-x-auto scrollbar-hide">
            {SUB_TABS.map((tab) => {
              const active = activeSubTab === tab.id;
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setSubTab(tab.id)}
                  className={cn(
                    "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] sm:text-[12px] font-medium transition-all whitespace-nowrap",
                    active
                      ? "bg-brand/10 text-brand border border-brand/20"
                      : "text-muted hover:text-foreground hover:bg-muted/8 border border-transparent",
                  )}
                >
                  <TabIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" strokeWidth={active ? 2.5 : 2} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </header>

        {/* Training content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <AnimatePresence mode="wait">
            {selectedAgentId && (
              <motion.div
                key={selectedAgentId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="h-full"
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
  );
}
