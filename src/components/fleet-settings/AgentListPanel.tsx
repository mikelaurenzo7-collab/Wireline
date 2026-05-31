/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AgentListPanel — Fleet sidebar showing all agents + create form.
 * Extracted from the monolithic FleetSettings.tsx during the 2026 audit.
 */
import { Bot, Mail, Loader2, Shield, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { RoleBadge } from "../fleet/helpers";
import CreateAgentSection from "./CreateAgentSection";
import type { RoleValue } from "../fleet/helpers";

interface Props {
  agents: any[];
  selectedAgent: any | null;
  isLoading: boolean;
  isCreating: boolean;
  isDeletingAgent: string | null;
  agentStats: Record<string, any>;
  subscription: { status: string; max_agents: number | null };
  onSelectAgent: (agent: any) => void;
  onDeleteAgent: (agent: { id: string; name: string }) => void;
  onCreateAgent: (data: { id: string; name: string; channel: string; role: RoleValue }) => void;
  onSeedFleet: () => void;
  onFetchPerformance: (id: string) => void;
}

export default function AgentListPanel({
  agents,
  selectedAgent,
  isLoading,
  isCreating,
  isDeletingAgent,
  agentStats,
  subscription,
  onSelectAgent,
  onDeleteAgent,
  onCreateAgent,
  onSeedFleet,
  onFetchPerformance,
}: Props) {
  return (
    <aside
      className={cn(
        "w-full md:w-[350px] lg:w-[420px] border-b md:border-b-0 md:border-r border-white/8 h-auto md:h-full flex flex-col shrink-0",
        selectedAgent && "hidden md:flex",
      )}
    >
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.45em] text-brand/80">
            Fleet · Agents
          </div>
          <h2 className="font-display italic lowercase text-2xl text-ink leading-none mt-0.5 flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand" />
            your agents
          </h2>
        </div>
        <span className="text-[9px] uppercase tracking-[0.3em] text-muted/70 tabular-nums shrink-0">
          {agents.length}
        </span>
      </div>

      <div className="px-3 py-3 flex-1 overflow-y-auto space-y-2 scrollbar-hide">
        <AnimatePresence mode="popLayout">
          {isLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col items-center justify-center gap-3 py-12"
            >
              <Loader2 className="w-5 h-5 animate-spin text-brand" aria-hidden="true" />
              <span className="app-section-title/70">Loading fleet</span>
            </div>
          ) : agents.length === 0 ? (
            <div className="rounded-xl glass border-brand/20 border-dashed py-10 text-center px-4">
              <Bot className="w-8 h-8 text-brand/70 mx-auto mb-3" />
              <p className="font-display italic lowercase text-xl text-ink leading-tight">
                no agents yet
              </p>
              <p className="text-caption mt-2 leading-relaxed">
                Create your first AI agent below — it will answer calls, book appointments, and
                follow up for you.
              </p>
            </div>
          ) : (
            agents.map((agent) => (
              <motion.div
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                key={agent.id}
                className={cn(
                  "w-full flex items-center gap-1 transition-all rounded-xl border group overflow-hidden",
                  selectedAgent?.id === agent.id
                    ? "border-brand/35"
                    : "glass hover:border-brand/30",
                )}
                style={
                  selectedAgent?.id === agent.id
                    ? {
                        background:
                          "linear-gradient(135deg, rgba(107, 43, 153 ,0.08), rgba(107, 43, 153 ,0.05))",
                      }
                    : undefined
                }
              >
                {selectedAgent?.id === agent.id && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full"
                    style={{ background: "linear-gradient(to bottom, #8B3FD6, #8B3FD6)" }}
                  />
                )}

                <button
                  onClick={() => {
                    onSelectAgent(agent);
                    onFetchPerformance(agent.id);
                  }}
                  className="flex-1 text-left px-3 py-3 flex items-center gap-2.5 min-w-0"
                >
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all border",
                      selectedAgent?.id === agent.id
                        ? "border-brand/35 bg-brand/12 text-brand"
                        : "border-black/8 dark:border-white/10 bg-black/[0.02] dark:bg-white/3 text-ink/70 group-hover:text-ink group-hover:bg-brand/5 dark:group-hover:bg-white/8",
                    )}
                  >
                    {agent.channel === "email" ? (
                      <Mail className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0">
                    <div className="font-display italic text-base text-ink leading-tight truncate">
                      {agent.name}
                    </div>
                    <div className="flex items-center flex-wrap gap-1.5 mt-1">
                      <RoleBadge role={agent.role} size="xs" />
                      <span className="text-[8px] uppercase tracking-[0.25em] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/8 text-muted/70 leading-none">
                        {agent.channel}
                      </span>
                      {agentStats[agent.id] && (
                        <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-white/5 border border-white/8 text-muted/70 leading-none">
                          {agentStats[agent.id].callCount} calls
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteAgent({ id: agent.id, name: agent.name });
                  }}
                  disabled={isDeletingAgent === agent.id}
                  title="Delete agent"
                  aria-label={`Delete agent ${agent.name}`}
                  className="mr-2 shrink-0 w-7 h-7 rounded-lg glass flex items-center justify-center text-muted/70 hover:text-rose-500 hover:border-rose-500/30 hover:bg-rose-500/8 disabled:opacity-40 transition-all"
                >
                  {isDeletingAgent === agent.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                </button>
              </motion.div>
            ))
          )}
        </AnimatePresence>

        <CreateAgentSection
          isCreating={isCreating}
          agents={agents}
          subscription={subscription}
          onCreate={onCreateAgent}
          onSeedFleet={onSeedFleet}
        />
      </div>
    </aside>
  );
}
