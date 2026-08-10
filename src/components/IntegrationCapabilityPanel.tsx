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
import { Checkbox } from "./ui/shadcn/Checkbox";
import { ShadButton } from "./ui/shadcn/ShadButton";

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
    <div className={cn("space-y-3", compact && "space-y-2")} data-accent={accentColor}>
      {!compact && (
        <p className="text-[length:var(--wireline-typography-overline-size)] text-foreground/90 leading-relaxed text-pretty border-l-2 pl-2.5 wl-accent-border-l">
          {playbook.headline}
        </p>
      )}

      <div>
        <p className="wl-label wl-accent-text mb-2">When callers ask</p>
        <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
          {tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                "rounded-md border bg-card/80",
                compact ? "px-2.5 py-2 border-border" : "px-3 py-2.5 border-border",
              )}
            >
              <div className="flex items-start gap-2 mb-1.5">
                <Phone className="w-3 h-3 shrink-0 mt-0.5 wl-accent-text" aria-hidden />
                <p
                  className={cn(
                    "text-foreground font-medium leading-snug text-pretty",
                    compact ? "wl-micro-badge" : "text-eyebrow",
                  )}
                >
                  {task.callerMoment}
                </p>
              </div>
              <div className="flex items-start gap-2 mb-2">
                <Zap className="w-3 h-3 text-brand/80 shrink-0 mt-0.5" aria-hidden />
                <p className={cn("text-muted/80 leading-relaxed text-pretty", "wl-micro-meta")}>
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
                        "inline-flex px-1.5 py-0.5 rounded wl-micro-badge font-mono uppercase tracking-wide border",
                        /*
                         * Hub cards are account level — one CRM connection can
                         * back several agents with different tool sets, so there
                         * is no single correct answer and they pass no tools at
                         * all. Reusing the on/off styling there rendered every
                         * capability of a *connected* integration in the "off"
                         * treatment. Compact badges are labels, not state.
                         */
                        compact
                          ? "border-border bg-muted/10 text-foreground/80"
                          : on
                            ? "wl-accent-tag border-current/25 bg-current/8"
                            : "border-border bg-muted/10 text-foreground/55",
                      )}
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
          className="inline-flex wl-label hover:underline underline-offset-2 wl-accent-text"
        >
          Connect in Integration Hub →
        </a>
      )}

      {!compact && onToggleTool && integrationTools.length > 0 && (
        <div className="rounded-md border border-white/10 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/8">
            <ShadButton
              type="button"
              variant="ghost"
              disableAnimations
              onClick={() => setToolsOpen((o) => !o)}
              className="flex-1 h-auto justify-between gap-2 px-0 py-0 hover:bg-transparent"
            >
              <span className="inline-flex items-center gap-1.5 wl-label text-muted/80">
                <Wrench className="w-3 h-3" />
                Fine-tune tools
              </span>
              <span className="wl-micro-meta tabular-nums">
                {integrationTools.filter((t) => enabledSet.has(t.name)).length}/
                {integrationTools.length}
              </span>
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 text-foreground/55 transition-transform shrink-0",
                  toolsOpen && "rotate-180",
                )}
              />
            </ShadButton>
            {onToggleIntegrationGroup && (
              <div className="flex gap-1 shrink-0">
                <ShadButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disableAnimations
                  onClick={() => onToggleIntegrationGroup(integration, true)}
                  className="px-2 py-0.5 h-auto rounded wl-label"
                >
                  All on
                </ShadButton>
                <ShadButton
                  type="button"
                  variant="outline"
                  size="sm"
                  disableAnimations
                  onClick={() => onToggleIntegrationGroup(integration, false)}
                  className="px-2 py-0.5 h-auto rounded wl-label"
                >
                  All off
                </ShadButton>
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
                      <Checkbox
                        checked={on}
                        onChange={() => onToggleTool(tool.name)}
                        className="mt-0.5 rounded border-white/20 text-brand focus:ring-brand/40"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[length:var(--wireline-typography-overline-size)] text-foreground font-medium">
                          {tool.label}
                        </span>
                        <span className="block wl-micro-meta leading-snug">{tool.description}</span>
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
