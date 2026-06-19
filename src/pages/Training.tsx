/**
 * Training — agent knowledge, voice, pronunciation, simulator, and flow.
 */
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import { GraduationCap, Bot, Mail } from "lucide-react";
import AgentStudioCanvas from "../components/AgentStudioCanvas";
import { clientLog } from "../lib/client-log";
import { useAgents } from "../contexts/AgentsContext";
import ClientRouteViewport from "../components/layout/ClientRouteViewport";
import ClientRouteLoading from "../components/layout/ClientRouteLoading";
import ClientToolbar from "../components/layout/ClientToolbar";
import { resolveAppPageSubTabId, resolveAppPageSubTabRoute } from "../lib/page-sub-tabs";
import { EmptyState } from "../components/ui/EmptyState";
import { RoleBadge } from "../components/fleet/helpers";
import { OPS_CHANNEL_EMPTY, OPS_CHANNEL_TOOLBAR, WL_OPS_CLASSES } from "../lib/wireline-ops-design";
import { cn } from "../lib/utils";
import { ShadButton } from "../components/ui/shadcn/ShadButton";

const TRAINING_ROUTE = resolveAppPageSubTabRoute("/training")!;

export default function Training() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { agents, loading, degraded, refresh } = useAgents();

  const selectedAgentId = searchParams.get("agent") || (agents[0]?.id ?? "");
  const activeSubTab = resolveAppPageSubTabId(TRAINING_ROUTE, searchParams.get("tab"));

  // Reserved for future sub-tab navigation; kept as an underscore-prefixed
  // callback so it survives lint without removing the wiring.
  const _setSubTab = useCallback(
    (id: string) => {
      setSearchParams(
        (prev) => {
          if (id === TRAINING_ROUTE.defaultTab) prev.delete("tab");
          else prev.set("tab", id);
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  void _setSubTab;

  const selectAgent = (id: string) => {
    setSearchParams((prev) => {
      prev.set("agent", id);
      return prev;
    });
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  if (loading && agents.length === 0) {
    return (
      <ClientRouteViewport>
        <ClientRouteLoading
          icon={<GraduationCap className="w-7 h-7" />}
          label={OPS_CHANNEL_TOOLBAR.training.loading}
        />
      </ClientRouteViewport>
    );
  }

  if (!loading && degraded && agents.length === 0) {
    return (
      <ClientRouteViewport>
        <EmptyState
          framed
          fill
          icon={GraduationCap}
          title="Couldn't load your agents"
          description="The server returned a partial response. Check your connection and try again."
          density="compact"
          withHalo={false}
          actions={[{ label: "Retry", onClick: () => refresh(), primary: true }]}
        />
      </ClientRouteViewport>
    );
  }

  if (agents.length === 0) {
    return (
      <ClientRouteViewport>
        <EmptyState
          framed
          fill
          icon={GraduationCap}
          eyebrow={OPS_CHANNEL_EMPTY.training.eyebrow}
          title={OPS_CHANNEL_EMPTY.training.title}
          description={OPS_CHANNEL_EMPTY.training.description}
          density="compact"
          withHalo={false}
          actions={[...OPS_CHANNEL_EMPTY.training.actions]}
        />
      </ClientRouteViewport>
    );
  }

  const agentRow = (agent: (typeof agents)[number], compact?: boolean) => {
    const selected = agent.id === selectedAgentId;
    return (
      <ShadButton
        key={agent.id}
        type="button"
        disableAnimations
        variant="ghost"
        onClick={() => selectAgent(agent.id)}
        className={cn(
          "touch-press w-full h-auto justify-start text-left gap-2.5 group relative overflow-hidden rounded-md border",
          compact ? "shrink-0 min-w-[140px] px-3 py-2" : "px-3 py-3",
          selected ? "border-iris/35 bg-iris/[0.06]" : "wl-panel hover:border-iris/30",
        )}
      >
        <div
          className={cn(
            "rounded-md flex items-center justify-center shrink-0 transition-all border",
            compact ? "w-8 h-8" : "w-9 h-9",
            selected
              ? "border-iris/35 bg-iris/12 text-iris"
              : "border-border bg-card/70 text-foreground/70 group-hover:bg-iris/5",
          )}
        >
          {agent.channel === "email" ? (
            <Mail className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          ) : (
            <Bot className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate leading-tight",
              compact ? "text-[12px] font-medium" : "text-base font-semibold text-foreground",
              selected && !compact && "text-foreground",
            )}
          >
            {agent.name}
          </p>
          {!compact && agent.role && (
            <div className="mt-1">
              <RoleBadge role={agent.role} size="xs" />
            </div>
          )}
        </div>
      </ShadButton>
    );
  };

  return (
    <ClientRouteViewport>
      <ClientToolbar
        left={
          <span className="app-toolbar-stat">
            {OPS_CHANNEL_TOOLBAR.training.stat(agents.length)}
            {selectedAgent ? ` · ${selectedAgent.name}` : ""}
          </span>
        }
      />

      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0">
        <aside className="shrink-0 lg:w-[280px] flex flex-col lg:min-h-0 lg:self-stretch">
          {/* Mobile: horizontal agent strip — fleet chip rhythm */}
          <div className="lg:hidden">
            <div
              className="flex items-center gap-2 overflow-x-auto tab-strip-scroll tab-strip-scroll--fade pb-2"
              aria-label="Select agent to train"
            >
              {agents.map((agent) => agentRow(agent, true))}
            </div>
          </div>

          {/* Desktop: vertical fleet-style list */}
          <div className={cn(WL_OPS_CLASSES.railCard, "hidden lg:flex flex-1 min-h-0 flex-col")}>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <p className="wl-label flex items-center gap-2">
                <GraduationCap className="w-3.5 h-3.5 text-iris" />
                Agents
              </p>
              <span className="chrome-subtle tabular-nums">{agents.length}</span>
            </div>
            <div className="flex-1 min-h-0 scroll-viewport space-y-1.5 stagger-children">
              {agents.map((agent) => agentRow(agent))}
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 min-h-0 flex flex-col wl-panel-elevated overflow-hidden relative">
          <header className="shrink-0 border-b border-border bg-card/85 px-3 sm:px-4 py-2.5 lg:py-2">
            <div className="lg:hidden flex items-center gap-2 min-w-0">
              <span className="wl-orbit" data-active="true">
                <span className="w-8 h-8 rounded-full bg-gradient-to-br from-iris/15 to-iris/8 flex items-center justify-center shrink-0">
                  <GraduationCap className="w-4 h-4 text-iris" />
                </span>
              </span>
              <div className="min-w-0">
                <p className="wl-label text-muted">Training</p>
                <h2 className="text-sm font-semibold text-foreground truncate tracking-[-0.01em] m-0">
                  {selectedAgent?.name ?? "Agent"}
                </h2>
              </div>
            </div>
          </header>

          <div className="flex-1 min-h-0 scroll-viewport">
            {selectedAgentId && (
              <motion.div
                key={`${selectedAgentId}-${activeSubTab}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="h-full min-h-0"
              >
                <AgentStudioCanvas
                  agentId={selectedAgentId}
                  agentName={selectedAgent?.name ?? "Agent"}
                  onPublish={() => {
                    clientLog.debug("[Training]", "Publish to live", { agentId: selectedAgentId });
                  }}
                />
              </motion.div>
            )}
          </div>
        </main>
      </div>
    </ClientRouteViewport>
  );
}
