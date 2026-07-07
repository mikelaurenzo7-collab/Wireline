import { motion } from "motion/react";
import { X, Activity } from "lucide-react";
import { type ToolIntegration, type AgentToolName } from "../../lib/agent-capabilities";
import { getIntegrationPlaybook } from "../../lib/integration-playbooks";
import IntegrationCapabilityPanel from "../IntegrationCapabilityPanel";
import { type IntegrationMeta, resolveConnected, ACTIVITY_LOG } from "./PreviewCards";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { BRAND } from "../../constants/brand-colors";
import { WL_INTEGRATION_CLASSES } from "../../lib/wireline-ops-design";
import { cn } from "../../lib/utils";

interface PlaybookPanelProps {
  activeKey: ToolIntegration;
  activeIntegration: IntegrationMeta;
  integrationStatus: Record<string, { connected: boolean }> | null;
  selectedToolNames: readonly AgentToolName[];
  onToggleTool: (tool: AgentToolName) => void;
  onToggleIntegrationGroup: (integration: string, enable: boolean) => void;
  onClose: () => void;
}

export function IntegrationPlaybookPanel({
  activeKey,
  activeIntegration,
  integrationStatus,
  selectedToolNames,
  onToggleTool,
  onToggleIntegrationGroup,
  onClose,
}: PlaybookPanelProps) {
  const activePlaybook = getIntegrationPlaybook(activeKey);
  const isConnected = resolveConnected(activeKey, integrationStatus);

  const getEnabledCount = (key: ToolIntegration) => {
    // We can count based on catalog if we imported AGENT_TOOL_CATALOG,
    // or just let IntegrationCapabilityPanel handle tool-level logic.
    // However, to keep it simple, we need the counts for the header text.
    // Let's import AGENT_TOOL_CATALOG here.
    return AGENT_TOOL_CATALOG_FILTERED_COUNT(key, selectedToolNames);
  };

  const getTotalCount = (key: ToolIntegration) => {
    return AGENT_TOOL_CATALOG_TOTAL_COUNT(key);
  };

  return (
    <motion.div
      key={activeKey}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className={cn(WL_INTEGRATION_CLASSES.liveCard, "rounded-md border p-3 space-y-3")}>
        {/* Panel header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 bg-brand/15 border border-brand/20">
              <activeIntegration.Icon className="w-4 h-4 text-brand" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">{activeIntegration.label}</div>
              <div className="wl-micro-meta--muted leading-relaxed text-pretty">
                {activePlaybook?.orbitHint ?? activeIntegration.tagline}
              </div>
            </div>
          </div>
          <ShadButton
            type="button"
            disableAnimations
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close integration panel"
            className="h-8 w-8 shrink-0 hover:bg-white/8"
          >
            <X className="w-3.5 h-3.5 text-muted/70" />
          </ShadButton>
        </div>

        {/* Connection status */}
        <div className="flex items-center justify-between wl-micro-meta">
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                isConnected
                  ? "bg-brand shadow-[0_0_4px] shadow-brand/60"
                  : "bg-muted-foreground/40",
              )}
            />
            <span className="text-muted/70">{isConnected ? "Connected" : "Not connected"}</span>
          </div>
          <div className="flex items-center gap-3">
            {!isConnected && (
              <a
                href="/connections"
                className="text-brand underline underline-offset-2 hover:text-brand-deep"
              >
                Connect →
              </a>
            )}
            <span className="text-muted/70">
              {getEnabledCount(activeKey)}/{getTotalCount(activeKey)} tools on
            </span>
          </div>
        </div>

        <IntegrationCapabilityPanel
          integration={activeKey}
          accentColor={BRAND.colors.primary}
          connected={isConnected}
          enabledTools={selectedToolNames}
          onToggleTool={onToggleTool}
          onToggleIntegrationGroup={onToggleIntegrationGroup}
        />

        {/* Preview card */}
        <activeIntegration.PreviewCard />

        {/* Recent activity feed */}
        {ACTIVITY_LOG[activeKey] && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 wl-label wl-label-muted">
              <Activity size={9} />
              Recent Activity
            </div>
            <div className="wl-integration-preview-card rounded-md overflow-hidden border border-border">
              {ACTIVITY_LOG[activeKey]!.map((item, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 wl-micro-meta border-b border-border/60 last:border-b-0",
                    i === 0 ? "bg-brand/[0.06]" : "bg-transparent",
                  )}
                >
                  <div
                    className={cn(
                      "w-1 h-1 rounded-full shrink-0",
                      i === 0 ? "bg-brand" : "bg-muted-foreground/30",
                    )}
                  />
                  <span className="flex-1 text-muted/80 truncate">{item.text}</span>
                  <span className="text-muted/70 shrink-0 pl-2">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// Helpers for counting tools
import { AGENT_TOOL_CATALOG } from "../../lib/agent-capabilities";

function AGENT_TOOL_CATALOG_FILTERED_COUNT(
  key: ToolIntegration,
  selectedToolNames: readonly AgentToolName[],
) {
  return AGENT_TOOL_CATALOG.filter(
    (t) => t.integration === key && selectedToolNames.includes(t.name),
  ).length;
}

function AGENT_TOOL_CATALOG_TOTAL_COUNT(key: ToolIntegration) {
  return AGENT_TOOL_CATALOG.filter((t) => t.integration === key).length;
}
