import { useState } from "react";
import { ChevronDown, Phone, Zap, Wrench } from "lucide-react";
import { cn } from "../lib/utils";
import type { AgentToolName, ToolIntegration } from "../lib/agent-capabilities";
import { AGENT_TOOL_CATALOG } from "../lib/agent-capabilities";
import {
  getIntegrationPlaybook,
  getCatalogEntry,
  getActiveTasksForIntegration,
} from "../lib/integration-playbooks";

export interface IntegrationCapabilityPanelProps {
  integration: ToolIntegration;
  accentColor: string;
  connected: boolean;
  enabledTools: readonly AgentToolName[];
  /** Hub cards: read-only playbook, no tool toggles */
  compact?: boolean;
  onToggleTool?: (tool: AgentToolName) => void;
  onToggleIntegrationGroup?: (integration: string, enable: boolean) => void;
  connectHref?: string;
}

export default function IntegrationCapabilityPanel({
  integration,
  accentColor,
  connected,
  enabledTools,
  compact = false,
  onToggleTool,
  onToggleIntegrationGroup,
  connectHref,
}: IntegrationCapabilityPanelProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const playbook = getIntegrationPlaybook(integration);
  if (!playbook) return null;

  const tasks = compact
    ? playbook.tasks
    : getActiveTasksForIntegration(integration, enabledTools).length > 0
      ? getActiveTasksForIntegration(integration, enabledTools)
      : playbook.tasks;

  const integrationTools = AGENT_TOOL_CATALOG.filter((t) => t.integration === integration);
  const enabledSet = new Set(enabledTools);
  const href = connectHref ?? playbook.connectPath;

  return (
    <div className={cn("space-y-3", compact && "space-y-2")}>
      {!compact && (
        <p
          className="text-[11px] text-ink/90 leading-relaxed text-pretty border-l-2 pl-2.5"
          style={{ borderColor: `${accentColor}55` }}
        >
          {playbook.headline}
        </p>
      )}

      <div>
        <p
          className="text-[9px] uppercase tracking-[0.32em] font-medium mb-2"
          style={{ color: accentColor }}
        >
          When callers ask
        </p>
        <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
          {tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                "rounded-lg border bg-paper/80",
                compact ? "px-2.5 py-2 border-black/8" : "px-3 py-2.5 border-black/10",
              )}
            >
              <div className="flex items-start gap-2 mb-1.5">
                <Phone
                  className="w-3 h-3 shrink-0 mt-0.5"
                  style={{ color: accentColor }}
                  aria-hidden
                />
                <p
                  className={cn(
                    "text-ink font-medium leading-snug text-pretty",
                    compact ? "text-[10px]" : "text-[11px]",
                  )}
                >
                  {task.callerMoment}
                </p>
              </div>
              <div className="flex items-start gap-2 mb-2">
                <Zap className="w-3 h-3 text-brand/80 shrink-0 mt-0.5" aria-hidden />
                <p
                  className={cn(
                    "text-muted/80 leading-relaxed text-pretty",
                    compact ? "text-[10px]" : "text-[10px]",
                  )}
                >
                  {task.agentAction}
                </p>
              </div>
              <div className="flex flex-wrap gap-1 pl-5">
                {task.tools.map((toolName) => {
                  const entry = getCatalogEntry(toolName);
                  const on = enabledSet.has(toolName);
                  return (
                    <span
                      key={toolName}
                      className={cn(
                        "inline-flex px-1.5 py-0.5 rounded text-[8px] font-mono uppercase tracking-wide border",
                        on
                          ? "border-current/25 bg-current/8"
                          : "border-black/10 bg-black/4 text-muted/60",
                      )}
                      style={
                        on ? { color: accentColor, borderColor: `${accentColor}35` } : undefined
                      }
                      title={entry?.description}
                    >
                      {entry?.label ?? toolName}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!connected && compact && (
        <a
          href={href}
          className="inline-flex text-[10px] uppercase tracking-[0.28em] hover:underline underline-offset-2"
          style={{ color: accentColor }}
        >
          Connect in Integration Hub →
        </a>
      )}

      {!compact && onToggleTool && integrationTools.length > 0 && (
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
            <button
              type="button"
              onClick={() => setToolsOpen((o) => !o)}
              className="flex-1 flex items-center justify-between gap-2 text-left hover:opacity-90 transition-opacity"
            >
              <span className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.28em] text-muted/80">
                <Wrench className="w-3 h-3" />
                Fine-tune tools
              </span>
              <span className="text-[9px] text-muted/50 tabular-nums">
                {integrationTools.filter((t) => enabledSet.has(t.name)).length}/
                {integrationTools.length}
              </span>
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 text-muted/60 transition-transform shrink-0",
                  toolsOpen && "rotate-180",
                )}
              />
            </button>
            {onToggleIntegrationGroup && (
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onToggleIntegrationGroup(integration, true)}
                  className="px-2 py-0.5 rounded text-[8px] uppercase tracking-[0.2em] border border-white/12 text-muted/80 hover:text-ink hover:border-white/25"
                >
                  All on
                </button>
                <button
                  type="button"
                  onClick={() => onToggleIntegrationGroup(integration, false)}
                  className="px-2 py-0.5 rounded text-[8px] uppercase tracking-[0.2em] border border-white/12 text-muted/80 hover:text-ink hover:border-white/25"
                >
                  All off
                </button>
              </div>
            )}
          </div>
          {toolsOpen && (
            <ul className="border-t border-white/8 divide-y divide-white/6">
              {integrationTools.map((tool) => {
                const on = enabledSet.has(tool.name);
                return (
                  <li key={tool.name}>
                    <label className="flex items-start gap-2.5 px-3 py-2 cursor-pointer hover:bg-white/4">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => onToggleTool(tool.name)}
                        className="mt-0.5 rounded border-white/20 text-brand focus:ring-brand/40"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] text-ink font-medium">{tool.label}</span>
                        <span className="block text-[10px] text-muted/70 leading-snug">
                          {tool.description}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
