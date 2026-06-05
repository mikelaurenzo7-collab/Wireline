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
import { EmptyState } from "../ui/EmptyState";
import ClientRouteLoading from "../layout/ClientRouteLoading";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { OPS_CHANNEL_EMPTY, WL_FLEET_CLASSES } from "../../lib/wireline-ops-design";

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
        "w-full md:w-[350px] lg:w-[420px] border-b md:border-b-0 md:border-r border-black/8 h-auto md:h-full md:min-h-0 flex flex-col shrink-0 overflow-hidden bg-paper/40",
        selectedAgent && "hidden md:flex",
      )}
    >
      <div className="px-4 py-3 border-b border-black/8 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <p className="app-section-title mb-0.5">Fleet · Agents</p>
          <h2 className="font-display italic lowercase text-2xl text-ink leading-none mt-0.5 flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand" />
            your agents
          </h2>
        </div>
        <span className="wl-label-muted tabular-nums shrink-0">{agents.length}</span>
      </div>

      <div className="px-3 py-3 flex-1 min-h-0 scroll-viewport space-y-2">
        <AnimatePresence mode="popLayout">
          {isLoading ? (
            <ClientRouteLoading
              icon={<Bot className="w-6 h-6" />}
              label="Loading fleet"
              className="py-12"
            />
          ) : agents.length === 0 ? (
            <EmptyState
              icon={Bot}
              eyebrow={OPS_CHANNEL_EMPTY.fleetAgents.eyebrow}
              title={OPS_CHANNEL_EMPTY.fleetAgents.title}
              description={OPS_CHANNEL_EMPTY.fleetAgents.description}
              density="compact"
              withHalo={false}
            />
          ) : (
            agents.map((agent) => (
              <motion.div
                layout
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                key={agent.id}
                className={cn(
                  "w-full flex items-center gap-1 transition-all rounded-md group overflow-hidden",
                  selectedAgent?.id === agent.id
                    ? cn(WL_FLEET_CLASSES.agentRow, WL_FLEET_CLASSES.agentRowActive)
                    : WL_FLEET_CLASSES.agentRow,
                )}
              >
                <ShadButton
                  type="button"
                  variant="ghost"
                  disableAnimations
                  onClick={() => {
                    onSelectAgent(agent);
                    onFetchPerformance(agent.id);
                  }}
                  className="h-auto min-w-0 flex-1 justify-start gap-2.5 rounded-none px-3 py-3 text-left hover:bg-transparent"
                >
                  <div
                    className={cn(
                      WL_FLEET_CLASSES.agentAvatar,
                      selectedAgent?.id === agent.id && WL_FLEET_CLASSES.agentAvatarActive,
                      selectedAgent?.id !== agent.id &&
                        "group-hover:border-brand/25 group-hover:bg-brand/5 group-hover:text-ink",
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
                      <span className="text-[8px] uppercase tracking-[0.25em] px-1.5 py-0.5 rounded-full bg-paper-warm/80 border border-black/8 text-ink/50 leading-none">
                        {agent.channel}
                      </span>
                      {agentStats[agent.id] && (
                        <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-paper-warm/80 border border-black/8 text-ink/50 leading-none">
                          {agentStats[agent.id].callCount} calls
                        </span>
                      )}
                    </div>
                  </div>
                </ShadButton>
                <ShadButton
                  type="button"
                  variant="outline"
                  size="icon"
                  disableAnimations
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteAgent({ id: agent.id, name: agent.name });
                  }}
                  disabled={isDeletingAgent === agent.id}
                  title="Delete agent"
                  aria-label={`Delete agent ${agent.name}`}
                  className="mr-2 h-7 w-7 shrink-0 rounded-md text-ink/40 hover:border-destructive/30 hover:bg-destructive/8 hover:text-destructive disabled:opacity-40 touch-press"
                >
                  {isDeletingAgent === agent.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Trash2 className="w-3 h-3" />
                  )}
                </ShadButton>
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
