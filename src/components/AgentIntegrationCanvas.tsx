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
    <div className="rounded-md wl-panel border border-white/8 p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-white/8">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-brand" />
          <div>
            <h3 className="font-display italic lowercase text-base text-ink">agent capabilities</h3>
            <p className="text-[10px] text-muted/70 leading-relaxed text-pretty">
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
          className="rounded-full text-[10px] uppercase tracking-[0.25em]"
        >
          <RefreshCw className="w-2.5 h-2.5" />
          Role defaults
        </ShadButton>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2 text-[10px]">
        <span
          className={cn(
            "px-2 py-1 rounded-full border uppercase tracking-[0.22em]",
            usingRoleDefaults
              ? "bg-brand/10 border-brand/30 text-brand"
              : "bg-white/5 border-white/10 text-muted/80",
          )}
        >
          {usingRoleDefaults ? "Role defaults" : "Custom override"}
        </span>
        <span className="px-2 py-1 rounded-full border border-white/10 bg-white/5 text-muted/80 uppercase tracking-[0.22em]">
          {selectedToolNames.length} tools enabled
        </span>
      </div>

      {/* ── Neural web constellation (sm+) ── */}
      <div className="hidden sm:block select-none">
        <div
          className="relative mx-auto"
          style={{ width: "100%", maxWidth: 420, aspectRatio: "1" }}
        >
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
                  style={
                    isActive
                      ? {
                          animation: "integration-flow 1.1s linear infinite",
                          filter: `drop-shadow(0 0 1.5px ${n.color}99)`,
                        }
                      : undefined
                  }
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
          <div
            className="absolute z-10"
            style={{ left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
          >
            <div className="relative flex items-center justify-center">
              {/* Outermost ring */}
              <div
                className="absolute rounded-full"
                style={{
                  width: 76,
                  height: 76,
                  background: "rgba(79,30,123,0.1)",
                  animation: "agent-pulse 3.8s ease-in-out 0.75s infinite",
                }}
                aria-hidden="true"
              />
              {/* Middle ring */}
              <div
                className="absolute rounded-full"
                style={{
                  width: 58,
                  height: 58,
                  background: "rgba(79,30,123,0.18)",
                  animation: "agent-pulse 3.3s ease-in-out 0.38s infinite",
                }}
                aria-hidden="true"
              />
              {/* Inner ring */}
              <div
                className="absolute rounded-full"
                style={{
                  width: 44,
                  height: 44,
                  background: "rgba(79,30,123,0.26)",
                  animation: "agent-pulse 2.9s ease-in-out infinite",
                }}
                aria-hidden="true"
              />
              {/* Core shell */}
              <div
                className="relative w-11 h-11 rounded-full flex items-center justify-center z-10"
                style={{
                  background:
                    "radial-gradient(circle at 35% 35%, rgba(79,30,123,0.96), rgba(18,0,32,0.98))",
                  border: "1.5px solid rgba(239,233,220,0.28)",
                  boxShadow:
                    "0 0 20px rgba(79,30,123,0.65), 0 0 42px rgba(79,30,123,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
                }}
              >
                <WirelineMark className="w-5 h-5 text-paper" strokeWidth={90} />
              </div>
            </div>
          </div>

          {/* Integration nodes */}
          {nodes.map((n) => {
            const enabledCount = getEnabledCount(n.key);
            const connected = resolveConnected(n.key, integrationStatus);
            const isActive = activeKey === n.key;
            return (
              <ShadButton
                key={n.key}
                type="button"
                variant="ghost"
                disableAnimations
                onClick={() => setActiveKey(isActive ? null : n.key)}
                aria-pressed={isActive}
                aria-label={`${n.label} integration — ${enabledCount} tools enabled`}
                className="absolute flex flex-col items-center gap-1 h-auto p-0 hover:bg-transparent transition-transform duration-150"
                style={{
                  left: `${n.cx}%`,
                  top: `${n.cy}%`,
                  transform: `translate(-50%, -50%) scale(${isActive ? 1.15 : 1})`,
                  zIndex: isActive ? 20 : 10,
                }}
              >
                {/* Icon box with count badge */}
                <div className="relative">
                  <div
                    className="w-9 h-9 rounded-md flex items-center justify-center transition-all duration-150"
                    style={{
                      background: isActive
                        ? `${n.color}28`
                        : enabledCount > 0
                          ? `${n.color}14`
                          : "rgba(0,0,0,0.38)",
                      border: `1.5px solid ${
                        isActive
                          ? n.color
                          : enabledCount > 0
                            ? `${n.color}60`
                            : "rgba(255,255,255,0.1)"
                      }`,
                      boxShadow: isActive
                        ? `0 0 14px ${n.color}50, inset 0 0 8px ${n.color}18`
                        : connected && enabledCount > 0
                          ? `0 0 8px ${n.color}30`
                          : undefined,
                    }}
                  >
                    <n.Icon
                      style={{
                        width: 16,
                        height: 16,
                        color: isActive
                          ? n.color
                          : enabledCount > 0
                            ? n.color
                            : "rgba(255,255,255,0.28)",
                      }}
                    />
                  </div>

                  {/* Tool count badge */}
                  {enabledCount > 0 && (
                    <div
                      className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] rounded-full flex items-center justify-center text-[7px] font-bold text-white px-0.5 leading-none"
                      style={{
                        background: n.color,
                        boxShadow: `0 0 5px ${n.color}70`,
                      }}
                    >
                      {enabledCount}
                    </div>
                  )}
                </div>

                {/* Label + connected dot */}
                <div className="flex flex-col items-center gap-0.5">
                  <span
                    className="text-[8px] font-medium leading-none"
                    style={{
                      color: isActive
                        ? n.color
                        : enabledCount > 0
                          ? "rgba(239,233,220,0.85)"
                          : "rgba(239,233,220,0.32)",
                    }}
                  >
                    {n.label}
                  </span>
                  <div
                    className="w-1 h-1 rounded-full transition-colors duration-300"
                    style={{ background: connected ? "var(--brand)" : "rgba(255,255,255,0.2)" }}
                  />
                </div>
              </ShadButton>
            );
          })}
        </div>
      </div>

      {/* ── Mobile chip strip ── */}
      <div className="sm:hidden -mx-3 px-3">
        <div
          className="overflow-x-auto pb-1"
          style={{
            maskImage:
              "linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent 0, black 12px, black calc(100% - 12px), transparent 100%)",
          }}
        >
          <div className="flex gap-2 w-max px-3">
            {INTEGRATION_META.map((meta) => {
              const enabledCount = getEnabledCount(meta.key);
              const connected = resolveConnected(meta.key, integrationStatus);
              const isActive = activeKey === meta.key;
              return (
                <ShadButton
                  key={meta.key}
                  type="button"
                  variant="ghost"
                  disableAnimations
                  onClick={() => setActiveKey(isActive ? null : meta.key)}
                  aria-pressed={isActive}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border h-auto shrink-0"
                  style={{
                    borderColor: isActive
                      ? meta.color
                      : enabledCount > 0
                        ? `${meta.color}50`
                        : "rgba(255,255,255,0.1)",
                    background: isActive
                      ? `${meta.color}1c`
                      : enabledCount > 0
                        ? `${meta.color}0a`
                        : "transparent",
                    boxShadow: isActive ? `0 0 8px ${meta.color}35` : undefined,
                  }}
                >
                  <meta.Icon
                    style={{
                      width: 12,
                      height: 12,
                      color: isActive ? meta.color : "rgba(255,255,255,0.5)",
                    }}
                  />
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: isActive ? meta.color : "rgba(255,255,255,0.7)" }}
                  >
                    {meta.label}
                  </span>
                  {enabledCount > 0 && (
                    <span
                      className="text-[8px] font-bold px-1 py-0.5 rounded-full leading-none"
                      style={{ background: `${meta.color}25`, color: meta.color }}
                    >
                      {enabledCount}
                    </span>
                  )}
                  <div
                    className="w-1 h-1 rounded-full"
                    style={{ background: connected ? "var(--brand)" : "rgba(255,255,255,0.2)" }}
                  />
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
