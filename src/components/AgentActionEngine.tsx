/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect } from "react";
import { Save, Blocks, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { AGENT_TOOL_CATALOG, type AgentToolName, getRoleToolSet } from "../lib/agent-capabilities";

interface AgentActionEngineProps {
  agentId: string;
}

export default function AgentActionEngine({ agentId }: AgentActionEngineProps) {
  const { error: toastError, success: toastSuccess } = useToast();
  const [enabledTools, setEnabledTools] = useState<AgentToolName[]>([]);
  const [globalIntegrations, setGlobalIntegrations] = useState<any[]>([]);
  const [, setAgentRole] = useState<string>("customer_service");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [agentRes, intRes] = await Promise.all([
          authFetch(`/api/agents`), // To find this specific agent's config
          authFetch(`/api/health/integrations`),
        ]);

        if (!active) return;

        if (intRes.ok) {
          const intData = await intRes.json();
          setGlobalIntegrations(intData.integrations || []);
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
    if (!integrationName) return "configured"; // Core tools require no integration
    const int = globalIntegrations.find((i) => i.id === integrationName);
    return int?.status || "missing";
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-brand">
          <Loader2 className="w-8 h-8 animate-spin" />
          <span className="text-[10px] uppercase tracking-[0.3em]">Loading capabilities...</span>
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
    <div className="h-full flex flex-col p-4 md:p-6 overflow-hidden max-w-[1400px] mx-auto w-full">
      <div className="glass border border-white/10 rounded-2xl p-5 md:p-6 shrink-0 flex items-center justify-between mb-6 sticky top-0 z-10 bg-paper/80 backdrop-blur-xl">
        <div>
          <h3 className="font-display italic text-2xl text-ink flex items-center gap-3">
            <Blocks className="w-6 h-6 text-brand" />
            Agent capabilities
          </h3>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Choose the built-in actions and connected integrations this agent is authorized to use
            during live calls and follow-ups.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="disabled:opacity-50 disabled:cursor-not-allowed h-10 px-6 rounded-full bg-brand/15 border border-brand/40 text-brand text-[11px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-all flex items-center gap-2"
        >
          {isSaving ? (
            <div className="w-4 h-4 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
          ) : saveSuccess ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saveSuccess ? "Saved" : "Save permissions"}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide space-y-8 pb-12">
        {Object.entries(groupedTools).map(([group, tools]) => (
          <div key={group} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-px bg-brand/30 w-8" />
              <h4 className="text-[10px] uppercase tracking-[0.3em] text-brand/80">
                {group === "core" ? "Core actions" : `${group} integrations`}
              </h4>
              <div className="h-px bg-brand/10 flex-1" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {tools.map((tool) => {
                const isEnabled = enabledTools.includes(tool.name);
                const status = getIntegrationStatus(tool.integration);
                const isMissingIntegration = status === "missing";

                return (
                  <div
                    key={tool.name}
                    className={cn(
                      "relative p-5 rounded-2xl border transition-all cursor-pointer overflow-hidden group",
                      isEnabled && !isMissingIntegration
                        ? "bg-brand/5 border-brand/30 shadow-[0_0_15px_rgba(0, 0, 0 ,0.05)]"
                        : "glass border-white/10 hover:border-white/30",
                      isMissingIntegration && "opacity-75 cursor-not-allowed grayscale",
                    )}
                    onClick={() => {
                      if (!isMissingIntegration) handleToggleTool(tool.name);
                    }}
                  >
                    {/* Background glow if enabled */}
                    {isEnabled && !isMissingIntegration && (
                      <div className="absolute inset-0 bg-gradient-to-br from-brand/10 to-transparent opacity-50" />
                    )}

                    <div className="relative z-10 flex items-start gap-4">
                      <div className="mt-1">
                        <div
                          className={cn(
                            "w-5 h-5 rounded flex items-center justify-center border transition-colors",
                            isEnabled
                              ? "bg-brand border-brand text-on-brand"
                              : "bg-black/10 border-white/20 text-transparent",
                          )}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h5 className="font-medium text-ink truncate text-sm">{tool.label}</h5>
                          {tool.integration && (
                            <span
                              className={cn(
                                "text-[8px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full border",
                                isMissingIntegration
                                  ? "border-amber-500/30 text-amber-600 bg-amber-500/10"
                                  : "border-brand/20 text-brand bg-brand/10",
                              )}
                            >
                              {tool.integration}
                            </span>
                          )}
                        </div>

                        <p className="text-caption leading-relaxed">{tool.description}</p>

                        {isMissingIntegration && (
                          <div className="mt-3 flex items-center gap-1.5 text-amber-600 text-[10px] bg-amber-500/5 py-1.5 px-2 rounded-md border border-amber-500/20">
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
