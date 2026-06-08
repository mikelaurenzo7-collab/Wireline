/* eslint-disable @typescript-eslint/no-explicit-any -- AgentConfigPanel is
 * the consumer side of FleetSettings' loosely-typed agent + config rows; its
 * props mirror those state shapes (selectedAgent, agentConfig, agentStats,
 * tool callbacks). Until /api/agents and /api/agents/:id/config are modeled
 * in contracts/api-types.ts, the props stay as any | null. */
import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  Target,
  Briefcase,
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
  Workflow,
  ArrowUpRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import { InlineEmpty } from "../ui/InlineEmpty";
import { OPS_TRAINING_PANEL } from "../../lib/wireline-ops-design";
import { authFetch } from "../../lib/api";
import { useToast } from "../../contexts/ToastContext";
import AgentExportImport from "../AgentExportImport";
import AgentBusinessProfile from "../AgentBusinessProfile";
import AgentScorecard from "../AgentScorecard";
import VoiceFineTuningPanel from "../VoiceFineTuningPanel";
import AgentIntegrationCanvas from "../AgentIntegrationCanvas";
import { Sparkline, RoleBadge, PREMIUM_VOICES, AGENT_ROLES } from "../fleet/helpers";
import { resolveAgentTools, getRoleToolSet } from "../../lib/agent-capabilities";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/shadcn/Select";
import { Input } from "../ui/shadcn/Input";
import { Slider } from "../ui/shadcn/Slider";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { VoiceFieldSelect, type VoiceOption } from "./VoiceSelector";
import ToolTogglePanel from "./ToolTogglePanel";

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
  const [clonedVoices, setClonedVoices] = useState<VoiceOption[]>([]);

  useEffect(() => {
    let active = true;
    authFetch("/api/voices")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (!active || !Array.isArray(rows)) return;
        setClonedVoices(
          rows.map((v: { id: string; name?: string; provider?: string }) => ({
            id: v.id,
            name: v.name || "Cloned voice",
            provider: v.provider || "11labs",
          })),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const voiceCatalog = [...clonedVoices, ...PREMIUM_VOICES];
  const isCustomPrimaryVoice =
    !!selectedAgent?.voice_id && !voiceCatalog.some((v) => v.id === selectedAgent.voice_id);
  const [primaryVoiceCustomMode, setPrimaryVoiceCustomMode] = useState(false);

  useEffect(() => {
    setPrimaryVoiceCustomMode(isCustomPrimaryVoice);
  }, [selectedAgent?.id, isCustomPrimaryVoice]);

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
        "flex-1 min-h-0 scroll-viewport px-3 py-3",
        !selectedAgent && "hidden md:block",
        selectedAgent && "wl-fleet-config-drawer md:flex-1",
      )}
    >
      {/* Mobile-only back button — clears selectedAgent so the list
    reappears. Hidden on md+ where both panes coexist. */}
      {selectedAgent && (
        <ShadButton
          type="button"
          variant="outline"
          size="sm"
          disableAnimations
          onClick={() => setSelectedAgent(null)}
          aria-label="Back to agent list"
          className="md:hidden mb-3 h-10 rounded-full wl-label text-ink/80"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Back to fleet
        </ShadButton>
      )}
      <AnimatePresence mode="wait">
        {!selectedAgent ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="h-full flex flex-col items-center justify-center gap-4 text-center px-6"
          >
            <div className="w-16 h-16 rounded-md wl-panel-elevated border border-border flex items-center justify-center text-muted">
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
                <header className="rounded-md wl-panel-elevated border border-border p-4">
                  <div className="flex flex-col lg:flex-row items-start justify-between gap-4">
                    <div className="flex-1 w-full space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-8 bg-brand rounded-full" />
                        <Input
                          type="text"
                          value={selectedAgent.name}
                          onChange={(e) => updateAgentMeta({ name: e.target.value })}
                          className="text-3xl md:text-4xl font-display italic bg-transparent outline-none border-b border-transparent focus:border-brand/60 text-ink w-full leading-none pb-1"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded-full border wl-label leading-none",
                            selectedAgent.channel === "email"
                              ? "bg-brand/10 border-brand/30 text-brand"
                              : "bg-brand/10 border-brand/30 text-brand",
                          )}
                        >
                          {selectedAgent.channel}
                        </span>
                        <RoleBadge role={selectedAgent.role} size="sm" />
                        <div className="wl-micro-meta inline-flex items-center gap-1.5">
                          ID: <span className="font-mono text-ink/80">{selectedAgent.id}</span>
                        </div>
                      </div>

                      {/* Role assignment row */}
                      <div className="rounded-md wl-panel border border-border p-3 flex flex-wrap items-center gap-3">
                        <Briefcase className="w-3.5 h-3.5 text-brand shrink-0" />
                        <div className="flex-1 min-w-[180px] space-y-1">
                          <label className="wl-label text-ink/40">
                            Agent role
                          </label>
                          <div className="relative">
                            <Select
                              value={selectedAgent.role || "customer_service"}
                              onValueChange={(v) => updateAgentMeta({ role: v })}
                            >
                              <SelectTrigger
                                aria-label="Agent role"
                                className="w-full text-xs bg-black/5 border border-black/10 rounded-md pl-2.5 py-1.5 text-ink h-auto"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {AGENT_ROLES.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>
                                    {r.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <p className="wl-micro-meta leading-relaxed max-w-[280px]">
                            {
                              AGENT_ROLES.find(
                                (r) => r.value === (selectedAgent.role || "customer_service"),
                              )?.description
                            }
                          </p>
                          <ShadButton
                            type="button"
                            variant="outline"
                            size="sm"
                            disableAnimations
                            onClick={() =>
                              applyRoleTemplate(selectedAgent.role || "customer_service")
                            }
                            disabled={isApplyingTemplate}
                            className="self-start rounded-full wl-label text-ink/80"
                          >
                            {isApplyingTemplate ? (
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-2.5 h-2.5" />
                            )}
                            Apply template
                          </ShadButton>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 pt-3 border-t border-border">
                    {/* Performance stats */}
                    {agentStats[selectedAgent.id] &&
                      (() => {
                        const s = agentStats[selectedAgent.id];
                        const total =
                          s.sentiment.positive + s.sentiment.neutral + s.sentiment.negative || 1;
                        const posPct = Math.round((s.sentiment.positive / total) * 100);
                        return (
                          <div className="md:col-span-2 space-y-2 mb-2">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <div className="rounded-md wl-panel border border-border p-2.5">
                                <div className="wl-label tracking-[0.22em] text-brand mb-1">
                                  Calls
                                </div>
                                <div className="font-display italic text-xl text-ink">
                                  {s.callCount}
                                </div>
                              </div>
                              <div className="rounded-md wl-panel border border-border p-2.5">
                                <div className="wl-label tracking-[0.22em] text-brand mb-1 flex items-center gap-1">
                                  <Clock className="w-2 h-2" /> Min
                                </div>
                                <div className="font-display italic text-xl text-ink">
                                  {s.totalMinutes}
                                </div>
                              </div>
                              <div className="rounded-md wl-panel border border-border p-2.5">
                                <div className="wl-label tracking-[0.22em] text-brand mb-1">
                                  Avg Score
                                </div>
                                <div className="font-display italic text-xl text-ink">
                                  {s.avgScore > 0 ? (
                                    s.avgScore
                                  ) : (
                                    <span className="text-ink/40 text-sm not-italic">—</span>
                                  )}
                                </div>
                              </div>
                              <div className="rounded-md wl-panel border border-border p-2.5 relative">
                                <div className="wl-label tracking-[0.22em] text-brand mb-1">
                                  Sentiment
                                </div>
                                <div className="font-display italic text-xl text-ink">
                                  {posPct}%
                                  <span className="text-xs text-muted not-italic ml-1">pos</span>
                                </div>
                                <ShadButton
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  disableAnimations
                                  onClick={() => fetchAgentPerformance(selectedAgent.id, true)}
                                  title="Refresh stats"
                                  className="absolute top-2 right-2 w-5 h-5 text-ink/40 hover:text-brand"
                                  aria-label="Refresh stats"
                                >
                                  <RefreshCw className="w-2.5 h-2.5" />
                                </ShadButton>
                              </div>
                            </div>
                            {/* 7-day activity sparkline */}
                            {s.sparkline && s.sparkline.some((v: number) => v > 0) && (
                              <div className="rounded-md wl-panel border border-border px-3 py-2 flex items-center gap-3">
                                <span className="wl-label tracking-[0.22em] text-ink/40 shrink-0">
                                  7d
                                </span>
                                <div className="flex-1 min-w-0">
                                  <Sparkline data={s.sparkline} width={160} height={20} />
                                </div>
                                <div className="flex gap-2 shrink-0">
                                  {s.sparkline.map((v: number, i: number) => (
                                    <span
                                      key={`day-${i}`}
                                      className="wl-micro-badge font-mono tabular-nums text-ink/40"
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
                      <label className="wl-label text-ink/40 flex items-center gap-1.5">
                        <LinkIcon className="w-2.5 h-2.5 text-brand" /> Knowledge URL
                      </label>
                      <Input
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        value={selectedAgent.website_url || ""}
                        onChange={(e) => updateAgentMeta({ website_url: e.target.value })}
                        placeholder="https://example.com"
                        className="w-full text-sm bg-black/5 border border-black/10 rounded-md px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-ink/40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="wl-label text-ink/40 flex items-center gap-1.5">
                        <Phone className="w-2.5 h-2.5 text-brand" /> Transfer phone
                      </label>
                      <Input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={selectedAgent.transfer_phone || ""}
                        onChange={(e) => updateAgentMeta({ transfer_phone: e.target.value })}
                        placeholder="+1 800 555 0100"
                        className="w-full text-sm bg-black/5 border border-black/10 rounded-md px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-ink/40 tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="relative z-10 mt-3 grid grid-cols-1 gap-3">
                    {/* Voice Node Config */}
                    {selectedAgent.channel !== "email" && (
                      <div className="rounded-md wl-panel border border-border p-3 space-y-3">
                        <div className="flex items-center gap-2 pb-2 border-b border-black/8">
                          <Radio className="w-3.5 h-3.5 text-brand" />
                          <h3 className="font-display italic lowercase text-base text-ink">
                            carrier signal parameters
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1.5 md:col-span-3">
                            <VoiceFieldSelect
                              label="Primary voice"
                              value={selectedAgent.voice_id}
                              catalog={voiceCatalog}
                              showCustomOption
                              onCustomMode={() => setPrimaryVoiceCustomMode(true)}
                              onSelect={(voiceId, provider) => {
                                if (!voiceId) return;
                                setPrimaryVoiceCustomMode(false);
                                updateAgentMeta({
                                  voice_id: voiceId,
                                  voice_provider: provider || "11labs",
                                });
                              }}
                            />
                            {(isCustomPrimaryVoice || primaryVoiceCustomMode) && (
                              <Input
                                type="text"
                                value={selectedAgent.voice_id || ""}
                                onChange={(e) =>
                                  updateAgentMeta({
                                    voice_id: e.target.value.trim(),
                                    voice_provider: selectedAgent.voice_provider || "11labs",
                                  })
                                }
                                placeholder="ElevenLabs or OpenAI voice ID"
                                className="w-full text-xs bg-black/5 border border-black/10 rounded-md px-3 py-2 text-ink font-mono"
                              />
                            )}
                          </div>

                          <VoiceFieldSelect
                            label="Inbound voice"
                            value={selectedAgent.voice_id_inbound}
                            catalog={voiceCatalog}
                            allowInherit
                            onSelect={(voiceId, provider) =>
                              updateAgentMeta({
                                voice_id_inbound: voiceId,
                                ...(voiceId && provider ? { voice_provider: provider } : {}),
                              })
                            }
                          />
                          <VoiceFieldSelect
                            label="Outbound voice"
                            value={selectedAgent.voice_id_outbound}
                            catalog={voiceCatalog}
                            allowInherit
                            onSelect={(voiceId, provider) =>
                              updateAgentMeta({
                                voice_id_outbound: voiceId,
                                ...(voiceId && provider ? { voice_provider: provider } : {}),
                              })
                            }
                          />

                          <div className="space-y-1.5">
                            <label className="wl-label text-ink/40">
                              Silence timeout
                            </label>
                            <Select
                              value={
                                selectedAgent.silence_timeout_seconds == null
                                  ? "default"
                                  : String(selectedAgent.silence_timeout_seconds)
                              }
                              onValueChange={(val) =>
                                updateAgentMeta({
                                  silence_timeout_seconds:
                                    val === "default" ? null : Number.parseInt(val, 10),
                                })
                              }
                            >
                              <SelectTrigger
                                aria-label="Silence timeout"
                                className="w-full text-xs bg-black/5 border border-black/10 rounded-md pl-2.5 py-1.5 text-ink h-auto"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="default">Archetype default</SelectItem>
                                {[3, 4, 5, 6, 7, 8, 10].map((sec) => (
                                  <SelectItem key={sec} value={String(sec)}>
                                    {sec}s before re-prompt
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="wl-label text-ink/40">
                              Archetype
                            </label>
                            <div className="relative">
                              <Select
                                value={selectedAgent.archetype || "Receptionist"}
                                onValueChange={(v) => updateAgentMeta({ archetype: v })}
                              >
                                <SelectTrigger
                                  aria-label="Archetype"
                                  className="w-full text-xs bg-black/5 border border-black/10 rounded-md pl-2.5 py-1.5 text-ink h-auto"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Receptionist">Receptionist</SelectItem>
                                  <SelectItem value="The Closer">The Closer</SelectItem>
                                  <SelectItem value="Support Tech">Support Tech</SelectItem>
                                  <SelectItem value="The Empath">The Empath</SelectItem>
                                  <SelectItem value="The Collector">The Collector</SelectItem>
                                  <SelectItem value="Lead Qualifier">Lead Qualifier</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="wl-label text-ink/40">
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
                                  <ShadButton
                                    key={v}
                                    type="button"
                                    variant={isActive ? "secondary" : "outline"}
                                    size="sm"
                                    disableAnimations
                                    onClick={() => updateAgentMeta({ personality_vibe: v })}
                                    className={cn(
                                      "h-auto px-2 py-1.5 rounded-md wl-label font-medium",
                                      isActive
                                        ? "bg-brand/15 border-brand/40 text-brand"
                                        : "text-muted hover:text-ink hover:border-brand/20",
                                    )}
                                  >
                                    {labels[v]}
                                  </ShadButton>
                                );
                              })}
                            </div>
                            <p className="wl-micro-meta leading-relaxed">
                              Pick once. The agent keeps this one personality, voice, and cadence
                              for the whole call — it never switches tone mid-conversation.
                            </p>
                          </div>

                          <div className="space-y-1.5">
                            <label className="wl-label text-ink/40">
                              Ambient atmosphere
                            </label>
                            <div className="relative">
                              <Select
                                value={selectedAgent.ambient_noise || "off"}
                                onValueChange={(v) => updateAgentMeta({ ambient_noise: v })}
                              >
                                <SelectTrigger
                                  aria-label="Ambient atmosphere"
                                  className="w-full text-xs bg-black/5 border border-black/10 rounded-md pl-2.5 py-1.5 text-ink h-auto"
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="off">Studio (silent)</SelectItem>
                                  <SelectItem value="office">Office (kinetic)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="wl-label text-ink/40">
                                Speaking rate
                              </label>
                              <span className="wl-micro-badge font-medium text-ink">
                                {Number((selectedAgent as any).voice_speed ?? 1.0).toFixed(2)}×
                              </span>
                            </div>
                            <Slider
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
                            <p className="wl-micro-meta leading-relaxed">
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
                            <label className="wl-label text-ink/40 flex items-center gap-1.5">
                              <Zap className="w-2.5 h-2.5 text-brand" /> Initial greeting
                            </label>
                          </div>
                          <Input
                            type="text"
                            value={selectedAgent.first_message || ""}
                            onChange={(e) => updateAgentMeta({ first_message: e.target.value })}
                            className="w-full text-base bg-black/5 border border-black/10 rounded-md px-3 py-2.5 outline-none focus:border-brand/50 text-ink placeholder:text-ink/40 font-display italic"
                          />
                        </div>

                        <div className="flex items-center justify-between gap-3 rounded-md border border-black/8 dark:border-black/8 bg-black/[0.02] dark:bg-white/3 px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="wl-label text-brand/70 flex items-center gap-1.5">
                              <Workflow className="w-3 h-3" /> Conversation flow
                            </p>
                            <p className="wl-micro-meta text-ink/45 mt-1 leading-relaxed">
                              Stage scripts and handoffs for live calls.
                            </p>
                          </div>
                          <ShadButton
                            type="button"
                            variant="outline"
                            size="sm"
                            disableAnimations
                            asChild
                            className="shrink-0 rounded-full wl-label"
                          >
                            <Link
                              to={`/training?agent=${encodeURIComponent(selectedAgent.id)}&tab=flow`}
                            >
                              Edit flow
                              <ArrowUpRight className="w-3 h-3" />
                            </Link>
                          </ShadButton>
                        </div>
                      </div>
                    )}

                    {/* Email Config */}
                    {(selectedAgent.channel === "email" ||
                      selectedAgent.channel === "omnichannel" ||
                      !selectedAgent.channel) && (
                      <div className="rounded-md wl-panel border border-border p-3 space-y-3">
                        <div className="flex items-center gap-2 pb-2 border-b border-black/8">
                          <Mail className="w-3.5 h-3.5 text-brand" />
                          <h3 className="font-display italic lowercase text-base text-ink">
                            email relay heuristics
                          </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <div className="rounded-md wl-panel border border-border p-3 flex items-center justify-between gap-3">
                              <div className="space-y-0.5 min-w-0">
                                <h4 className="text-sm text-ink">Auto-respond</h4>
                                <p className="wl-micro-meta leading-relaxed">
                                  Autonomous reply on incoming threads.
                                </p>
                              </div>
                              <ShadButton
                                type="button"
                                variant="ghost"
                                size="sm"
                                disableAnimations
                                onClick={() =>
                                  updateAgentMeta({
                                    email_auto_respond: !selectedAgent.email_auto_respond,
                                  })
                                }
                                className={cn(
                                  "shrink-0 w-10 h-5 rounded-full border p-0 min-w-10",
                                  selectedAgent.email_auto_respond
                                    ? "bg-brand/30 border-brand/50"
                                    : "bg-muted/10 border-border",
                                )}
                                aria-label="Toggle email auto-respond"
                              >
                                <motion.div
                                  animate={{
                                    x: selectedAgent.email_auto_respond ? 18 : 0,
                                  }}
                                  className={cn(
                                    "w-4 h-4 rounded-full",
                                    selectedAgent.email_auto_respond ? "bg-brand" : "bg-muted/60",
                                  )}
                                />
                              </ShadButton>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <label className="wl-label text-ink/40">
                                Relay tone
                              </label>
                              <div className="relative">
                                <Select
                                  value={selectedAgent.email_agent_tone || "Professional"}
                                  onValueChange={(v) => updateAgentMeta({ email_agent_tone: v })}
                                >
                                  <SelectTrigger
                                    aria-label="Relay tone"
                                    className="w-full text-xs bg-black/5 border border-black/10 rounded-md pl-2.5 py-1.5 text-ink h-auto"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="Professional">Authoritative</SelectItem>
                                    <SelectItem value="Friendly">Diplomatic</SelectItem>
                                    <SelectItem value="Direct">Concise</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <label className="wl-label text-ink/40">
                                Signature
                              </label>
                              <Input
                                type="text"
                                value={selectedAgent.email_signature || ""}
                                onChange={(e) =>
                                  updateAgentMeta({ email_signature: e.target.value })
                                }
                                placeholder="— Best, Agent"
                                className="w-full text-sm bg-black/5 border border-black/10 rounded-md px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-ink/40"
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
                        <div className="rounded-md wl-panel border border-border p-3 space-y-3">
                          <div className="flex items-center justify-between gap-2 pb-2 border-b border-black/8">
                            <div className="flex items-center gap-2">
                              <FileText className="w-3.5 h-3.5 text-brand" />
                              <h3 className="font-display italic lowercase text-base text-ink">
                                system prompt
                              </h3>
                            </div>
                            <ShadButton
                              type="button"
                              variant="outline"
                              size="sm"
                              disableAnimations
                              onClick={() => {
                                setSelectedAgent({
                                  ...selectedAgent,
                                  system_prompt_override: null,
                                });
                                void updateAgentMeta({ system_prompt_override: null });
                              }}
                              disabled={usingAutoComposed}
                              className="shrink-0 rounded-full wl-label text-ink/80"
                            >
                              <RefreshCw className="w-2.5 h-2.5" />
                              Use auto-composed prompt
                            </ShadButton>
                          </div>
                          <p className="wl-micro-meta leading-relaxed">
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
                            className="w-full h-48 px-4 py-3 rounded-md bg-black/5 border border-black/10 text-ink outline-none focus:border-brand/50 transition-all resize-none text-sm leading-relaxed placeholder:text-ink/40"
                            placeholder="Leave blank to use the auto-composed prompt. Type here to define the agent's full identity, tone, and behavior — this replaces the generated base prompt."
                          />
                          <div className="flex items-center justify-between wl-micro-meta">
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

                    <ToolTogglePanel
                      selectedAgent={selectedAgent}
                      updateAgentMeta={updateAgentMeta}
                    />
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
                <section className="rounded-md wl-panel-elevated border border-border p-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-brand" />
                      <div>
                        <h3 className="font-display italic lowercase text-xl text-ink leading-none">
                          behavioral engine
                        </h3>
                        <p className="wl-label text-ink/40 mt-1">
                          Base heuristic instructions
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <AgentExportImport
                        agentId={selectedAgent.id}
                        agentName={selectedAgent.name}
                      />
                      <ShadButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        disableAnimations
                        onClick={() => updatePersonality(agentConfig.personality)}
                        className="rounded-full wl-label text-brand"
                      >
                        <Save className="w-3.5 h-3.5" />
                        Save
                      </ShadButton>
                    </div>
                  </div>
                  <textarea
                    value={agentConfig.personality}
                    onChange={(e) =>
                      setAgentConfig({ ...agentConfig, personality: e.target.value })
                    }
                    className="relative z-10 w-full h-48 px-4 py-3 rounded-md bg-black/5 border border-black/10 text-ink outline-none focus:border-brand/50 transition-all resize-none text-sm leading-relaxed placeholder:text-ink/40"
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
                  <section className="rounded-md wl-panel-elevated border border-border p-3 flex flex-col min-h-[560px] md:h-[400px] max-h-[70vh]">
                    <header className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-black/8">
                      <div>
                        <h3 className="font-display italic lowercase text-lg text-ink leading-none">
                          tactical logic
                        </h3>
                        <p className="wl-label text-ink/40 mt-0.5">
                          Hard constraints
                        </p>
                      </div>
                      <span className="px-1.5 py-0.5 rounded-full bg-destructive/15 border border-destructive/30 text-destructive wl-label leading-none">
                        Inviolable
                      </span>
                    </header>
                    <div className="flex-1 min-h-0 scroll-viewport space-y-2 pr-1">
                      <AnimatePresence mode="popLayout">
                        {agentConfig.directives?.length === 0 ? (
                          <InlineEmpty label={OPS_TRAINING_PANEL.directives} className="py-12" />
                        ) : (
                          agentConfig.directives?.map((d: any) => (
                            <motion.div
                              layout
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              key={d.id}
                              className="rounded-md bg-destructive/8 border border-destructive/20 p-3 group touch-press"
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
                                    className="w-full text-sm bg-black/5 border border-black/10 rounded-md px-3 py-2 outline-none focus:border-destructive/50 text-ink min-h-[80px] resize-none"
                                  />
                                  <div className="flex justify-end gap-1.5">
                                    <ShadButton
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      disableAnimations
                                      onClick={() => setEditingDirective(null)}
                                      className="rounded-full wl-label text-muted"
                                    >
                                      Cancel
                                    </ShadButton>
                                    <ShadButton
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      disableAnimations
                                      onClick={() =>
                                        saveManualEntry(
                                          "directive",
                                          editingDirective!.content,
                                          d.id,
                                        )
                                      }
                                      disabled={isSavingEntry}
                                      className="rounded-full wl-label text-brand"
                                    >
                                      {isSavingEntry ? "Saving…" : "Save"}
                                    </ShadButton>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2 items-start justify-between">
                                  <div className="flex-1 text-sm text-ink/90 leading-relaxed">
                                    {d.content}
                                  </div>
                                  <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                                    <ShadButton
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      disableAnimations
                                      onClick={() =>
                                        setEditingDirective({
                                          id: d.id,
                                          content: d.content,
                                        })
                                      }
                                      aria-label="Edit directive"
                                      title="Edit directive"
                                      className="w-6 h-6 text-muted hover:text-ink"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </ShadButton>
                                    <ShadButton
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      disableAnimations
                                      onClick={() => deleteRule("directive", d.id)}
                                      aria-label="Delete directive"
                                      title="Delete directive"
                                      className="w-6 h-6 text-muted hover:text-destructive"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </ShadButton>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          ))
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="mt-3 pt-3 border-t border-black/8 space-y-1.5">
                      <label className="wl-label text-ink/40">
                        Add directive
                      </label>
                      <div className="flex gap-1.5">
                        <Input
                          type="text"
                          value={newDirective}
                          onChange={(e) => setNewDirective(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && saveManualEntry("directive", newDirective)
                          }
                          placeholder="e.g. Always verify date of birth…"
                          className="flex-1 text-sm bg-black/5 border border-black/10 rounded-md px-3 py-2 outline-none focus:border-destructive/50 text-ink placeholder:text-ink/40"
                        />
                        <ShadButton
                          type="button"
                          variant="destructive"
                          size="icon"
                          disableAnimations
                          onClick={() => saveManualEntry("directive", newDirective)}
                          disabled={!newDirective || isSavingEntry}
                          aria-label="Add directive"
                          className="w-9 h-9 rounded-full"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </ShadButton>
                      </div>
                    </div>
                  </section>

                  {/* Knowledge Base */}
                  <section className="rounded-md wl-panel-elevated border border-border p-3 flex flex-col min-h-[560px] md:h-[400px] max-h-[70vh]">
                    <header className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-black/8">
                      <div>
                        <h3 className="font-display italic lowercase text-lg text-ink leading-none">
                          knowledge base
                        </h3>
                        <p className="wl-label text-ink/40 mt-0.5">
                          Knowledge base
                        </p>
                      </div>
                      <span className="px-1.5 py-0.5 rounded-full bg-brand/15 border border-brand/30 text-brand wl-label leading-none">
                        Factual
                      </span>
                    </header>
                    <div className="flex-1 min-h-0 scroll-viewport space-y-2 pr-1">
                      <AnimatePresence mode="popLayout">
                        {agentConfig.knowledge?.length === 0 ? (
                          <InlineEmpty label={OPS_TRAINING_PANEL.facts} className="py-12" />
                        ) : (
                          agentConfig.knowledge?.map((k: any) => (
                            <motion.div
                              layout
                              initial={{ opacity: 0, x: 6 }}
                              animate={{ opacity: 1, x: 0 }}
                              key={k.id}
                              className="rounded-md bg-brand/8 border border-brand/20 p-3 group touch-press"
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
                                    className="w-full text-sm bg-black/5 border border-black/10 rounded-md px-3 py-2 outline-none focus:border-brand/50 text-ink min-h-[80px] resize-none"
                                  />
                                  <div className="flex justify-end gap-1.5">
                                    <ShadButton
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      disableAnimations
                                      onClick={() => setEditingKnowledge(null)}
                                      className="rounded-full wl-label text-muted"
                                    >
                                      Cancel
                                    </ShadButton>
                                    <ShadButton
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      disableAnimations
                                      onClick={() =>
                                        saveManualEntry(
                                          "knowledge",
                                          editingKnowledge!.content,
                                          k.id,
                                        )
                                      }
                                      disabled={isSavingEntry}
                                      className="rounded-full wl-label text-brand"
                                    >
                                      {isSavingEntry ? "Saving…" : "Save"}
                                    </ShadButton>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex gap-2 items-start justify-between">
                                  <div className="flex-1 text-sm text-ink/90 leading-relaxed">
                                    {k.content}
                                  </div>
                                  <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                                    <ShadButton
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      disableAnimations
                                      onClick={() =>
                                        setEditingKnowledge({
                                          id: k.id,
                                          content: k.content,
                                        })
                                      }
                                      aria-label="Edit knowledge fact"
                                      title="Edit knowledge fact"
                                      className="w-6 h-6 text-muted hover:text-ink"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </ShadButton>
                                    <ShadButton
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      disableAnimations
                                      onClick={() => deleteRule("knowledge", k.id)}
                                      aria-label="Delete knowledge fact"
                                      title="Delete knowledge fact"
                                      className="w-6 h-6 text-muted hover:text-brand"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </ShadButton>
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          ))
                        )}
                      </AnimatePresence>
                    </div>
                    <div className="mt-3 pt-3 border-t border-black/8 space-y-1.5">
                      <label className="wl-label text-ink/40">
                        Add fact
                      </label>
                      <div className="flex gap-1.5">
                        <Input
                          type="text"
                          value={newKnowledge}
                          onChange={(e) => setNewKnowledge(e.target.value)}
                          onKeyDown={(e) =>
                            e.key === "Enter" && saveManualEntry("knowledge", newKnowledge)
                          }
                          placeholder="e.g. Office closes at 5pm…"
                          className="flex-1 text-sm bg-black/5 border border-black/10 rounded-md px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-ink/40"
                        />
                        <ShadButton
                          type="button"
                          variant="secondary"
                          size="icon"
                          disableAnimations
                          onClick={() => saveManualEntry("knowledge", newKnowledge)}
                          disabled={!newKnowledge || isSavingEntry}
                          aria-label="Add knowledge fact"
                          className="w-9 h-9 rounded-full text-brand"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </ShadButton>
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
