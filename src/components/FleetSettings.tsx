import { useState, useEffect, useRef } from "react";
import { Users, Plus, Phone, Bot, Save, Loader2, Link as LinkIcon, Copy, Trash2, Megaphone, Mail, Pencil, Sparkles, Terminal, ChevronRight, ChevronLeft, Zap, Target, Radio, Settings2, Shield, Briefcase, RefreshCw, LayoutGrid, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch, safeJson } from "../lib/api";
import ConfirmModal from "./ConfirmModal";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import { useToast } from "../contexts/ToastContext";
import AgentTemplates from "./AgentTemplates";
import AgentExportImport from "./AgentExportImport";
import AgentBusinessProfile from "./AgentBusinessProfile";
import AgentScorecard from "./AgentScorecard";

/** Tiny SVG sparkline — renders a 7-value array as a smooth path. */
function Sparkline({ data, width = 64, height = 24 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * width,
    height - (v / max) * (height - 2) - 1,
  ] as [number, number]);
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id="sp-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#0AC8D4" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#9B59F5" stopOpacity="0.8" />
        </linearGradient>
      </defs>
      <path d={d} fill="none" stroke="url(#sp-grad)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.5" fill="url(#sp-grad)" />
      ))}
    </svg>
  );
}

const PREMIUM_VOICES = [
  // 11labs
  { id: "bIHbv24MWmeRgasZH58o", provider: "11labs", name: "Rachel (Calm & Professional)" },
  { id: "21m00Tcm4TlvDq8ikWAM", provider: "11labs", name: "Sarah (Upbeat & Conversational)" },
  { id: "pNInz6obpgDQGcFmaJcg", provider: "11labs", name: "Adam (Deep & Trustworthy)" },
  // OpenAI
  { id: "alloy", provider: "openai", name: "Alex (Neutral & Energetic)" },
  { id: "nova", provider: "openai", name: "Nova (Polite & Corporate)" },
  { id: "echo", provider: "openai", name: "Marcus (Authoritative & Warm)" },
  { id: "shimmer", provider: "openai", name: "Chloe (Clear & Articulate)" }
];

// Role metadata — mirrors ROLE_PERSONALITY_TEMPLATES on the server.
// color is a Tailwind color stem (without bg-/text- prefix).
export const AGENT_ROLES = [
  { value: "sales",             label: "Sales",             description: "Closes deals and drives revenue",           color: "amber",   tw: { bg: "bg-amber-500/10",   text: "text-amber-400",   border: "border-amber-500/25",   dot: "bg-amber-400"   } },
  { value: "customer_service",  label: "Customer Service",  description: "Handles inbound issues and support",         color: "emerald", tw: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/25", dot: "bg-emerald-400" } },
  { value: "scheduler",         label: "Scheduler",         description: "Books appointments and manages calendars",   color: "violet",  tw: { bg: "bg-violet-500/10",  text: "text-violet-400",  border: "border-violet-500/25",  dot: "bg-violet-400"  } },
  { value: "collections",       label: "Collections",       description: "Handles payment follow-ups and recovery",    color: "rose",    tw: { bg: "bg-rose-500/10",    text: "text-rose-400",    border: "border-rose-500/25",    dot: "bg-rose-400"    } },
  { value: "technical_support", label: "Technical Support", description: "Diagnoses and resolves technical issues",    color: "blue",    tw: { bg: "bg-blue-500/10",    text: "text-blue-400",    border: "border-blue-500/25",    dot: "bg-blue-400"    } },
  { value: "lead_qualifier",    label: "Lead Qualifier",    description: "Screens and scores inbound prospects",       color: "orange",  tw: { bg: "bg-orange-500/10",  text: "text-orange-400",  border: "border-orange-500/25",  dot: "bg-orange-400"  } },
  { value: "receptionist",      label: "Receptionist",      description: "Routes calls and creates first impressions", color: "cyan",    tw: { bg: "bg-cyan-500/10",    text: "text-cyan-400",    border: "border-cyan-500/25",    dot: "bg-cyan-400"    } },
  { value: "marketing",         label: "Marketing",         description: "Nurtures prospects and runs campaigns",      color: "purple",  tw: { bg: "bg-purple-500/10",  text: "text-purple-400",  border: "border-purple-500/25",  dot: "bg-purple-400"  } },
] as const;

type RoleValue = typeof AGENT_ROLES[number]["value"];

function getRoleMeta(role?: string) {
  return AGENT_ROLES.find(r => r.value === role) ?? AGENT_ROLES[1]; // default: customer_service
}

function RoleBadge({ role, size = "sm" }: { role?: string; size?: "xs" | "sm" }) {
  const meta = getRoleMeta(role);
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border leading-none",
      meta.tw.bg, meta.tw.text, meta.tw.border,
      size === "xs" ? "text-[8px] uppercase tracking-[0.22em] px-1.5 py-0.5" : "text-[9px] uppercase tracking-[0.22em] px-2 py-0.5"
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", meta.tw.dot)} />
      {meta.label}
    </span>
  );
}


export default function FleetSettings() {
  const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast();
  const [activeTab, setActiveTab] = useState<"templates" | "fleet">("templates");
  const [agents, setAgents] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<{ status: string, max_agents: number }>({ status: 'active', max_agents: 3 });
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentChannel, setNewAgentChannel] = useState("voice");
  const [newAgentRole, setNewAgentRole] = useState<RoleValue>("customer_service");
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [agentConfig, setAgentConfig] = useState<any>({ personality: "", directives: [], knowledge: [] });
  // Tracks the currently-selected agent so async fetchAgentConfig calls
  // don't overwrite agentConfig with a stale agent's data when the operator
  // switches selection mid-flight. fetchAgentConfig is invoked from many
  // places (the selection effect, post-save refresh, manual refresh) so
  // a single ref-based guard is simpler than threading AbortController
  // through every caller.
  const selectedAgentIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedAgentIdRef.current = selectedAgent?.id ?? null;
  }, [selectedAgent?.id]);

  const [editingDirective, setEditingDirective] = useState<{ id: string; content: string } | null>(null);
  const [editingKnowledge, setEditingKnowledge] = useState<{ id: string; content: string } | null>(null);
  const [newDirective, setNewDirective] = useState("");
  const [newKnowledge, setNewKnowledge] = useState("");
  const [isSavingEntry, setIsSavingEntry] = useState(false);

  const fetchAgents = async () => {
    setIsLoading(true);
    try {
      const [agentsRes, settingsRes] = await Promise.all([
        authFetch("/api/agents").then(r => r.json()),
        authFetch("/api/settings").then(r => r.json())
      ]);
      
      setAgents(agentsRes.agents || []);
      if (settingsRes) {
        setSubscription({ 
          status: settingsRes.subscription_status || 'active', 
          max_agents: settingsRes.max_agents || 3 
        });
      }
      
      if (!selectedAgent && agentsRes.agents?.length > 0) {
         setSelectedAgent(agentsRes.agents[0]);
      }
    } catch (e) {
      console.error(e);
      toastError("Agent fleet unavailable", "Could not load agents. Please refresh.");
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    if (selectedAgent) {
      fetchAgentConfig(selectedAgent.id);
      fetchAgentPerformance(selectedAgent.id);
    }
  }, [selectedAgent?.id]);

  const fetchAgentConfig = async (id: string) => {
    setIsConfigLoading(true);
    try {
       const res = await authFetch(`/api/agent-config/${id}`);
       const data = await res.json();
       // Drop the response if the operator has since switched agents;
       // otherwise we'd render Agent A's personality/directives under
       // Agent B's header.
       if (selectedAgentIdRef.current !== id) return;
       setAgentConfig(data);
    } catch (e) {
      console.error(e);
      if (selectedAgentIdRef.current === id) toastError("Config unavailable", "Could not load agent configuration.");
    } finally {
      if (selectedAgentIdRef.current === id) setIsConfigLoading(false);
    }
  };

  const handleCreateAgent = async () => {
    if (!newAgentName || !newAgentId) return;
    
    if (subscription.status !== 'active') {
      toastWarning("Subscription required", "Activate a billing plan to deploy agents.");
      return;
    }
    
    if (agents.length >= subscription.max_agents) {
      toastWarning("Fleet capacity reached", `${subscription.max_agents} agents maximum on current plan.`);
      return;
    }

    setIsCreating(true);
    try {
      const resp = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newAgentId, name: newAgentName, channel: newAgentChannel, role: newAgentRole })
      });
      const data = await safeJson(resp);
      
      if (resp.status === 403) {
        toastWarning("Access denied", data.error || "Upgrade your plan.");
      } else {
        setNewAgentName("");
        setNewAgentId("");
        toastSuccess("Agent deployed", newAgentName);
        await fetchAgents();
      }
    } catch (e: any) {
      toastError("Deployment failed", "Could not reach the server. Please try again.");
    }
    setIsCreating(false);
  };

  // Apply the server-side role personality template to the selected agent.
  const applyRoleTemplate = async (role: string) => {
    if (!selectedAgent) return;
    setIsApplyingTemplate(true);
    try {
      const resp = await authFetch(`/api/agents/${selectedAgent.id}/apply-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      if (resp.ok) {
        const data = await resp.json();
        setAgentConfig((prev: any) => ({ ...prev, personality: data.content }));
        toastSuccess("Role template applied", `${role.replace(/_/g, ' ')} personality loaded`);
      }
    } catch (e: any) {
      toastError("Template failed", e.message);
    }
    setIsApplyingTemplate(false);
  };

  const updateAgentMeta = async (updates: any) => {
    if (!selectedAgent) return;
    const body = { ...selectedAgent, ...updates };
    await authFetch(`/api/agents/${selectedAgent.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setSelectedAgent(body);
    setAgents(agents.map(a => a.id === selectedAgent.id ? body : a));
  };

  const updatePersonality = async (val: string) => {
    setAgentConfig({ ...agentConfig, personality: val });
    try {
      const resp = await authFetch(`/api/agent-config/${selectedAgent.id}/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "personality", content: val })
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

  const saveManualEntry = async (type: 'directive' | 'knowledge', content: string, overrideId?: string) => {
    if (!content.trim()) return;
    setIsSavingEntry(true);
    try {
        const resp = await authFetch(`/api/agent-config/${selectedAgent.id}/manual`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, content, overrideId })
        });
        if (resp.ok) {
            await fetchAgentConfig(selectedAgent.id);
            if (type === 'directive') { setEditingDirective(null); setNewDirective(""); }
            if (type === 'knowledge') { setEditingKnowledge(null); setNewKnowledge(""); }
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
      const resp = await authFetch(`/api/agent-config/${selectedAgent.id}/${type}/${rowId}`, { method: "DELETE" });
      if (resp.ok) {
        fetchAgentConfig(selectedAgent.id);
      } else {
        toastError("Delete failed", "Could not remove the entry. Please try again.");
      }
    } catch {
      toastError("Delete failed", "Network error — please try again.");
    }
  };

  const [isDeletingAgent, setIsDeletingAgent] = useState<string | null>(null);
  const [agentStats, setAgentStats] = useState<Record<string, any>>({});

  const fetchAgentPerformance = async (id: string, force = false) => {
    if (agentStats[id] && !force) return; // already loaded; use force=true to refresh
    try {
      const r = await authFetch(`/api/agents/${id}/performance`);
      if (r.ok) {
        const data = await r.json();
        setAgentStats(prev => ({ ...prev, [id]: data }));
      }
    } catch (_) { /* non-critical */ }
  };

  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false);

  const handleDeleteAgent = async (agentId: string) => {
    setIsDeletingAgent(agentId);
    try {
      const resp = await authFetch(`/api/agents/${agentId}`, { method: "DELETE" });
      if (resp.ok) {
        const remaining = agents.filter(a => a.id !== agentId);
        setAgents(remaining);
        if (selectedAgent?.id === agentId) {
          setSelectedAgent(remaining.length > 0 ? remaining[0] : null);
        }
        toastSuccess("Agent decommissioned", deleteConfirm?.name ?? agentId);
      } else {
        const data = await resp.json().catch(() => ({}));
        toastError("Failed to decommission", data.error || "Please try again.");
      }
    } catch (e: any) {
      toastError("Network error", "Failed to decommission agent.");
    }
    setIsDeletingAgent(null);
  };

  return (
    <>
    <div className="h-full flex flex-col">
      {/* Tab strip */}
      <div className="px-4 py-2 border-b border-white/8 flex items-center gap-1.5 shrink-0" role="tablist">
        <button
          role="tab"
          aria-selected={activeTab === "templates"}
          aria-controls="fleet-panel-templates"
          onClick={() => setActiveTab("templates")}
          className={cn(
            "px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.3em] transition-all border flex items-center gap-1.5",
            activeTab === "templates"
              ? "bg-brand/15 border-brand/40 text-brand"
              : "glass border-white/10 text-muted hover:text-ink hover:border-white/25"
          )}
        >
          <LayoutGrid className="w-3 h-3" />
          Templates
        </button>
        <button
          role="tab"
          aria-selected={activeTab === "fleet"}
          aria-controls="fleet-panel-fleet"
          onClick={() => setActiveTab("fleet")}
          className={cn(
            "px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.3em] transition-all border flex items-center gap-1.5",
            activeTab === "fleet"
              ? "bg-brand/15 border-brand/40 text-brand"
              : "glass border-white/10 text-muted hover:text-ink hover:border-white/25"
          )}
        >
          <Shield className="w-3 h-3" />
          My Fleet
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "templates" ? (
          <div id="fleet-panel-templates" role="tabpanel" tabIndex={0} className="h-full overflow-hidden">
            <AgentTemplates />
          </div>
        ) : (
    <div id="fleet-panel-fleet" role="tabpanel" tabIndex={0} className="h-full flex flex-col md:flex-row">

      {/* Sidebar: Agents List — full-width on mobile; collapses when an
          agent is selected so the detail editor gets the full viewport. */}
      <aside className={cn(
        "w-full md:w-[420px] border-b md:border-b-0 md:border-r border-white/8 h-auto md:h-full flex flex-col shrink-0",
        selectedAgent && "hidden md:flex"
      )}>
        <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.45em] text-brand/80">Fleet · Agents</div>
            <h2 className="font-display italic lowercase text-2xl text-ink leading-none mt-0.5 flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand" />
              your agents
            </h2>
          </div>
          <span className="text-[9px] uppercase tracking-[0.3em] text-muted/70 tabular-nums shrink-0">
            {agents.length}
          </span>
        </div>

        <div className="px-3 py-3 flex-1 overflow-y-auto space-y-2 scrollbar-hide">
          <AnimatePresence mode="popLayout">
            {isLoading ? (
              <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-12">
                <Loader2 className="w-5 h-5 animate-spin text-brand" aria-hidden="true" />
                <span className="text-[10px] uppercase tracking-[0.4em] text-muted/70">Loading fleet</span>
              </div>
            ) : agents.length === 0 ? (
              <div className="rounded-xl glass border border-white/10 border-dashed py-10 text-center">
                <Bot className="w-8 h-8 text-muted/50 mx-auto mb-2" />
                <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70">No agents deployed</p>
              </div>
            ) : (
              agents.map(agent => (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={agent.id}
                  className={cn(
                    "w-full flex items-center gap-1 transition-all rounded-xl border group overflow-hidden",
                    selectedAgent?.id === agent.id
                      ? "border-brand/35"
                      : "glass border-white/8 hover:border-white/18"
                  )}
                  style={selectedAgent?.id === agent.id ? {
                    background: "linear-gradient(135deg, rgba(10,200,212,0.08), rgba(197,139,255,0.05))"
                  } : undefined}
                >
                  {/* Selected indicator bar */}
                  {selectedAgent?.id === agent.id && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full"
                      style={{ background: "linear-gradient(to bottom, #0AC8D4, #9B59F5)" }}
                    />
                  )}

                  <button
                    onClick={() => { setSelectedAgent(agent); fetchAgentPerformance(agent.id); }}
                    className="flex-1 text-left px-3 py-3 flex items-center gap-2.5 min-w-0"
                  >
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all border",
                      selectedAgent?.id === agent.id
                        ? "border-brand/35 bg-brand/12 text-brand"
                        : "border-white/10 bg-white/3 text-ink/50 group-hover:text-ink group-hover:bg-white/8"
                    )}>
                      {agent.channel === "email" ? <Mail className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className="overflow-hidden flex-1 min-w-0">
                      <div className="font-display italic text-base text-ink leading-tight truncate">{agent.name}</div>
                      <div className="flex items-center flex-wrap gap-1.5 mt-1">
                        <RoleBadge role={agent.role} size="xs" />
                        <span className="text-[8px] uppercase tracking-[0.25em] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/8 text-muted/70 leading-none">
                          {agent.channel}
                        </span>
                        {agentStats[agent.id] && (
                          <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-white/5 border border-white/8 text-muted/60 leading-none">
                            {agentStats[agent.id].callCount} calls
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteConfirm({ id: agent.id, name: agent.name }); }}
                    disabled={isDeletingAgent === agent.id}
                    title="Delete agent"
                    aria-label={`Delete agent ${agent.name}`}
                    className="mr-2 shrink-0 w-7 h-7 rounded-lg glass border border-white/8 flex items-center justify-center text-muted/40 hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/8 disabled:opacity-40 transition-all"
                  >
                    {isDeletingAgent === agent.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <Trash2 className="w-3 h-3" />}
                  </button>
                </motion.div>
              ))
            )}
          </AnimatePresence>

          <motion.div layout className="pt-4 mt-4 border-t border-white/8 border-dashed space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-[10px] uppercase tracking-[0.3em] text-ink">Deploy new agent</h3>
              <div className="flex items-center gap-1.5">
                <ClaudeRecipeButton recipe="agent-forge" label="Forge" variant="ghost" />
                <button
                  onClick={() => setSeedConfirmOpen(true)}
                  className="px-2.5 py-1 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-muted hover:text-ink hover:border-white/30 transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="w-3 h-3" /> Seed
                </button>
              </div>
            </div>

            <div className="flex p-1 rounded-full glass border border-white/10">
              <button aria-pressed={newAgentChannel === 'voice'} onClick={() => setNewAgentChannel('voice')} className={cn("flex-1 py-1 rounded-full text-[10px] uppercase tracking-[0.25em] transition-colors", newAgentChannel === 'voice' ? "bg-brand/15 text-brand" : "text-muted hover:text-ink")}>Voice</button>
              <button aria-pressed={newAgentChannel === 'email'} onClick={() => setNewAgentChannel('email')} className={cn("flex-1 py-1 rounded-full text-[10px] uppercase tracking-[0.25em] transition-colors", newAgentChannel === 'email' ? "bg-brand/15 text-brand" : "text-muted hover:text-ink")}>Email</button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                 <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5"><Briefcase className="w-2.5 h-2.5 text-brand" /> Business role</label>
                 <div className="relative">
                     <select
                       value={newAgentRole}
                       onChange={e => setNewAgentRole(e.target.value as RoleValue)}
                       className="w-full text-xs bg-black/30 border border-white/10 rounded-lg pl-3 pr-7 py-2 outline-none focus:border-brand/50 cursor-pointer appearance-none text-ink"
                     >
                       {AGENT_ROLES.map(r => (
                         <option key={r.value} value={r.value}>{r.label}</option>
                       ))}
                     </select>
                     <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                   </div>
                   <p className="text-[10px] text-muted/70 leading-relaxed">
                     {AGENT_ROLES.find(r => r.value === newAgentRole)?.description}
                   </p>
                </div>
                <div className="space-y-1.5">
                   <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Designation ID</label>
                   <input type="text" placeholder="node-xxx-yyy" value={newAgentId} onChange={e => setNewAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono" />
                </div>
                <div className="space-y-1.5">
                   <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Tactical name</label>
                   <input type="text" placeholder="e.g. Vanguard-1" value={newAgentName} onChange={e => setNewAgentName(e.target.value)} className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50" />
                </div>
              </div>

              <button
                onClick={handleCreateAgent}
                disabled={isCreating || !newAgentId || !newAgentName}
                className="brutal-btn w-full !py-2.5 !text-[11px] !tracking-[0.3em] disabled:opacity-50"
              >
                {isCreating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Deploy agent
              </button>
            </motion.div>
        </div>
      </aside>

      {/* Main Panel: Agent Configuration — hidden on mobile when nothing
          is selected (the list takes the full viewport in that state). */}
      <main className={cn(
        "flex-1 h-full overflow-y-auto px-3 py-3 scrollbar-hide",
        !selectedAgent && "hidden md:block"
      )}>
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
                <h3 className="font-display italic lowercase text-2xl text-ink">select an agent</h3>
                <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70 max-w-sm">
                  Reconfigure parameters and heuristics for individual agents.
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
              <header className="rounded-2xl glass border border-white/10 p-4 relative overflow-hidden">
                 <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #9B59F5, transparent)" }} />

                 <div className="relative z-10 flex flex-col lg:flex-row items-start justify-between gap-4">
                   <div className="flex-1 w-full space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-8 bg-brand rounded-full" />
                        <input
                          type="text"
                          value={selectedAgent.name}
                          onChange={e => updateAgentMeta({ name: e.target.value })}
                          className="text-3xl md:text-4xl font-display italic bg-transparent outline-none border-b border-transparent focus:border-brand/60 text-ink w-full leading-none pb-1"
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-full border text-[9px] uppercase tracking-[0.25em] leading-none",
                          selectedAgent.channel === 'email' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" : "bg-brand/10 border-brand/30 text-brand"
                        )}>
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
                          <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Agent role</label>
                          <div className="relative">
                            <select
                              value={selectedAgent.role || 'customer_service'}
                              onChange={e => updateAgentMeta({ role: e.target.value })}
                              className="w-full text-xs bg-black/30 border border-white/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-brand/50 cursor-pointer appearance-none text-ink"
                            >
                              {AGENT_ROLES.map(r => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                              ))}
                            </select>
                            <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <p className="text-[10px] text-muted/70 leading-relaxed max-w-[280px]">
                            {AGENT_ROLES.find(r => r.value === (selectedAgent.role || 'customer_service'))?.description}
                          </p>
                          <button
                            onClick={() => applyRoleTemplate(selectedAgent.role || 'customer_service')}
                            disabled={isApplyingTemplate}
                            className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-ink/80 hover:border-brand/40 hover:text-brand transition-colors disabled:opacity-50"
                          >
                            {isApplyingTemplate ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <RefreshCw className="w-2.5 h-2.5" />}
                            Apply template
                          </button>
                        </div>
                      </div>
                   </div>
                 </div>

                 <div className="relative z-10 mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 pt-3 border-t border-white/8">
                   {/* Performance stats */}
                   {agentStats[selectedAgent.id] && (() => {
                     const s = agentStats[selectedAgent.id];
                     const total = (s.sentiment.positive + s.sentiment.neutral + s.sentiment.negative) || 1;
                     const posPct = Math.round((s.sentiment.positive / total) * 100);
                     return (
                       <div className="md:col-span-2 space-y-2 mb-2">
                         <div className="grid grid-cols-4 gap-2">
                           <div className="rounded-lg glass border border-white/8 p-2.5">
                             <div className="text-[8px] uppercase tracking-[0.3em] text-brand mb-1">Calls</div>
                             <div className="font-display italic text-xl text-ink">{s.callCount}</div>
                           </div>
                           <div className="rounded-lg glass border border-white/8 p-2.5">
                             <div className="text-[8px] uppercase tracking-[0.3em] text-brand mb-1 flex items-center gap-1">
                               <Clock className="w-2 h-2" /> Min
                             </div>
                             <div className="font-display italic text-xl text-ink">{s.totalMinutes}</div>
                           </div>
                           <div className="rounded-lg glass border border-white/8 p-2.5">
                             <div className="text-[8px] uppercase tracking-[0.3em] text-brand mb-1">Avg Score</div>
                             <div className="font-display italic text-xl text-ink">{s.avgScore > 0 ? s.avgScore : <span className="text-muted/60 text-sm not-italic">—</span>}</div>
                           </div>
                           <div className="rounded-lg glass border border-white/8 p-2.5 relative">
                             <div className="text-[8px] uppercase tracking-[0.3em] text-brand mb-1">Sentiment</div>
                             <div className="font-display italic text-xl text-ink">{posPct}%<span className="text-xs text-muted not-italic ml-1">pos</span></div>
                             <button
                               onClick={() => fetchAgentPerformance(selectedAgent.id, true)}
                               title="Refresh stats"
                               className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full glass border border-white/10 text-muted/50 hover:text-brand transition-colors"
                             >
                               <RefreshCw className="w-2.5 h-2.5" />
                             </button>
                           </div>
                         </div>
                         {/* 7-day activity sparkline */}
                         {s.sparkline && s.sparkline.some((v: number) => v > 0) && (
                           <div className="rounded-lg glass border border-white/8 px-3 py-2 flex items-center gap-3">
                             <span className="text-[8px] uppercase tracking-[0.3em] text-muted/70 shrink-0">7d</span>
                             <div className="flex-1 min-w-0">
                               <Sparkline data={s.sparkline} width={160} height={20} />
                             </div>
                             <div className="flex gap-2 shrink-0">
                               {s.sparkline.map((v: number, i: number) => (
                                 <span key={`day-${i}`} className="text-[8px] font-mono tabular-nums text-muted/50" title={`${v} call${v !== 1 ? 's' : ''}`}>
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
                       value={selectedAgent.website_url || ""}
                       onChange={e => updateAgentMeta({ website_url: e.target.value })}
                       placeholder="https://example.com"
                       className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50"
                     />
                   </div>
                   <div className="space-y-1.5">
                     <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
                        <Phone className="w-2.5 h-2.5 text-brand" /> Transfer phone
                     </label>
                     <input
                       type="tel"
                       value={selectedAgent.transfer_phone || ""}
                       onChange={e => updateAgentMeta({ transfer_phone: e.target.value })}
                       placeholder="+1 800 555 0100"
                       className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 tabular-nums"
                     />
                   </div>
                 </div>

                 <div className="relative z-10 mt-3 grid grid-cols-1 gap-3">
                    {/* Voice Node Config */}
                    {selectedAgent.channel !== 'email' && (
                     <div className="rounded-xl glass border border-white/8 p-3 space-y-3">
                         <div className="flex items-center gap-2 pb-2 border-b border-white/8">
                           <Radio className="w-3.5 h-3.5 text-brand" />
                           <h3 className="font-display italic lowercase text-base text-ink">carrier signal parameters</h3>
                         </div>

                         <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="space-y-1.5">
                                <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Voice signature</label>
                                <div className="relative">
                                  <select
                                    value={PREMIUM_VOICES.find(v => v.id === selectedAgent.voice_id) ? selectedAgent.voice_id : "custom"}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val !== "custom") {
                                          const voiceData = PREMIUM_VOICES.find(v => v.id === val);
                                          updateAgentMeta({ voice_id: val, voice_provider: voiceData?.provider || '11labs' });
                                      }
                                    }}
                                    className="w-full text-xs bg-black/30 border border-white/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-brand/50 cursor-pointer appearance-none text-ink"
                                  >
                                    <optgroup label="Premium">
                                      {PREMIUM_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </optgroup>
                                    <option value="custom">Custom override</option>
                                  </select>
                                  <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                                </div>
                              </div>

                              <div className="space-y-1.5">
                                <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Archetype</label>
                                <div className="relative">
                                  <select
                                    value={selectedAgent.archetype || "Receptionist"}
                                    onChange={(e) => updateAgentMeta({ archetype: e.target.value })}
                                    className="w-full text-xs bg-black/30 border border-white/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-brand/50 cursor-pointer appearance-none text-ink"
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
                               <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Ambient atmosphere</label>
                               <div className="relative">
                                 <select
                                   value={selectedAgent.ambient_noise || "off"}
                                   onChange={(e) => updateAgentMeta({ ambient_noise: e.target.value })}
                                   className="w-full text-xs bg-black/30 border border-white/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-brand/50 cursor-pointer appearance-none text-ink"
                                 >
                                   <option value="off">Studio (silent)</option>
                                   <option value="office">Office (kinetic)</option>
                                 </select>
                                 <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                               </div>
                             </div>
                         </div>

                         <div className="space-y-1.5">
                           <div className="flex items-center justify-between">
                              <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70 flex items-center gap-1.5">
                                <Zap className="w-2.5 h-2.5 text-brand" /> Initial greeting
                              </label>
                           </div>
                           <input
                             type="text"
                             value={selectedAgent.first_message || ""}
                             onChange={e => updateAgentMeta({ first_message: e.target.value })}
                             className="w-full text-base bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-display italic"
                           />
                         </div>
                     </div>
                    )}

                    {/* Email Config */}
                    {(selectedAgent.channel === 'email' || selectedAgent.channel === 'omnichannel' || !selectedAgent.channel) && (
                     <div className="rounded-xl glass border border-white/8 p-3 space-y-3">
                         <div className="flex items-center gap-2 pb-2 border-b border-white/8">
                           <Mail className="w-3.5 h-3.5 text-emerald-500" />
                           <h3 className="font-display italic lowercase text-base text-ink">email relay heuristics</h3>
                         </div>

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <div className="rounded-lg glass border border-white/8 p-3 flex items-center justify-between gap-3">
                                  <div className="space-y-0.5 min-w-0">
                                     <h4 className="text-sm text-ink">Auto-respond</h4>
                                     <p className="text-[10px] text-muted/70 leading-relaxed">Autonomous reply on incoming threads.</p>
                                  </div>
                                  <button
                                    onClick={() => updateAgentMeta({ email_auto_respond: !selectedAgent.email_auto_respond })}
                                    className={cn(
                                      "shrink-0 w-10 h-5 rounded-full border transition-colors flex items-center px-0.5 cursor-pointer",
                                      selectedAgent.email_auto_respond ? "bg-emerald-500/30 border-emerald-500/50" : "bg-white/5 border-white/15"
                                    )}
                                  >
                                     <motion.div
                                       animate={{ x: selectedAgent.email_auto_respond ? 18 : 0 }}
                                       className={cn("w-4 h-4 rounded-full", selectedAgent.email_auto_respond ? "bg-emerald-500" : "bg-muted/60")}
                                     />
                                  </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                  <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Relay tone</label>
                                  <select
                                    value={selectedAgent.email_agent_tone || "Professional"}
                                    onChange={e => updateAgentMeta({ email_agent_tone: e.target.value })}
                                    className="w-full text-xs bg-black/30 border border-white/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-emerald-400/50 cursor-pointer appearance-none text-ink"
                                  >
                                    <option value="Professional">Authoritative</option>
                                    <option value="Friendly">Diplomatic</option>
                                    <option value="Direct">Concise</option>
                                  </select>
                                </div>

                                <div className="space-y-1.5">
                                  <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Signature</label>
                                  <input
                                    type="text"
                                    value={selectedAgent.email_signature || ""}
                                    onChange={e => updateAgentMeta({ email_signature: e.target.value })}
                                    placeholder="— Best, Agent"
                                    className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-emerald-400/50 text-ink placeholder:text-muted/50"
                                  />
                                </div>
                            </div>
                         </div>
                     </div>
                    )}
                 </div>
              </header>

              {isConfigLoading ? (
                 <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-20">
                   <Loader2 className="w-5 h-5 animate-spin text-brand" aria-hidden="true" />
                   <span className="text-[10px] uppercase tracking-[0.4em] text-muted/70">Loading configuration</span>
                 </div>
              ) : (
                 <div className="space-y-3">
                   {/* Personality Matrix */}
                   <section className="rounded-2xl glass border border-white/10 p-4 relative overflow-hidden">
                     <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #0AC8D4, transparent)" }} />
                     <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2">
                          <Settings2 className="w-4 h-4 text-brand" />
                          <div>
                            <h3 className="font-display italic lowercase text-xl text-ink leading-none">behavioral engine</h3>
                            <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-1">Base heuristic instructions</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <AgentExportImport agentId={selectedAgent.id} agentName={selectedAgent.name} />
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
                       onChange={e => setAgentConfig({ ...agentConfig, personality: e.target.value })}
                       className="relative z-10 w-full h-48 px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-ink outline-none focus:border-brand/50 transition-all resize-none text-sm leading-relaxed placeholder:text-muted/50"
                       placeholder="Define the agent's identity, tone, and behavioral patterns…"
                     />
                   </section>

                   {/* Business profile — hours / compliance / guardrails / variables / KPI focus.
                       Each change saves immediately via updateAgentMeta, matching the
                       inline-save pattern used by name / website / first_message above. */}
                   <AgentBusinessProfile
                     value={{
                       business_hours:        selectedAgent.business_hours,
                       timezone:              selectedAgent.timezone,
                       compliance_mode:       selectedAgent.compliance_mode,
                       disallowed_topics:     selectedAgent.disallowed_topics,
                       escalation_keywords:   selectedAgent.escalation_keywords,
                       business_variables:    selectedAgent.business_variables,
                       out_of_hours_message:  selectedAgent.out_of_hours_message,
                       kpi_focus:             selectedAgent.kpi_focus,
                     }}
                     onChange={(profile) => updateAgentMeta(profile)}
                   />

                   {/* Outcome-aligned scorecard — re-keys on the kpi_focus
                       change so editing the focus refreshes the metric
                       definition without a hard reload. */}
                   <AgentScorecard
                     key={`${selectedAgent.id}:${selectedAgent.kpi_focus || 'general'}`}
                     agentId={selectedAgent.id}
                     days={30}
                     title={`Performance · 30d · ${selectedAgent.kpi_focus || 'general'}`}
                   />

                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                     {/* Directives */}
                     <section className="rounded-2xl glass border border-white/10 p-3 flex flex-col h-[560px]">
                       <header className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/8">
                          <div>
                            <h3 className="font-display italic lowercase text-lg text-ink leading-none">tactical logic</h3>
                            <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-0.5">Hard constraints</p>
                          </div>
                          <span className="px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-500 text-[9px] uppercase tracking-[0.25em] leading-none">Inviolable</span>
                       </header>
                       <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-hide">
                         <AnimatePresence mode="popLayout">
                           {agentConfig.directives?.length === 0 ? (
                              <div className="py-12 text-center text-[10px] uppercase tracking-[0.4em] text-muted/60">No directives yet</div>
                           ) : agentConfig.directives?.map((d: any) => (
                             <motion.div
                                layout
                                initial={{ opacity: 0, x: -6 }}
                                animate={{ opacity: 1, x: 0 }}
                                key={d.id}
                                className="rounded-xl bg-rose-500/8 border border-rose-500/20 p-3 group"
                             >
                                {editingDirective?.id === d.id ? (
                                   <div className="space-y-2">
                                      <textarea
                                        value={editingDirective.content}
                                        onChange={e => setEditingDirective({ ...editingDirective, content: e.target.value })}
                                        className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-rose-400/50 text-ink min-h-[80px] resize-none"
                                      />
                                      <div className="flex justify-end gap-1.5">
                                         <button onClick={() => setEditingDirective(null)} className="px-2.5 py-1 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-muted hover:text-ink">Cancel</button>
                                         <button
                                           onClick={() => saveManualEntry('directive', editingDirective.content, d.id)}
                                           disabled={isSavingEntry}
                                           className="px-2.5 py-1 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 disabled:opacity-50"
                                         >
                                            {isSavingEntry ? 'Saving…' : 'Save'}
                                         </button>
                                      </div>
                                   </div>
                                ) : (
                                   <div className="flex gap-2 items-start justify-between">
                                      <div className="flex-1 text-sm text-ink/90 leading-relaxed">{d.content}</div>
                                       <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                                        <button onClick={() => setEditingDirective({ id: d.id, content: d.content })} aria-label="Edit directive" title="Edit directive" className="w-6 h-6 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-ink hover:border-white/30"><Pencil className="w-3 h-3" /></button>
                                        <button onClick={() => deleteRule("directive", d.id)} aria-label="Delete directive" title="Delete directive" className="w-6 h-6 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-rose-500 hover:border-rose-500/30"><Trash2 className="w-3 h-3" /></button>
                                      </div>
                                   </div>
                                )}
                             </motion.div>
                           ))}
                         </AnimatePresence>
                       </div>
                       <div className="mt-3 pt-3 border-t border-white/8 space-y-1.5">
                          <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Add directive</label>
                          <div className="flex gap-1.5">
                             <input
                               type="text"
                               value={newDirective}
                               onChange={e => setNewDirective(e.target.value)}
                               onKeyDown={e => e.key === 'Enter' && saveManualEntry('directive', newDirective)}
                               placeholder="e.g. Always verify date of birth…"
                               className="flex-1 text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-rose-400/50 text-ink placeholder:text-muted/50"
                             />
                             <button
                               onClick={() => saveManualEntry('directive', newDirective)}
                               disabled={!newDirective || isSavingEntry}
                               aria-label="Add directive"
                               className="w-9 h-9 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center hover:bg-rose-500/25 disabled:opacity-50"
                             >
                               <Plus className="w-3.5 h-3.5" />
                             </button>
                          </div>
                       </div>
                     </section>

                     <section className="rounded-2xl glass border border-white/10 p-3 flex flex-col h-[560px]">
                       <header className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/8">
                          <div>
                            <h3 className="font-display italic lowercase text-lg text-ink leading-none">neural grounding</h3>
                            <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-0.5">Knowledge base</p>
                          </div>
                          <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[9px] uppercase tracking-[0.25em] leading-none">Factual</span>
                       </header>
                       <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-hide">
                         <AnimatePresence mode="popLayout">
                           {agentConfig.knowledge?.length === 0 ? (
                              <div className="py-12 text-center text-[10px] uppercase tracking-[0.4em] text-muted/60">No facts yet</div>
                           ) : agentConfig.knowledge?.map((k: any) => (
                             <motion.div
                                layout
                                initial={{ opacity: 0, x: 6 }}
                                animate={{ opacity: 1, x: 0 }}
                                key={k.id}
                                className="rounded-xl bg-blue-500/8 border border-blue-500/20 p-3 group"
                             >
                                {editingKnowledge?.id === k.id ? (
                                   <div className="space-y-2">
                                      <textarea
                                        value={editingKnowledge.content}
                                        onChange={e => setEditingKnowledge({ ...editingKnowledge, content: e.target.value })}
                                        className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-blue-400/50 text-ink min-h-[80px] resize-none"
                                      />
                                      <div className="flex justify-end gap-1.5">
                                         <button onClick={() => setEditingKnowledge(null)} className="px-2.5 py-1 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-muted hover:text-ink">Cancel</button>
                                         <button
                                           onClick={() => saveManualEntry('knowledge', editingKnowledge.content, k.id)}
                                           disabled={isSavingEntry}
                                           className="px-2.5 py-1 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 disabled:opacity-50"
                                         >
                                            {isSavingEntry ? 'Saving…' : 'Save'}
                                         </button>
                                      </div>
                                   </div>
                                ) : (
                                   <div className="flex gap-2 items-start justify-between">
                                      <div className="flex-1 text-sm text-ink/90 leading-relaxed">{k.content}</div>
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                                        <button onClick={() => setEditingKnowledge({ id: k.id, content: k.content })} aria-label="Edit knowledge fact" title="Edit knowledge fact" className="w-6 h-6 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-ink hover:border-white/30"><Pencil className="w-3 h-3" /></button>
                                        <button onClick={() => deleteRule("knowledge", k.id)} aria-label="Delete knowledge fact" title="Delete knowledge fact" className="w-6 h-6 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-blue-400 hover:border-blue-500/30"><Trash2 className="w-3 h-3" /></button>
                                      </div>
                                   </div>
                                )}
                             </motion.div>
                           ))}
                         </AnimatePresence>
                       </div>
                       <div className="mt-3 pt-3 border-t border-white/8 space-y-1.5">
                          <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Add fact</label>
                          <div className="flex gap-1.5">
                             <input
                               type="text"
                               value={newKnowledge}
                               onChange={e => setNewKnowledge(e.target.value)}
                               onKeyDown={e => e.key === 'Enter' && saveManualEntry('knowledge', newKnowledge)}
                               placeholder="e.g. Office closes at 5pm…"
                               className="flex-1 text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-blue-400/50 text-ink placeholder:text-muted/50"
                             />
                             <button
                               onClick={() => saveManualEntry('knowledge', newKnowledge)}
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
    </div>
        )}
      </div>
      <ConfirmModal
        open={seedConfirmOpen}
        title="Seed specialized agents?"
        message="This will deploy a set of pre-configured role-based agents into your fleet. Existing agents will not be affected."
        confirmLabel="Seed fleet"
        onConfirm={async () => {
          setSeedConfirmOpen(false);
          setIsCreating(true);
          try {
            const resp = await authFetch("/api/fleet/seed", { method: "POST" });
            if (resp.ok) await fetchAgents();
          } finally {
            setIsCreating(false);
          }
        }}
        onCancel={() => setSeedConfirmOpen(false)}
      />
      <ConfirmModal
        open={!!deleteConfirm}
        title="Delete agent?"
        message={`"${deleteConfirm?.name}" will be permanently removed along with all its training data. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={!!isDeletingAgent}
        onConfirm={async () => {
          if (!deleteConfirm) return;
          await handleDeleteAgent(deleteConfirm.id);
          setDeleteConfirm(null);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
    </>
  );
}
