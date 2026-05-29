/* eslint-disable @typescript-eslint/no-explicit-any -- AgentConfigPanel is
 * the consumer side of FleetSettings' loosely-typed agent + config rows; its
 * props mirror those state shapes (selectedAgent, agentConfig, agentStats,
 * tool callbacks). Until /api/agents and /api/agents/:id/config are modeled
 * in contracts/api-types.ts, the props stay as any | null. */
import React, { useState } from "react";
import {
  ChevronLeft,
  Target,
  Briefcase,
  ChevronRight,
  Loader2,
  RefreshCw,
  Clock,
  Link as LinkIcon,
  Phone,
  Radio,
  Zap,
  Mail,
  Settings2,
  Save,
  FileText,
  Pencil,
  Trash2,
  Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../../lib/utils";
import { authFetch } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import AgentExportImport from "../AgentExportImport";
import AgentBusinessProfile from "../AgentBusinessProfile";
import AgentScorecard from "../AgentScorecard";
import VoiceFineTuningPanel from "../VoiceFineTuningPanel";
import AgentIntegrationCanvas from "../AgentIntegrationCanvas";
import { Sparkline, RoleBadge, PREMIUM_VOICES, AGENT_ROLES } from "../fleet/helpers";
import { resolveAgentTools, getRoleToolSet } from "../../lib/agent-capabilities";

interface AgentConfigPanelProps {
  selectedAgent: any | null;
  setSelectedAgent: (agent: any) => void;
  agentConfig: any;
  setAgentConfig: (config: any) => void;
  isConfigLoading: boolean;
  fetchAgentConfig: (id: string) => Promise<void>;
  updateAgentMeta: (updates: any) => Promise<void>;
  toggleIntegrationGroup: (integration: string, enable: boolean) => Promise<void>;
  toggleAgentTool: (toolName: any) => Promise<void>;
  resetAgentToolsToRoleDefaults: () => Promise<void>;
  agentStats: Record<string, any>;
  fetchAgentPerformance: (id: string, force?: boolean) => Promise<void>;
  isApplyingTemplate: boolean;
  applyRoleTemplate: (role: string) => Promise<void>;
  integrationStatus: Record<string, { connected: boolean }> | null;
}

export default function AgentConfigPanel({
  selectedAgent,
  setSelectedAgent,
  agentConfig,
  setAgentConfig,
  isConfigLoading,
  fetchAgentConfig,
  updateAgentMeta,
  toggleIntegrationGroup,
  toggleAgentTool,
  resetAgentToolsToRoleDefaults,
  agentStats,
  fetchAgentPerformance,
  isApplyingTemplate,
  applyRoleTemplate,
  integrationStatus,
}: AgentConfigPanelProps) {
  const { success: toastSuccess, error: toastError } = useToast();

  const [editingDirective, setEditingDirective] = useState<{ id: string; content: string } | null>(
    null,
  );
  const [editingKnowledge, setEditingKnowledge] = useState<{ id: string; content: string } | null>(
    null,
  );
  const [newDirective, setNewDirective] = useState("");
  const [newKnowledge, setNewKnowledge] = useState("");
  const [isSavingEntry, setIsSavingEntry] = useState(false);

  const updatePersonality = async (val: string) => {
    setAgentConfig({ ...agentConfig, personality: val });
    try {
      const resp = await authFetch(`/api/agent-config/${selectedAgent.id}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "personality", content: val }),
      });
      if (resp.ok) {
        toastSuccess("Behavioral engine saved", "Agent personality updated.");
      } else {
        toastError("Save failed", "Could not update the behavioral engine.");
      }
    } catch {
      toastError("Save failed", "Network error — please try again.");
    }
  };

  const saveManualEntry = async (
    type: "directive" | "knowledge",
    content: string,
    overrideId?: string,
  ) => {
    if (!content.trim()) return;
    setIsSavingEntry(true);
    try {
      const resp = await authFetch(`/api/agent-config/${selectedAgent.id}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, content, overrideId }),
      });
      if (resp.ok) {
        await fetchAgentConfig(selectedAgent.id);
        if (type === "directive") {
          setEditingDirective(null);
          setNewDirective("");
        }
        if (type === "knowledge") {
          setEditingKnowledge(null);
          setNewKnowledge("");
        }
      } else {
        toastError("Save failed", `Could not save ${type}. Please try again.`);
      }
    } catch {
      toastError("Save failed", "Network error — please try again.");
    }
    setIsSavingEntry(false);
  };

  const deleteRule = async (type: string, rowId: string) => {
    try {
      const resp = await authFetch(`/api/agent-config/${selectedAgent.id}/${type}/${rowId}`, {
        method: "DELETE",
      });
      if (resp.ok) {
        fetchAgentConfig(selectedAgent.id);
      } else {
        toastError("Delete failed", "Could not remove the entry. Please try again.");
      }
    } catch {
      toastError("Delete failed", "Network error — please try again.");
    }
  };

  return (
    <main
      className={cn(
        "flex-1 h-full overflow-y-auto px-3 py-3 scrollbar-hide",
        !selectedAgent && "hidden md:block",
      )}
    >
      {/* Mobile-only back button — clears selectedAgent so the list
    reappears. Hidden on md+ where both panes coexist. */}
      {selectedAgent && (
        <button
          onClick={() => setSelectedAgent(null)}
          aria-label="Back to agent list"
          className="md:hidden mb-3 inline-flex items-center gap-2 px-3 h-10 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.28em] text-ink/80 hover:border-brand/40 active:scale-95 transition-all"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to fleet
        </button>
      )}
      <AnimatePresence mode="wait">
        {!selectedAgent ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="h-full flex flex-col items-center justify-center gap-4 text-center px-6"
          >
            <div className="w-16 h-16 rounded-2xl glass border border-white/10 flex items-center justify-center text-muted">
              <Target className="w-7 h-7" />
            </div>
            <div className="space-y-1.5">
              <h3 className="font-display italic lowercase text-2xl text-ink">pick an agent</h3>
              <p className="text-caption max-w-sm leading-relaxed">
                Choose an agent on the left to view its calls, edit its personality, or update what
                it knows.
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={selectedAgent.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-[1200px] mx-auto space-y-3"
          >
            {(() => {
              const selectedToolNames = resolveAgentTools(
                selectedAgent.role,
                selectedAgent.enabled_tools,
              );
              const roleDefaultTools = getRoleToolSet(selectedAgent.role);
              const usingRoleDefaults = !Array.isArray(selectedAgent.enabled_tools);
              return (
                <header className="rounded-2xl glass border border-white/10 p-4 relative overflow-hidden">
                  <div
                    className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
                    style={{
                      background: "radial-gradient(circle, #4F1E7B, transparent)",
                    }}
                  />

                  <div className="relative z-10 flex flex-col lg:flex-row items-start justify-between gap-4">
                    <div className="flex-1 w-full space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-8 bg-brand rounded-full" />
                        <input
                          type="text"
                          value={selectedAgent.name}
                          onChange={(e) => updateAgentMeta({ name: e.target.value })}
                          className="text-3xl md:text-4xl font-display italic bg-transparent outline-none border-b border-transparent focus:border-brand/60 text-ink w-full leading-none pb-1"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded-full border text-[9px] uppercase tracking-[0.25em] leading-none",
                            selectedAgent.channel === "email"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                              : "bg-brand/10 border-brand/30 text-brand",
                          )}
                        >
                          {selectedAgent.channel}
                        </span>
                        <RoleBadge role={selectedAgent.role} size="sm" />
                        <div className="text-[9px] uppercase tracking-[0.25em] text-muted/70 inline-flex items-center gap-1.5">
                          ID: <span className="font-mono text-ink/80">{selectedAgent.id}</span>
                        </div>
                      </div>

                      {/* Role assignment row */}
                      <div className="rounded-xl glass border border-white/8 p-3 flex flex-wrap items-center gap-3">
                        <Briefcase className="w-3.5 h-3.5 text-brand shrink-0" />
                        <div className="flex-1 min-w-[180px] space-y-1">
                          <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                            Agent role
                          </label>
                          <div className="relative">
                            <select
                              aria-label="Agent role"
                              value={selectedAgent.role || "customer_service"}
                              onChange={(e) => updateAgentMeta({ role: e.target.value })}
                              className="w-full text-xs bg-black/5 border border-black/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-brand/50 cursor-pointer appearance-none text-ink"
                            >
                              {AGENT_ROLES.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                            <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[10px] text-muted/70 leading-relaxed max-w-[280px]">
                            {
                              AGENT_ROLES.find(
                                (r) => r.value === (selectedAgent.role || "customer_service"),
                              )?.description
                            }
                          </p>
                          <button
                            onClick={() =>
                              applyRoleTemplate(selectedAgent.role || "customer_service")
                            }
                            disabled={isApplyingTemplate}
                            className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-ink/80 hover:border-brand/40 hover:text-brand transition-colors disabled:opacity-50"
                          >
                            {isApplyingTemplate ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-2.5 h-2.5" />
                            )}
                            Apply template
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="relative z-10 mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 pt-3 border-t border-white/8">
                    {/* Performance stats */}
                    {agentStats[selectedAgent.id] &&
                      (() => {
                        const s = agentStats[selectedAgent.id];
                        const total =
                          s.sentiment.positive + s.sentiment.neutral + s.sentiment.negative || 1;
                        const posPct = Math.round((s.sentiment.positive / total) * 100);
                        return (
                          <div className="md:col-span-2 space-y-2 mb-2">
                            <div className="grid grid-cols-4 gap-2">
                              <div className="rounded-lg glass border border-white/8 p-2.5">
                                <div className="text-[8px] uppercase tracking-[0.3em] text-brand mb-1">
                                  Calls
                                </div>
                                <div className="font-display italic text-xl text-ink">
                                  {s.callCount}
                                </div>
                              </div>
                              <div className="rounded-lg glass border border-white/8 p-2.5">
                                <div className="text-[8px] uppercase tracking-[0.3em] text-brand mb-1 flex items-center gap-1">
                                  <Clock className="w-2 h-2" /> Min
                                </div>
                                <div className="font-display italic text-xl text-ink">
                                  {s.totalMinutes}
                                </div>
                              </div>
                              <div className="rounded-lg glass border border-white/8 p-2.5">
                                <div className="text-[8px] uppercase tracking-[0.3em] text-brand mb-1">
                                  Avg Score
                                </div>
                                <div className="font-display italic text-xl text-ink">
                                  {s.avgScore > 0 ? (
                                    s.avgScore
                                  ) : (
                                    <span className="text-muted/70 text-sm not-italic">—</span>
                                  )}
                                </div>
                              </div>
                              <div className="rounded-lg glass border border-white/8 p-2.5 relative">
                                <div className="text-[8px] uppercase tracking-[0.3em] text-brand mb-1">
                                  Sentiment
                                </div>
                                <div className="font-display italic text-xl text-ink">
                                  {posPct}%
                                  <span className="text-xs text-muted not-italic ml-1">pos</span>
                                </div>
                                <button
                                  onClick={() => fetchAgentPerformance(selectedAgent.id, true)}
                                  title="Refresh stats"
                                  className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full glass border border-white/10 text-muted/70 hover:text-brand transition-colors"
                                >
                                  <RefreshCw className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            </div>
                            {/* 7-day activity sparkline */}
                            {s.sparkline && s.sparkline.some((v: number) => v > 0) && (
                              <div className="rounded-lg glass border border-white/8 px-3 py-2 flex items-center gap-3">
                                <span className="text-[8px] uppercase tracking-[0.3em] text-muted/70 shrink-0">
                                  7d
                                </span>
                                <div className="flex-1 min-w-0">
                                  <Sparkline data={s.sparkline} width={160} height={20} />
                                </div>
                                <div className="flex gap-2 shrink-0">
                                  {s.sparkline.map((v: number, i: number) => (
                                    <span
                                      key={`day-${i}`}
                                      className="text-[8px] font-mono tabular-nums text-muted/70"
                                      title={`${v} call${v !== 1 ? "s" : ""}`}
                                    >
                                      {v}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
                        <LinkIcon className="w-2.5 h-2.5 text-brand" /> Knowledge URL
                      </label>
                      <input
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        value={selectedAgent.website_url || ""}
                        onChange={(e) => updateAgentMeta({ website_url: e.target.value })}
                        placeholder="https://example.com"
                        className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/70"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
                        <Phone className="w-2.5 h-2.5 text-brand" /> Transfer phone
                      </label>
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={selectedAgent.transfer_phone || ""}
                        onChange={(e) => updateAgentMeta({ transfer_phone: e.target.value })}
                        placeholder="+1 800 555 0100"
                        className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/70 tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="relative z-10 mt-3 grid grid-cols-1 gap-3">
                    {/* Voice Node Config */}
                    {selectedAgent.channel !== "email" && (
                      <div className="rounded-xl glass border border-white/8 p-3 space-y-3">
                        <div className="flex items-center gap-2 pb-2 border-b border-white/8">
                          <Radio className="w-3.5 h-3.5 text-brand" />
                          <h3 className="font-display italic lowercase text-base text-ink">
                            carrier signal parameters
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                              Voice signature
                            </label>
                            <div className="relative">
                              <select
                                aria-label="Voice signature"
                                value={
                                  PREMIUM_VOICES.find((v) => v.id === selectedAgent.voice_id)
                                    ? selectedAgent.voice_id
                                    : "custom"
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val !== "custom") {
                                    const voiceData = PREMIUM_VOICES.find((v) => v.id === val);
                                    updateAgentMeta({
                                      voice_id: val,
                                      voice_provider: voiceData?.provider || "11labs",
                                    });
                                  }
                                }}
                                className="w-full text-xs bg-black/5 border border-black/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-brand/50 cursor-pointer appearance-none text-ink"
                              >
                                <optgroup label="Premium">
                                  {PREMIUM_VOICES.map((v) => (
                                    <option key={v.id} value={v.id}>
                                      {v.name}
                                    </option>
                                  ))}
                                </optgroup>
                                <option value="custom">Custom override</option>
                              </select>
                              <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                              Archetype
                            </label>
                            <div className="relative">
                              <select
                                aria-label="Archetype"
                                value={selectedAgent.archetype || "Receptionist"}
                                onChange={(e) => updateAgentMeta({ archetype: e.target.value })}
                                className="w-full text-xs bg-black/5 border border-black/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-brand/50 cursor-pointer appearance-none text-ink"
                              >
                                <option value="Receptionist">Receptionist</option>
                                <option value="The Closer">The Closer</option>
                                <option value="Support Tech">Support Tech</option>
                                <option value="The Empath">The Empath</option>
                                <option value="The Collector">The Collector</option>
                                <option value="Lead Qualifier">Lead Qualifier</option>
                              </select>
                              <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                              Personality vibe
                            </label>
                            <div className="grid grid-cols-3 gap-1.5">
                              {(["warm", "playful", "authoritative"] as const).map((v) => {
                                const current = (selectedAgent as any).personality_vibe || "warm";
                                const isActive = current === v;
                                const labels: Record<typeof v, string> = {
                                  warm: "Warm",
                                  playful: "Playful",
                                  authoritative: "Crisp",
                                };
                                return (
                                  <button
                                    key={v}
                                    type="button"
                                    onClick={() => updateAgentMeta({ personality_vibe: v })}
                                    className={cn(
                                      "px-2 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.2em] font-medium transition-all",
                                      isActive
                                        ? "bg-brand/15 border border-brand/40 text-brand"
                                        : "bg-black/5 border border-black/10 text-muted hover:text-ink hover:border-brand/20",
                                    )}
                                  >
                                    {labels[v]}
                                  </button>
                                );
                              })}
                            </div>
                            <p className="text-[9px] text-muted/70 leading-relaxed">
                              Pick once. The agent keeps this one personality, voice, and cadence
                              for the whole call — it never switches tone mid-conversation.
                            </p>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                              Ambient atmosphere
                            </label>
                            <div className="relative">
                              <select
                                aria-label="Ambient atmosphere"
                                value={selectedAgent.ambient_noise || "off"}
                                onChange={(e) => updateAgentMeta({ ambient_noise: e.target.value })}
                                className="w-full text-xs bg-black/5 border border-black/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-brand/50 cursor-pointer appearance-none text-ink"
                              >
                                <option value="off">Studio (silent)</option>
                                <option value="office">Office (kinetic)</option>
                              </select>
                              <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                                Speaking rate
                              </label>
                              <span className="text-[10px] font-medium tabular-nums text-ink">
                                {Number((selectedAgent as any).voice_speed ?? 1.0).toFixed(2)}×
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0.7}
                              max={1.2}
                              step={0.05}
                              value={Number((selectedAgent as any).voice_speed ?? 1.0)}
                              onChange={(e) =>
                                updateAgentMeta({
                                  voice_speed: Number(e.target.value).toFixed(2),
                                })
                              }
                              className="w-full accent-brand cursor-pointer"
                              aria-label="ElevenLabs speaking rate"
                            />
                            <p className="text-[9px] text-muted/70 leading-relaxed">
                              0.7 = slower (elderly callers). 1.2 = faster (impatient callers).
                              ElevenLabs voices only.
                            </p>
                          </div>
                        </div>

                        <VoiceFineTuningPanel
                          agent={selectedAgent}
                          onLocalChange={(patch) =>
                            setSelectedAgent({ ...selectedAgent, ...patch })
                          }
                          onCommit={(patch) => updateAgentMeta(patch)}
                        />

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
                              <Zap className="w-2.5 h-2.5 text-brand" /> Initial greeting
                            </label>
                          </div>
                          <input
                            type="text"
                            value={selectedAgent.first_message || ""}
                            onChange={(e) => updateAgentMeta({ first_message: e.target.value })}
                            className="w-full text-base bg-black/5 border border-black/10 rounded-lg px-3 py-2.5 outline-none focus:border-brand/50 text-ink placeholder:text-muted/70 font-display italic"
                          />
                        </div>
                      </div>
                    )}

                    {/* Email Config */}
                    {(selectedAgent.channel === "email" ||
                      selectedAgent.channel === "omnichannel" ||
                      !selectedAgent.channel) && (
                      <div className="rounded-xl glass border border-white/8 p-3 space-y-3">
                        <div className="flex items-center gap-2 pb-2 border-b border-white/8">
                          <Mail className="w-3.5 h-3.5 text-emerald-500" />
                          <h3 className="font-display italic lowercase text-base text-ink">
                            email relay heuristics
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <div className="rounded-lg glass border border-white/8 p-3 flex items-center justify-between gap-3">
                              <div className="space-y-0.5 min-w-0">
                                <h4 className="text-sm text-ink">Auto-respond</h4>
                                <p className="text-[10px] text-muted/70 leading-relaxed">
                                  Autonomous reply on incoming threads.
                                </p>
                              </div>
                              <button
                                onClick={() =>
                                  updateAgentMeta({
                                    email_auto_respond: !selectedAgent.email_auto_respond,
                                  })
                                }
                                className={cn(
                                  "shrink-0 w-10 h-5 rounded-full border transition-colors flex items-center px-0.5 cursor-pointer",
                                  selectedAgent.email_auto_respond
                                    ? "bg-emerald-500/30 border-emerald-500/50"
                                    : "bg-white/5 border-white/15",
                                )}
                              >
                                <motion.div
                                  animate={{
                                    x: selectedAgent.email_auto_respond ? 18 : 0,
                                  }}
                                  className={cn(
                                    "w-4 h-4 rounded-full",
                                    selectedAgent.email_auto_respond
                                      ? "bg-emerald-500"
                                      : "bg-muted/60",
                                  )}
                                />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                                Relay tone
                              </label>
                              <div className="relative">
                                <select
                                  aria-label="Relay tone"
                                  value={selectedAgent.email_agent_tone || "Professional"}
                                  onChange={(e) =>
                                    updateAgentMeta({ email_agent_tone: e.target.value })
                                  }
                                  className="w-full text-xs bg-black/5 border border-black/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-emerald-400/50 cursor-pointer appearance-none text-ink"
                                >
                                  <option value="Professional">Authoritative</option>
                                  <option value="Friendly">Diplomatic</option>
                                  <option value="Direct">Concise</option>
                                </select>
                                <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                                Signature
                              </label>
                              <input
                                type="text"
                                value={selectedAgent.email_signature || ""}
                                onChange={(e) =>
                                  updateAgentMeta({ email_signature: e.target.value })
                                }
                                placeholder="— Best, Agent"
                                className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-emerald-400/50 text-ink placeholder:text-muted/70"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* System prompt override — operators can replace the
                        auto-composed base identity prompt. Call-specific
                        context + safety guardrails are still appended at
                        runtime, so this never disables compliance. */}
                    {(() => {
                      const overrideValue =
                        typeof selectedAgent.system_prompt_override === "string"
                          ? selectedAgent.system_prompt_override
                          : "";
                      const usingAutoComposed = !overrideValue.trim();
                      return (
                        <div className="rounded-xl glass border border-white/8 p-3 space-y-3">
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/8">
                            <div className="flex items-center gap-2">
                              <FileText className="w-3.5 h-3.5 text-brand" />
                              <h3 className="font-display italic lowercase text-base text-ink">
                                system prompt
                              </h3>
                            </div>
                            <button
                              onClick={() => {
                                setSelectedAgent({
                                  ...selectedAgent,
                                  system_prompt_override: null,
                                });
                                void updateAgentMeta({ system_prompt_override: null });
                              }}
                              disabled={usingAutoComposed}
                              className="shrink-0 inline-flex items-center gap-1.5 h-11 sm:h-8 px-3 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-ink/80 hover:border-brand/40 hover:text-brand transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <RefreshCw className="w-2.5 h-2.5" />
                              Use auto-composed prompt
                            </button>
                          </div>
                          <p className="text-[10px] text-muted/70 leading-relaxed">
                            Override the auto-composed identity prompt. Caller context, knowledge,
                            directives and the compliance / escalation guardrails are still appended
                            automatically on every call. Leave blank to use the auto-composed
                            prompt.
                          </p>
                          <textarea
                            aria-label="System prompt override"
                            value={overrideValue}
                            maxLength={8000}
                            onChange={(e) =>
                              setSelectedAgent({
                                ...selectedAgent,
                                system_prompt_override: e.target.value,
                              })
                            }
                            onBlur={(e) =>
                              void updateAgentMeta({
                                system_prompt_override: e.target.value.trim()
                                  ? e.target.value
                                  : null,
                              })
                            }
                            className="w-full h-48 px-4 py-3 rounded-xl bg-black/5 border border-black/10 text-ink outline-none focus:border-brand/50 transition-all resize-none text-sm leading-relaxed placeholder:text-muted/70"
                            placeholder="Leave blank to use the auto-composed prompt. Type here to define the agent's full identity, tone, and behavior — this replaces the generated base prompt."
                          />
                          <div className="flex items-center justify-between text-[9px] text-muted/70">
                            <span>
                              {usingAutoComposed
                                ? "Using auto-composed prompt"
                                : "Using custom override"}
                            </span>
                            <span className="tabular-nums">{overrideValue.length}/8000</span>
                          </div>
                        </div>
                      );
                    })()}

                    <AgentIntegrationCanvas
                      agentName={selectedAgent.name}
                      agentRole={selectedAgent.role}
                      selectedToolNames={selectedToolNames}
                      roleDefaultTools={roleDefaultTools}
                      usingRoleDefaults={usingRoleDefaults}
                      integrationStatus={integrationStatus}
                      onToggleIntegrationGroup={toggleIntegrationGroup}
                      onToggleTool={toggleAgentTool}
                      onResetToDefaults={resetAgentToolsToRoleDefaults}
                    />

                    <div className="rounded-xl glass border border-white/8 p-3 space-y-3">
                      <div className="rounded-lg border border-white/8 bg-white/3 p-3 space-y-3">
                        <div className="text-[9px] uppercase tracking-[0.3em] text-brand/70">
                          Channels
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(["voice", "email", "sms"] as const).map((ch) => {
                            const channels: string[] = selectedAgent.channels || ["voice"];
                            const active = channels.includes(ch);
                            return (
                              <button
                                key={ch}
                                type="button"
                                onClick={() => {
                                  const next = active
                                    ? channels.filter((c) => c !== ch)
                                    : [...channels, ch];
                                  if (next.length === 0) return;
                                  updateAgentMeta({ channels: next });
                                }}
                                className={cn(
                                  "px-3 py-1.5 rounded-full text-[10px] font-medium border transition-all capitalize",
                                  active
                                    ? "bg-brand/15 border-brand/40 text-brand"
                                    : "bg-white/5 border-white/10 text-muted hover:border-white/20",
                                )}
                              >
                                {ch}
                              </button>
                            );
                          })}
                        </div>

                        <div className="text-[9px] uppercase tracking-[0.3em] text-brand/70 pt-2">
                          Autonomy Level
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              { val: "inherit", label: "Inherit" },
                              { val: "auto", label: "Full Auto" },
                              { val: "supervised", label: "Supervised" },
                              { val: "draft", label: "Draft Only" },
                            ] as const
                          ).map(({ val, label }) => {
                            const current = selectedAgent.autonomy_level || "inherit";
                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() => updateAgentMeta({ autonomy_level: val })}
                                className={cn(
                                  "px-3 py-1.5 rounded-full text-[10px] font-medium border transition-all",
                                  current === val
                                    ? "bg-brand/15 border-brand/40 text-brand"
                                    : "bg-white/5 border-white/10 text-muted hover:border-white/20",
                                )}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[9px] text-muted/70 leading-relaxed">
                          Inherit uses the tenant-wide setting. Full Auto executes actions
                          immediately. Supervised queues for approval on high-risk actions. Draft
                          Only always requires operator sign-off.
                        </p>
                      </div>
                    </div>
                  </div>
                </header>
              );
            })()}

            {isConfigLoading ? (
              <div
                role="status"
                aria-live="polite"
                className="flex flex-col items-center justify-center gap-3 py-20"
              >
                <Loader2 className="w-5 h-5 animate-spin text-brand" aria-hidden="true" />
                <span className="app-section-title/70 font-display italic text-sm">
                  Loading configuration
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Personality Matrix */}
                <section className="rounded-2xl glass border border-white/10 p-4 relative overflow-hidden">
                  <div
                    className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
                    style={{
                      background: "radial-gradient(circle, #4F1E7B, transparent)",
                    }}
                  />
                  <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-brand" />
                      <div>
                        <h3 className="font-display italic lowercase text-xl text-ink leading-none">
                          behavioral engine
                        </h3>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-1">
                          Base heuristic instructions
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <AgentExportImport
                        agentId={selectedAgent.id}
                        agentName={selectedAgent.name}
                      />
                      <button
                        onClick={() => updatePersonality(agentConfig.personality)}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-all"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={agentConfig.personality}
                    onChange={(e) =>
                      setAgentConfig({ ...agentConfig, personality: e.target.value })
                    }
                    className="relative z-10 w-full h-48 px-4 py-3 rounded-xl bg-black/5 border border-black/10 text-ink outline-none focus:border-brand/50 transition-all resize-none text-sm leading-relaxed placeholder:text-muted/70"
                    placeholder="Define the agent's identity, tone, and behavioral patterns…"
                  />
                </section>

                {/* Business profile */}
                <AgentBusinessProfile
                  value={{
                    business_hours: selectedAgent.business_hours,
                    timezone: selectedAgent.timezone,
                    compliance_mode: selectedAgent.compliance_mode,
                    disallowed_topics: selectedAgent.disallowed_topics,
                    escalation_keywords: selectedAgent.escalation_keywords,
                    escalation_phone: selectedAgent.escalation_phone,
                    escalation_email: selectedAgent.escalation_email,
                    escalation_handoff_enabled: selectedAgent.escalation_handoff_enabled,
                    business_variables: selectedAgent.business_variables,
                    out_of_hours_message: selectedAgent.out_of_hours_message,
                    kpi_focus: selectedAgent.kpi_focus,
                  }}
                  onChange={(profile) => updateAgentMeta(profile)}
                />

                {/* Outcome-aligned scorecard */}
                <AgentScorecard
                  key={`${selectedAgent.id}:${selectedAgent.kpi_focus || "general"}`}
                  agentId={selectedAgent.id}
                  days={30}
                  title={`Performance · 30d · ${selectedAgent.kpi_focus || "general"}`}
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* Directives */}
                  <section className="rounded-2xl glass border border-white/10 p-3 flex flex-col min-h-[560px] md:h-[400px] max-h-[70vh]">
                    <header className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/8">
                      <div>
                        <h3 className="font-display italic lowercase text-lg text-ink leading-none">
                          tactical logic
                        </h3>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-0.5">
                          Hard constraints
                        </p>
                      </div>
                      <span className="px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-500 text-[9px] uppercase tracking-[0.25em] leading-none">
                        Inviolable
                      </span>
                    </header>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-hide">
                      <AnimatePresence mode="popLayout">
                        {agentConfig.directives?.length === 0 ? (
                          <div className="py-12 text-center app-section-title/60">
                            No directives yet
                          </div>
                        ) : (
                          agentConfig.directives?.map((d: any) => (
                            <motion.div
                              layout
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              key={d.id}
                              className="rounded-xl bg-rose-500/8 border border-rose-500/20 p-3 group"
                            >
                              {editingDirective && editingDirective.id === d.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={editingDirective.content}
                                    onChange={(e) =>
                                      setEditingDirective({
                                        id: d.id,
                                        content: e.target.value,
                                      })
                                    }
                                    className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-rose-400/50 text-ink min-h-[80px] resize-none"
                                  />
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      onClick={() => setEditingDirective(null)}
                                      className="px-2.5 py-1 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-muted hover:text-ink"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() =>
                                        saveManualEntry(
                                          "directive",
                                          editingDirective!.content,
                                          d.id,
                                        )
                                      }
                                      disabled={isSavingEntry}
                                      className="px-2.5 py-1 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 disabled:opacity-50"
                                    >
                                      {isSavingEntry ? "Saving…" : "Save"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2 items-start justify-between">
                                  <div className="flex-1 text-sm text-ink/90 leading-relaxed">
                                    {d.content}
                                  </div>
                                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                                    <button
                                      onClick={() =>
                                        setEditingDirective({
                                          id: d.id,
                                          content: d.content,
                                        })
                                      }
                                      aria-label="Edit directive"
                                      title="Edit directive"
                                      className="w-6 h-6 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-ink hover:border-white/30"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => deleteRule("directive", d.id)}
                                      aria-label="Delete directive"
                                      title="Delete directive"
                                      className="w-6 h-6 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-rose-500 hover:border-rose-500/30"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          ))
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/8 space-y-1.5">
                      <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                        Add directive
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={newDirective}
                          onChange={(e) => setNewDirective(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && saveManualEntry("directive", newDirective)
                          }
                          placeholder="e.g. Always verify date of birth…"
                          className="flex-1 text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-rose-400/50 text-ink placeholder:text-muted/70"
                        />
                        <button
                          onClick={() => saveManualEntry("directive", newDirective)}
                          disabled={!newDirective || isSavingEntry}
                          aria-label="Add directive"
                          className="w-9 h-9 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center hover:bg-rose-500/25 disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </section>

                  {/* Knowledge Base */}
                  <section className="rounded-2xl glass border border-white/10 p-3 flex flex-col min-h-[560px] md:h-[400px] max-h-[70vh]">
                    <header className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/8">
                      <div>
                        <h3 className="font-display italic lowercase text-lg text-ink leading-none">
                          knowledge base
                        </h3>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-0.5">
                          Knowledge base
                        </p>
                      </div>
                      <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-600 text-[9px] uppercase tracking-[0.25em] leading-none">
                        Factual
                      </span>
                    </header>
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-hide">
                      <AnimatePresence mode="popLayout">
                        {agentConfig.knowledge?.length === 0 ? (
                          <div className="py-12 text-center app-section-title/60">No facts yet</div>
                        ) : (
                          agentConfig.knowledge?.map((k: any) => (
                            <motion.div
                              layout
                              initial={{ opacity: 0, x: 6 }}
                              animate={{ opacity: 1, x: 0 }}
                              key={k.id}
                              className="rounded-xl bg-blue-500/8 border border-blue-500/20 p-3 group"
                            >
                              {editingKnowledge && editingKnowledge.id === k.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={editingKnowledge.content}
                                    onChange={(e) =>
                                      setEditingKnowledge({
                                        id: k.id,
                                        content: e.target.value,
                                      })
                                    }
                                    className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-blue-400/50 text-ink min-h-[80px] resize-none"
                                  />
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      onClick={() => setEditingKnowledge(null)}
                                      className="px-2.5 py-1 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-muted hover:text-ink"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() =>
                                        saveManualEntry(
                                          "knowledge",
                                          editingKnowledge!.content,
                                          k.id,
                                        )
                                      }
                                      disabled={isSavingEntry}
                                      className="px-2.5 py-1 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 disabled:opacity-50"
                                    >
                                      {isSavingEntry ? "Saving…" : "Save"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2 items-start justify-between">
                                  <div className="flex-1 text-sm text-ink/90 leading-relaxed">
                                    {k.content}
                                  </div>
                                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                                    <button
                                      onClick={() =>
                                        setEditingKnowledge({
                                          id: k.id,
                                          content: k.content,
                                        })
                                      }
                                      aria-label="Edit knowledge fact"
                                      title="Edit knowledge fact"
                                      className="w-6 h-6 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-ink hover:border-white/30"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button
                                      onClick={() => deleteRule("knowledge", k.id)}
                                      aria-label="Delete knowledge fact"
                                      title="Delete knowledge fact"
                                      className="w-6 h-6 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-blue-400 hover:border-blue-500/30"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          ))
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="mt-3 pt-3 border-t border-white/8 space-y-1.5">
                      <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">
                        Add fact
                      </label>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={newKnowledge}
                          onChange={(e) => setNewKnowledge(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && saveManualEntry("knowledge", newKnowledge)
                          }
                          placeholder="e.g. Office closes at 5pm…"
                          className="flex-1 text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-blue-400/50 text-ink placeholder:text-muted/70"
                        />
                        <button
                          onClick={() => saveManualEntry("knowledge", newKnowledge)}
                          disabled={!newKnowledge || isSavingEntry}
                          aria-label="Add knowledge fact"
                          className="w-9 h-9 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center hover:bg-blue-500/25 disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
