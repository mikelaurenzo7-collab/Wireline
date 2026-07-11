import React, { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Sparkles, RefreshCw } from "lucide-react";
import { cn } from "../lib/utils";
import { ShadButton } from "./ui/shadcn/ShadButton";
import WirelineMark from "./WirelineMark";
import {
  AGENT_TOOL_CATALOG,
  type AgentToolName,
  type ToolIntegration,
} from "../lib/agent-capabilities";
import { INTEGRATION_META, resolveConnected } from "./integrations/PreviewCards";
import { IntegrationPlaybookPanel } from "./integrations/IntegrationPlaybooks";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  agentName: string;
  agentRole: string;
  selectedToolNames: readonly AgentToolName[];
  roleDefaultTools: readonly AgentToolName[];
  usingRoleDefaults: boolean;
  integrationStatus: Record<string, { connected: boolean }> | null;
  onToggleIntegrationGroup: (integration: string, enable: boolean) => void;
  onToggleTool: (tool: AgentToolName) => void;
  onResetToDefaults: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentIntegrationCanvas({
  agentName,
  selectedToolNames,
  roleDefaultTools: _roleDefaultTools,
  usingRoleDefaults,
  integrationStatus,
  onToggleIntegrationGroup,
  onToggleTool,
  onResetToDefaults,
}: Props) {
  const [activeKey, setActiveKey] = useState<ToolIntegration | null>(null);

  // Pre-compute node positions in a circle (13 nodes)
  const nodes = INTEGRATION_META.map((meta, i) => {
    const angleDeg = -90 + i * (360 / INTEGRATION_META.length);
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      ...meta,
      cx: 50 + 39 * Math.cos(angleRad),
      cy: 50 + 39 * Math.sin(angleRad),
    };
  });

  const activeIntegration = INTEGRATION_META.find((m) => m.key === activeKey) ?? null;

  const getEnabledCount = (key: ToolIntegration) =>
    AGENT_TOOL_CATALOG.filter((t) => t.integration === key && selectedToolNames.includes(t.name))
      .length;

  return (
    <div className="rounded-md wl-panel border border-border/50 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <div>
            <h3 className="font-display italic text-base text-foreground">Agent capabilities</h3>
            <p className="wl-micro-meta--muted leading-relaxed text-pretty">
              Each connection maps to caller moments — what {agentName || "this agent"} does when
              customers ask.
            </p>
          </div>
        </div>
        <ShadButton
          type="button"
          variant="outline"
          size="sm"
          disableAnimations
          onClick={onResetToDefaults}
          disabled={usingRoleDefaults}
          className="rounded-full wl-label"
        >
          <RefreshCw className="w-2.5 h-2.5" />
          Role defaults
        </ShadButton>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2 wl-micro-meta">
        <span
          className={cn(
            "px-2 py-1 rounded-full border uppercase tracking-[0.22em]",
            usingRoleDefaults
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-muted border-border text-muted",
          )}
        >
          {usingRoleDefaults ? "Role defaults" : "Custom override"}
        </span>
        <span className="px-2 py-1 rounded-full border border-border bg-muted text-muted uppercase tracking-[0.22em]">
          {selectedToolNames.length} tools enabled
        </span>
      </div>

      {/* Desktop integration map */}
      <div className="hidden sm:block select-none">
        <div className="relative mx-auto wl-canvas-stage">
          {/* SVG layer — lines + data packets */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              {nodes.map((n) => (
                <linearGradient
                  key={n.key}
                  id={`canvas-lg-${n.key}`}
                  x1={50}
                  y1={50}
                  x2={n.cx}
                  y2={n.cy}
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stopColor="rgba(79,30,123,0.35)" />
                  <stop offset="100%" stopColor={n.color} stopOpacity={0.45} />
                </linearGradient>
              ))}
              {/* Glow filter for active lines and packets */}
              <filter id="canvas-pkt-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Connection lines */}
            {nodes.map((n) => {
              const enabled = getEnabledCount(n.key) > 0;
              const isActive = activeKey === n.key;
              return (
                <path
                  key={`line-${n.key}`}
                  d={`M 50 50 L ${n.cx} ${n.cy}`}
                  stroke={
                    isActive
                      ? n.color
                      : enabled
                        ? `url(#canvas-lg-${n.key})`
                        : "rgba(255,255,255,0.06)"
                  }
                  strokeWidth={isActive ? 1.0 : enabled ? 0.55 : 0.2}
                  fill="none"
                  strokeDasharray={isActive ? "2.5 2" : enabled ? "1.5 2.5" : undefined}
                  className={isActive ? "wl-canvas-line--active" : undefined}
                  data-integration-accent={isActive ? n.color : undefined}
                />
              );
            })}

            {/* Data packets — active: 3 fast; enabled: 1 slow */}
            {nodes.flatMap((n) => {
              const enabled = getEnabledCount(n.key) > 0;
              const isActive = activeKey === n.key;
              const path = `M 50 50 L ${n.cx} ${n.cy}`;

              if (isActive) {
                return [0, 0.38, 0.76].map((delay, i) => (
                  <circle
                    key={`pkt-${n.key}-${i}`}
                    r="1.3"
                    fill={n.color}
                    opacity="0.95"
                    filter="url(#canvas-pkt-glow)"
                  >
                    <animateMotion
                      dur="1.15s"
                      begin={`${delay}s`}
                      repeatCount="indefinite"
                      path={path}
                      calcMode="linear"
                    />
                  </circle>
                ));
              }

              if (enabled) {
                return [
                  <circle key={`pkt-${n.key}`} r="0.75" fill={n.color} opacity="0.55">
                    <animateMotion
                      dur="2.8s"
                      repeatCount="indefinite"
                      path={path}
                      calcMode="linear"
                    />
                  </circle>,
                ];
              }

              return [];
            })}
          </svg>

          {/* Center agent node — triple pulse rings */}
          <div className="absolute z-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="relative flex items-center justify-center">
              {/* Outermost ring */}
              <div
                className="absolute rounded-full wl-canvas-agent-ring--outer"
                aria-hidden="true"
              />
              {/* Middle ring */}
              <div
                className="absolute rounded-full wl-canvas-agent-ring--middle"
                aria-hidden="true"
              />
              {/* Inner ring */}
              <div
                className="absolute rounded-full wl-canvas-agent-ring--inner"
                aria-hidden="true"
              />
              {/* Core shell */}
              <div className="relative w-11 h-11 rounded-full flex items-center justify-center z-10 wl-canvas-agent-core">
                <WirelineMark className="w-5 h-5 text-paper" strokeWidth={10} />
              </div>
            </div>
          </div>

          {/* Integration nodes */}
          {nodes.map((n) => {
            const enabledCount = getEnabledCount(n.key);
            const connected = resolveConnected(n.key, integrationStatus);
            const isActive = activeKey === n.key;
            const isEnabled = enabledCount > 0;
            return (
              <ShadButton
                key={n.key}
                type="button"
                variant="ghost"
                disableAnimations
                onClick={() => setActiveKey(isActive ? null : n.key)}
                aria-pressed={isActive}
                aria-label={`${n.label} integration — ${enabledCount} tools enabled`}
                data-active={isActive}
                data-enabled={isEnabled}
                data-connected={connected}
                className="wl-canvas-node absolute flex flex-col items-center gap-1 h-auto p-0 hover:bg-transparent transition-transform duration-150"
                data-node-x={`${n.cx}%`}
                data-node-y={`${n.cy}%`}
                data-integration-accent={n.color}
              >
                {/* Icon box with count badge */}
                <div className="relative">
                  <div className="wl-canvas-node__icon-box w-9 h-9 rounded-md flex items-center justify-center transition-all duration-150">
                    <n.Icon className="wl-canvas-node__icon" />
                  </div>

                  {/* Tool count badge */}
                  {isEnabled && (
                    <div className="wl-canvas-node__badge absolute -top-1.5 -right-1.5 min-w-[1rem] h-[1rem] rounded-full flex items-center justify-center text-[var(--wireline-typography-overline-size)] font-bold text-[var(--wireline-color-text-onAction)] px-0.5 leading-none">
                      {enabledCount}
                    </div>
                  )}
                </div>

                {/* Label + connected dot */}
                <div className="flex flex-col items-center gap-0.5">
                  <span className="wl-canvas-node__label wl-micro-meta font-medium leading-none">
                    {n.label}
                  </span>
                  <div className="wl-canvas-node__dot w-1 h-1 rounded-full transition-colors duration-300" />
                </div>
              </ShadButton>
            );
          })}
        </div>
      </div>

      {/* ── Mobile chip strip ── */}
      <div className="sm:hidden -mx-3 px-3">
        <div className="overflow-x-auto pb-1 wl-canvas-chip-scroll">
          <div className="flex gap-2 w-max px-3">
            {INTEGRATION_META.map((meta) => {
              const enabledCount = getEnabledCount(meta.key);
              const connected = resolveConnected(meta.key, integrationStatus);
              const isActive = activeKey === meta.key;
              const isEnabled = enabledCount > 0;
              return (
                <ShadButton
                  key={meta.key}
                  type="button"
                  variant="ghost"
                  disableAnimations
                  onClick={() => setActiveKey(isActive ? null : meta.key)}
                  aria-pressed={isActive}
                  data-active={isActive}
                  data-enabled={isEnabled}
                  data-connected={connected}
                  className="wl-canvas-chip flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border h-auto shrink-0"
                  data-integration-accent={meta.color}
                >
                  <meta.Icon className="wl-canvas-chip__icon" />
                  <span className="wl-canvas-chip__label wl-micro-meta font-medium">
                    {meta.label}
                  </span>
                  {isEnabled && (
                    <span className="wl-canvas-chip__count wl-label font-bold px-1 py-0.5 rounded-full leading-none">
                      {enabledCount}
                    </span>
                  )}
                  <div className="wl-canvas-chip__dot w-1 h-1 rounded-full" />
                </ShadButton>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Detail panel ── */}
      <AnimatePresence mode="wait">
        {activeKey && activeIntegration && (
          <IntegrationPlaybookPanel
            activeKey={activeKey}
            activeIntegration={activeIntegration}
            integrationStatus={integrationStatus}
            selectedToolNames={selectedToolNames}
            onToggleTool={onToggleTool}
            onToggleIntegrationGroup={onToggleIntegrationGroup}
            onClose={() => setActiveKey(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
