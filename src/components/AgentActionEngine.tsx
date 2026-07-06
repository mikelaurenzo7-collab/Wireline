/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect } from "react";
import { Save, Blocks, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { AGENT_TOOL_CATALOG, type AgentToolName, getRoleToolSet } from "../lib/agent-capabilities";
import { resolveTenantToolIntegrationStatus } from "../lib/tenant-tool-integration-status";
import { ShadButton } from "./ui/shadcn/ShadButton";

interface AgentActionEngineProps {
  agentId: string;
}

export default function AgentActionEngine({ agentId }: AgentActionEngineProps) {
  const { error: toastError, success: toastSuccess } = useToast();
  const [enabledTools, setEnabledTools] = useState<AgentToolName[]>([]);
  const [globalIntegrations, setGlobalIntegrations] = useState<
    Record<string, { connected?: boolean }>
  >({});
  const [calendarHealth, setCalendarHealth] = useState({
    reconnect_google_calendar: false,
    reconnect_microsoft_calendar: false,
  });
  const [emailProviders, setEmailProviders] = useState<string[]>([]);
  const [, setAgentRole] = useState<string>("customer_service");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [agentRes, oauthRes, healthRes, emailRes] = await Promise.all([
          authFetch(`/api/agents`),
          authFetch(`/api/oauth/crm/status`),
          authFetch(`/api/oauth/integration-health`),
          authFetch(`/api/emails/accounts`),
        ]);

        if (!active) return;

        if (oauthRes.ok) {
          const oauthData = await oauthRes.json();
          setGlobalIntegrations(oauthData);
        }
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setCalendarHealth({
            reconnect_google_calendar: !!healthData.reconnect_google_calendar,
            reconnect_microsoft_calendar: !!healthData.reconnect_microsoft_calendar,
          });
        }
        if (emailRes.ok) {
          const emailData = await emailRes.json();
          setEmailProviders(
            (emailData.accounts || [])
              .map((a: { provider?: string }) => a.provider)
              .filter(Boolean),
          );
        }

        if (agentRes.ok) {
          const agentData = await agentRes.json();
          const me = (agentData.agents || []).find((a: any) => a.id === agentId);
          if (me) {
            setAgentRole(me.role || "customer_service");
            // If they haven't explicitly set tools, it falls back to the role defaults
            if (me.enabledTools && Array.isArray(me.enabledTools)) {
              setEnabledTools(me.enabledTools);
            } else {
              setEnabledTools(getRoleToolSet(me.role));
            }
          }
        }
      } catch {
        if (active) toastError("Failed to load capabilities");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    loadData();
    return () => {
      active = false;
    };
  }, [agentId, toastError]);

  const handleToggleTool = (toolName: AgentToolName) => {
    setEnabledTools((prev) => {
      if (prev.includes(toolName)) {
        return prev.filter((t) => t !== toolName);
      }
      return [...prev, toolName];
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await authFetch(`/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledTools }),
      });
      if (!res.ok) throw new Error("Save failed");

      setSaveSuccess(true);
      toastSuccess("Capabilities saved", "Agent action permissions updated.");
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch {
      toastError("Failed to save capabilities");
    } finally {
      setIsSaving(false);
    }
  };

  const getIntegrationStatus = (integrationName?: string) => {
    const status = resolveTenantToolIntegrationStatus(integrationName as never, {
      oauthStatus: globalIntegrations,
      calendarReconnectGoogle: calendarHealth.reconnect_google_calendar,
      calendarReconnectMicrosoft: calendarHealth.reconnect_microsoft_calendar,
      emailProviders,
    });
    return status;
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-primary">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="wl-label">Loading capabilities...</span>
        </div>
      </div>
    );
  }

  // Group tools by category
  const groupedTools = AGENT_TOOL_CATALOG.reduce(
    (acc, tool) => {
      if (!acc[tool.group]) acc[tool.group] = [];
      acc[tool.group].push(tool);
      return acc;
    },
    {} as Record<string, (typeof AGENT_TOOL_CATALOG)[number][]>,
  );

  return (
    <div className="h-full flex flex-col p-4 md:p-6 overflow-hidden max-w-[min(100%,1400px)] mx-auto w-full safe-area-insets">
      <div className="wl-panel rounded-md p-5 md:p-6 shrink-0 flex items-center justify-between mb-6 sticky top-0 z-10 bg-card/80 backdrop-blur-xl">
        <div>
          <h3 className="font-display italic text-2xl text-foreground flex items-center gap-3">
            <Blocks className="w-6 h-6 text-primary" />
            Agent capabilities
          </h3>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Choose the built-in actions and connected integrations this agent is authorized to use
            during live calls and follow-ups.
          </p>
        </div>

        <ShadButton
          type="button"
          disableAnimations
          variant="outline"
          onClick={handleSave}
          disabled={isSaving}
          className="h-10 px-6 rounded-full bg-primary/10 border-primary/30 text-primary text-[var(--wireline-typography-overline-size)] uppercase tracking-[0.25em] hover:bg-primary/15"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          ) : saveSuccess ? (
            <CheckCircle2 className="w-4 h-4 text-primary" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saveSuccess ? "Saved" : "Save permissions"}
        </ShadButton>
      </div>

      <div className="flex-1 min-h-0 scroll-viewport space-y-8 pb-12">
        {Object.entries(groupedTools).map(([group, tools]) => (
          <div key={group} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px bg-primary/30 w-8" />
              <h4 className="wl-label text-primary/80">
                {group === "core" ? "Core actions" : `${group} integrations`}
              </h4>
              <div className="h-px bg-primary/10 flex-1" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 stagger-children resp-adaptive-grid">
              {tools.map((tool) => {
                const isEnabled = enabledTools.includes(tool.name);
                const status = getIntegrationStatus(tool.integration);
                const isMissingIntegration = status === "missing";

                return (
                  <div
                    key={tool.name}
                    role="button"
                    tabIndex={isMissingIntegration ? -1 : 0}
                    aria-pressed={isEnabled}
                    aria-disabled={isMissingIntegration || undefined}
                    aria-label={`${tool.label}${isEnabled ? " (enabled)" : ""}`}
                    className={cn(
                      "relative p-5 rounded-md border transition-all cursor-pointer overflow-hidden group",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      isEnabled && !isMissingIntegration
                        ? "bg-[color-mix(in_srgb,var(--wireline-color-action-primary-default)_5%,transparent)] border-[color-mix(in_srgb,var(--wireline-color-action-primary-default)_30%,var(--wireline-color-border-default))] shadow-[0_4px_24px_color-mix(in_srgb,var(--wireline-color-action-primary-default)_8%,transparent)] hover:-translate-y-px"
                        : "wl-panel hover:border-primary/30 hover:-translate-y-px",
                      isMissingIntegration && "opacity-75 cursor-not-allowed grayscale",
                    )}
                    onClick={() => {
                      if (!isMissingIntegration) handleToggleTool(tool.name);
                    }}
                    onKeyDown={(e) => {
                      if (isMissingIntegration) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleToggleTool(tool.name);
                      }
                    }}
                  >
                    {/* Background glow if enabled */}
                    {isEnabled && !isMissingIntegration && (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-40" />
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
                      </>
                    )}

                    <div className="relative z-10 flex items-start gap-4">
                      <div className="mt-1">
                        <div
                          className={cn(
                            "w-5 h-5 rounded flex items-center justify-center border transition-colors",
                            isEnabled
                              ? "bg-primary border-primary text-primary-foreground"
                              : "bg-muted border-border text-transparent",
                          )}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h5 className="font-medium text-foreground truncate text-sm">
                            {tool.label}
                          </h5>
                          {tool.integration && (
                            <span
                              className={cn(
                                "wl-label px-2 py-0.5 rounded-full border",
                                isMissingIntegration
                                  ? "border-rose-500/30 text-rose-600 bg-rose-500/10"
                                  : "border-primary/20 text-primary bg-primary/5",
                              )}
                            >
                              {tool.integration}
                            </span>
                          )}
                        </div>

                        <p className="text-caption leading-relaxed">{tool.description}</p>

                        {isMissingIntegration && (
                          <div className="mt-3 flex items-center gap-1.5 wl-micro-meta text-rose-600 bg-rose-500/5 py-1.5 px-2 rounded-md border border-rose-500/20">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>Requires global integration configuration.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
