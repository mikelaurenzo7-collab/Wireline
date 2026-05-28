import React from "react";
import { motion } from "motion/react";
import { X, Activity } from "lucide-react";
import { type ToolIntegration, type AgentToolName } from "../../lib/agent-capabilities";
import { getIntegrationPlaybook } from "../../lib/integration-playbooks";
import IntegrationCapabilityPanel from "../IntegrationCapabilityPanel";
import {
  type IntegrationMeta,
  resolveConnected,
  ACTIVITY_LOG,
} from "./PreviewCards";

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
      <div
        className="rounded-xl border p-3 space-y-3"
        style={{
          borderColor: `${activeIntegration.color}30`,
          background: `${activeIntegration.color}06`,
        }}
      >
        {/* Panel header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: `${activeIntegration.color}20`,
                boxShadow: `0 0 10px ${activeIntegration.color}30`,
              }}
            >
              <activeIntegration.Icon
                style={{ width: 16, height: 16, color: activeIntegration.color }}
              />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">{activeIntegration.label}</div>
              <div className="text-[10px] text-muted/70 leading-relaxed text-pretty">
                {activePlaybook?.orbitHint ?? activeIntegration.tagline}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close integration panel"
            className="p-1 rounded-lg hover:bg-white/8 transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5 text-muted/60" />
          </button>
        </div>

        {/* Connection status */}
        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center gap-1.5">
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{
                background: isConnected ? "#10B981" : "#F59E0B",
                boxShadow: isConnected ? "0 0 4px #10B981" : "none",
              }}
            />
            <span className="text-muted/70">
              {isConnected ? "Connected" : "Not connected"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {!isConnected && (
              <a
                href="/integrations"
                className="text-amber-600 underline underline-offset-2 hover:text-amber-500"
              >
                Connect →
              </a>
            )}
            <span className="text-muted/65">
              {getEnabledCount(activeKey)}/{getTotalCount(activeKey)} tools on
            </span>
          </div>
        </div>

        <IntegrationCapabilityPanel
          integration={activeKey}
          accentColor={activeIntegration.color}
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
            <div
              className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.28em]"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              <Activity size={9} />
              Recent Activity
            </div>
            <div
              className="rounded-lg overflow-hidden"
              style={{ border: `1px solid ${activeIntegration.color}18` }}
            >
              {ACTIVITY_LOG[activeKey]!.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-[10px]"
                  style={{
                    background: i === 0 ? `${activeIntegration.color}0e` : "rgba(0,0,0,0.12)",
                    borderBottom:
                      i < ACTIVITY_LOG[activeKey]!.length - 1
                        ? `1px solid ${activeIntegration.color}10`
                        : undefined,
                  }}
                >
                  <div
                    className="w-1 h-1 rounded-full shrink-0"
                    style={{
                      background:
                        i === 0 ? activeIntegration.color : "rgba(255,255,255,0.18)",
                    }}
                  />
                  <span className="flex-1 text-muted/80 truncate">{item.text}</span>
                  <span className="text-muted/65 shrink-0 pl-2">{item.time}</span>
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

function AGENT_TOOL_CATALOG_FILTERED_COUNT(key: ToolIntegration, selectedToolNames: readonly AgentToolName[]) {
  return AGENT_TOOL_CATALOG.filter((t) => t.integration === key && selectedToolNames.includes(t.name)).length;
}

function AGENT_TOOL_CATALOG_TOTAL_COUNT(key: ToolIntegration) {
  return AGENT_TOOL_CATALOG.filter((t) => t.integration === key).length;
}
