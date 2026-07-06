/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AgentListPanel - Agents sidebar showing all agents + create form.
 * Extracted from the monolithic agent settings surface during the 2026 audit.
 */
import { Bot, Mail, Loader2, Shield, Trash2, ChevronRight, PanelLeftClose } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { RoleBadge } from "../fleet/helpers";
import CreateAgentSection from "./CreateAgentSection";
import type { RoleValue } from "../fleet/helpers";
import { EmptyState } from "../ui/EmptyState";
import ClientRouteLoading from "../layout/ClientRouteLoading";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { OPS_CHANNEL_EMPTY, WL_FLEET_CLASSES } from "../../lib/wireline-ops-design";
import { PRODUCT_VERSATILITY } from "../../lib/product-copy";
import PostureBadge from "../ui/PostureBadge";

interface Props {
  agents: any[];
  selectedAgent: any | null;
  isLoading: boolean;
  isCreating: boolean;
  isDeletingAgent: string | null;
  agentStats: Record<string, any>;
  subscription: { status: string; max_agents: number | null };
  /** Personal accounts get a single-agent framing (no legacy assistant framing). */
  isPersonal?: boolean;
  onSelectAgent: (agent: any) => void;
  onDeleteAgent: (agent: { id: string; name: string }) => void;
  onCreateAgent: (data: { id: string; name: string; channel: string; role: RoleValue }) => void;
  onSeedAssistant: () => void;
  onFetchPerformance: (id: string) => void;
  /** Collapse the desktop list to a slim avatar rail (single-focus Studio). */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function AgentListPanel({
  agents,
  selectedAgent,
  isLoading,
  isCreating,
  isDeletingAgent,
  agentStats,
  subscription,
  isPersonal = false,
  onSelectAgent,
  onDeleteAgent,
  onCreateAgent,
  onSeedAssistant,
  onFetchPerformance,
  collapsed = false,
  onToggleCollapse,
}: Props) {
  // Collapsed (desktop only): a slim avatar rail so the agent editor is the
  // single focus. Click an avatar to switch, the chevron to reopen the list.
  if (collapsed) {
    return (
      <aside className="hidden md:flex w-14 border-r border-white/8 h-full min-h-0 flex-col items-center gap-2 py-3 bg-card/40 shrink-0">
        <ShadButton
          type="button"
          variant="ghost"
          size="icon"
          disableAnimations
          onClick={onToggleCollapse}
          title="Show roster"
          aria-label="Show agent roster"
          className="w-9 h-9 rounded-md text-foreground/50 hover:text-foreground touch-press hover:scale-[1.05]"
        >
          <ChevronRight className="w-4 h-4" />
        </ShadButton>
        <span className="wl-label-muted tabular-nums">{agents.length}</span>
        <div className="flex-1 min-h-0 w-full overflow-y-auto scroll-viewport flex flex-col items-center gap-2 pt-1">
          {agents.map((agent) => (
            <ShadButton
              key={agent.id}
              type="button"
              variant="ghost"
              size="icon"
              disableAnimations
              onClick={() => {
                onSelectAgent(agent);
                onFetchPerformance(agent.id);
              }}
              title={agent.name}
              aria-label={`Select ${agent.name}`}
              className={cn(
                "w-9 h-9 rounded-md shrink-0 touch-press hover:scale-[1.05]",
                selectedAgent?.id === agent.id
                  ? "ring-2 ring-brand/40 bg-brand/10 text-brand"
                  : "text-foreground/55 hover:bg-brand/5 hover:text-foreground",
              )}
            >
              {agent.channel === "email" ? (
                <Mail className="w-4 h-4" />
              ) : (
                <Bot className="w-4 h-4" />
              )}
            </ShadButton>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        "w-full md:w-[300px] lg:w-[340px] border-b md:border-b-0 md:border-r border-white/8 h-auto md:h-full md:min-h-0 flex flex-col shrink-0 overflow-hidden bg-card/40",
        selectedAgent && "hidden md:flex",
      )}
    >
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0">
          <p className="app-section-title mb-0.5">{PRODUCT_VERSATILITY.eyebrow}</p>
          <h2 className="font-display italic text-2xl text-foreground leading-none mt-0.5 flex items-center gap-2">
            <Shield className="w-4 h-4 text-brand" />
            {isPersonal ? "Your personal agent" : "Agents"}
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="wl-label-muted tabular-nums">{agents.length}</span>
          {onToggleCollapse && (
            <ShadButton
              type="button"
              variant="ghost"
              size="icon"
              disableAnimations
              onClick={onToggleCollapse}
              title="Collapse list"
              aria-label="Collapse roster"
              className="hidden md:inline-flex w-7 h-7 rounded-md text-foreground/55 hover:text-foreground touch-press hover:scale-[1.05]"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </ShadButton>
          )}
        </div>
      </div>

      <div className="px-3 py-3 flex-1 min-h-0 scroll-viewport space-y-2">
        <AnimatePresence mode="popLayout">
          {isLoading ? (
            <ClientRouteLoading
              icon={<Bot className="w-6 h-6" />}
              label="Loading roster"
              className="py-12"
            />
          ) : agents.length === 0 ? (
            <EmptyState
              icon={Bot}
              title={OPS_CHANNEL_EMPTY.fleetAgents.title}
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
                        "group-hover:border-brand/25 group-hover:bg-brand/5 group-hover:text-foreground",
                    )}
                  >
                    {agent.channel === "email" ? (
                      <Mail className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>
                  <div className="overflow-hidden flex-1 min-w-0">
                    <div className="font-display italic text-base text-foreground leading-tight truncate">
                      {agent.name}
                    </div>
                    <div className="flex items-center flex-wrap gap-1.5 mt-1">
                      <PostureBadge
                        isBusiness={Boolean(agent.is_business_agent)}
                        compact
                        className="text-[var(--wireline-typography-overline-size)]"
                      />
                      <RoleBadge role={agent.role} size="xs" />
                      <span className="wl-label tracking-[0.18em] px-1.5 py-0.5 rounded-full bg-card-warm/80 border border-white/8 text-foreground/50 leading-none">
                        {agent.channel}
                      </span>
                      {agentStats[agent.id] && (
                        <span className="wl-micro-badge font-mono px-1.5 py-0.5 rounded-full bg-card-warm/80 border border-white/8 text-foreground/50 leading-none">
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
                  title="Remove from roster"
                  aria-label={`Remove ${agent.name} from roster`}
                  className="mr-2 h-7 w-7 shrink-0 rounded-md text-foreground/55 hover:border-destructive/30 hover:bg-destructive/8 hover:text-destructive disabled:opacity-40 touch-press hover:scale-[1.05]"
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
          isPersonal={isPersonal}
          onCreate={onCreateAgent}
          onSeedAssistant={onSeedAssistant}
        />
      </div>
    </aside>
  );
}
