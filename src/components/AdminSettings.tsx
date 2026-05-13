import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ServerCog, KeyRound, Loader2, Phone, Plus, Link as LinkIcon, Link2, Save, ChevronRight, RotateCw, CheckCircle2, Trash2, AlertTriangle, Cpu, CreditCard, Activity, ShieldCheck, Zap, Bot, History, TrendingUp, DollarSign, BarChart3, Clock } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import ConfirmModal from "./ConfirmModal";
import { motion, AnimatePresence } from "motion/react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { formatDateTime } from "../lib/safe-date";
import WebhooksManager from "./WebhooksManager";
import IntakeKeysManager from "./IntakeKeysManager";
import StripeBillingCard from "./StripeBillingCard";
import CrmConnectionCard from "./CrmConnectionCard";
import IntegrationHealthBanner, { type IntegrationHealthPayload } from "./IntegrationHealthBanner";
import PageShell, { Panel } from "./PageShell";
import HubTabs, { SYSTEM_HUB } from "./HubTabs";
import { useToast } from "../contexts/ToastContext";
import { useBranding } from "../contexts/BrandingContext";

// Modularized Panels
import { BrandingPanel } from "./admin/BrandingPanel";
import { TeamPanel } from "./admin/TeamPanel";
import { GrowthPanel } from "./admin/GrowthPanel";
import { AuditActivityPanel } from "./admin/AuditActivityPanel";
import { KimiQualityPanel } from "./admin/KimiQualityPanel";

type ConfirmState = { open: boolean; title: string; message: string; onConfirm: () => void };
const CLOSED_CONFIRM: ConfirmState = { open: false, title: "", message: "", onConfirm: () => {} };

export default function AdminSettings() {
  const { success: toastSuccess, error: toastError } = useToast();
  const { signOut } = useAuth();
  const { updateBranding } = useBranding();
  const [confirmState, setConfirmState] = useState<ConfirmState>(CLOSED_CONFIRM);
  const [settings, setSettings] = useState({
    vapi_phone_number_id: "",
    vapi_phone_inbound_agent_id: "",
    subscription_status: "active",
    max_agents: 3,
    voice_llm_provider: "google",
    voice_llm_model: "gemini-1.5-flash",
    twilio_messaging_enabled: false,
    twilio_lookup_enabled: false,
    twilio_manager_alerts_enabled: false,
    twilio_messaging_service_sid: "",
    twilio_sms_from_number: "",
    twilio_whatsapp_from_number: "",
    twilio_manager_alert_number: "",
    target_employee_ranges: ["1,10", "11,50"] as string[],
    brand_name: "",
    brand_logo_url: "",
    primary_color: "#0AC8D4",
  });
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingNumber, setIsDeletingNumber] = useState<number | string | null>(null);
  const [claudeStatus, setClaudeStatus] = useState<{ available: boolean; model: string; capabilities?: string[] } | null>(null);
  type IntegrationRow = {
    id: string;
    label: string;
    description: string;
    group: string;
    required: boolean;
    status: "configured" | "missing" | "fallback";
    envVars: Array<{ name: string; present: boolean }>;
    fallback?: string;
    docsUrl?: string;
  };
  const [integrations, setIntegrations] = useState<IntegrationRow[] | null>(null);
  const [operationalSlos, setOperationalSlos] = useState<Record<string, unknown> | null>(null);
  const [integrationHealth, setIntegrationHealth] = useState<IntegrationHealthPayload | null>(null);

  const [newNumber, setNewNumber] = useState("");
  const [newNumberVapiId, setNewNumberVapiId] = useState("");

  const [activeTab, setActiveTab] = useState<"carrier" | "subscription" | "team" | "flywheel" | "system" | "activity" | "quality">("carrier");

  const [carrierNumbers, setCarrierNumbers] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const providerDocsUrl = {
    google: "https://ai.google.dev/gemini-api/docs/models",
    anthropic: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
  }[settings.voice_llm_provider] ?? "https://ai.google.dev/gemini-api/docs/models";

  const fetchIntegrationHealth = async () => {
    try {
      const r = await authFetch("/api/oauth/integration-health");
      if (r.ok) setIntegrationHealth(await r.json());
      else setIntegrationHealth(null);
    } catch {
      setIntegrationHealth(null);
    }
  };

  useEffect(() => { fetchData(); fetchClaudeStatus(); fetchIntegrations(); fetchOperationalSlos(); fetchIntegrationHealth(); fetchTeam(); }, []);

  const fetchTeam = async () => {
    try {
      const r = await authFetch("/api/team");
      if (r.ok) {
        const d = await r.json();
        setTeamMembers(d.members || []);
      }
    } catch { /* non-critical */ }
  };

  const fetchClaudeStatus = async () => {
    try {
      const r = await authFetch("/api/claude/status");
      if (r.ok) setClaudeStatus(await r.json());
    } catch { /* non-critical */ }
  };

  const fetchIntegrations = async () => {
    try {
      const r = await authFetch("/api/health/integrations");
      if (r.ok) {
        const d = await r.json();
        setIntegrations(d.integrations || []);
      }
    } catch { /* non-critical */ }
  };

  const fetchOperationalSlos = async () => {
    try {
      const r = await authFetch("/api/health/slos");
      if (r.ok) setOperationalSlos(await r.json());
      else setOperationalSlos(null);
    } catch {
      setOperationalSlos(null);
    }
  };

  const downloadEvidencePack = async () => {
    try {
      const r = await authFetch("/api/soc2/evidence-pack");
      if (!r.ok) {
        toastError("Export unavailable", "Requires audit.read permission — owner, admin, or auditor roles.");
        return;
      }
      const data = await r.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `wireline-soc2-evidence-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toastSuccess("Evidence pack exported", "JSON downloaded for your SOC2 workbook.");
    } catch (e: any) {
      toastError("Export failed", e?.message || "Unknown error.");
    }
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [settingsRes, agentsRes, numbersRes] = await Promise.all([
        authFetch("/api/settings").then(r => r.json()),
        authFetch("/api/agents").then(r => r.json()),
        authFetch("/api/phone-numbers").then(r => r.json()).catch(() => ({ numbers: [] }))
      ]);

      if (settingsRes) {
        setSettings({
          vapi_phone_number_id: settingsRes.vapi_phone_number_id || "",
          vapi_phone_inbound_agent_id: settingsRes.vapi_phone_inbound_agent_id || "",
          subscription_status: settingsRes.subscription_status || "active",
          max_agents: settingsRes.max_agents || 3,
          voice_llm_provider: settingsRes.voice_llm_provider || "google",
          voice_llm_model: settingsRes.voice_llm_model || "gemini-1.5-flash",
          twilio_messaging_enabled: !!settingsRes.twilio_messaging_enabled,
          twilio_lookup_enabled: !!settingsRes.twilio_lookup_enabled,
          twilio_manager_alerts_enabled: !!settingsRes.twilio_manager_alerts_enabled,
          twilio_messaging_service_sid: settingsRes.twilio_messaging_service_sid || "",
          twilio_sms_from_number: settingsRes.twilio_sms_from_number || "",
          twilio_whatsapp_from_number: settingsRes.twilio_whatsapp_from_number || "",
          twilio_manager_alert_number: settingsRes.twilio_manager_alert_number || "",
          prospecting_enabled: !!settingsRes.prospecting_enabled,
          target_titles: settingsRes.target_titles || [],
          target_industries: settingsRes.target_industries || [],
          target_states: settingsRes.target_states || [],
          target_employee_ranges: settingsRes.target_employee_ranges || ["1,10", "11,50"],
          brand_name: settingsRes.brand_name || "",
          brand_logo_url: settingsRes.brand_logo_url || "",
          primary_color: settingsRes.primary_color || "#0AC8D4",
        });
      }
      setAgents(agentsRes.agents || []);
      setPhoneNumbers(numbersRes.numbers || []);

      // Fetch team members
      const teamRes = await authFetch("/api/team");
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        setTeamMembers(teamData.members || []);
      }
    } catch (e) {
      console.error(e);
      toastError("Settings unavailable", "Could not load settings. Please refresh.");
    }
    setIsLoading(false);
  };

  const syncCarrierNumbers = async () => {
    setIsSyncing(true);
    try {
      const res = await authFetch("/api/carrier/numbers");
      const data = await res.json();
      setCarrierNumbers(data.numbers || []);
    } catch (e) {
      console.error(e);
      toastError("Sync failed", "Could not fetch available Wireline phone numbers.");
    }
    setIsSyncing(false);
  };

  const saveSettings = async () => {
    setIsSaving(true);
    try {
      const res = await authFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error("Save failed");
      
      updateBranding({
        brand_name: settings.brand_name,
        brand_logo_url: settings.brand_logo_url,
        primary_color: settings.primary_color,
      });

      toastSuccess("Settings saved", "Platform configuration updated.");
    } catch (e: any) {
      toastError("Save failed", e.message);
    }
    setIsSaving(false);
  };

  const inviteTeamMember = async (email: string, role: string) => {
    try {
      const res = await authFetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role })
      });
      if (!res.ok) throw new Error("Invite failed");
      toastSuccess("Invitation sent", `An invite has been sent to ${email}`);
      fetchData();
    } catch (e: any) {
      toastError("Invite failed", e.message);
    }
  };

  const removeTeamMember = async (id: string) => {
    try {
      const res = await authFetch(`/api/team/members/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Removal failed");
      toastSuccess("Member removed", "Team access revoked.");
      fetchData();
    } catch (e: any) {
      toastError("Removal failed", e.message);
    }
  };

  const addPhoneNumber = async () => {
    if (!newNumber || !newNumberVapiId) return;
    try {
      await authFetch("/api/phone-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: newNumber, vapi_number_id: newNumberVapiId })
      });
      setNewNumber("");
      setNewNumberVapiId("");
      fetchData();
      toastSuccess("Number added", newNumber);
    } catch (e: any) {
      toastError("Failed to add number", e.message);
    }
  };

  const updateNumberAgent = async (id: string, agent_id: string) => {
    try {
      await authFetch(`/api/phone-numbers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id })
      });
      fetchData();
    } catch (e) {
      console.error(e);
      toastError("Assignment failed", "Could not update the agent for this number.");
    }
  };

  const deletePhoneNumber = (id: number | string) => {
    setConfirmState({
      open: true,
      title: "Remove number",
      message: "Remove this phone number from your fleet? The number stays in your Wireline voice network, but it will stop routing calls to agents.",
      onConfirm: async () => {
        setConfirmState(CLOSED_CONFIRM);
        setIsDeletingNumber(id);
    try {
      const resp = await authFetch(`/api/phone-numbers/${id}`, { method: "DELETE" });
      if (resp.ok) {
        setPhoneNumbers(prev => prev.filter(n => n.id !== id));
      }
    } catch (e) {
      console.error(e);
      toastError("Delete failed", "Could not remove this carrier number. Please try again.");
    }
    setIsDeletingNumber(null);
      },
    });
  };

  const deleteAccount = async () => {
    if (deleteConfirmText !== "DELETE MY ACCOUNT") return;
    setDeletingAccount(true);
    try {
      const res = await authFetch("/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE MY ACCOUNT" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Deletion failed");
      }
      await signOut();
    } catch (e: any) {
      toastError("Account deletion failed", e.message);
      setDeletingAccount(false);
    }
  };

  const tabSwitcher = (
    <div className="flex p-1 rounded-full glass border border-white/10" role="tablist">
      {(["carrier", "subscription", "team", "flywheel", "system", "quality", "activity"] as const).map(t => (
        <button
          key={t}
          role="tab"
          aria-selected={activeTab === t}
          aria-controls={`admin-panel-${t}`}
          onClick={() => setActiveTab(t)}
          className={cn(
            "px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.25em] transition-colors",
            activeTab === t ? "bg-brand/20 text-brand" : "text-muted hover:text-ink"
          )}
        >
          {t === "carrier" ? "Carrier" : t === "subscription" ? "Billing" : t === "team" ? "Team" : t === "flywheel" ? "Growth" : t === "system" ? "System" : t === "quality" ? "Quality" : "Activity"}
        </button>
      ))}
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0">
    <HubTabs tabs={SYSTEM_HUB} label="System sub-navigation" />
    <div className="flex-1 min-h-0">
    <PageShell
      title="Settings"
      eyebrow="Admin · Configuration"
      subtitle="API credentials, phone numbers, and platform configuration."
      actions={tabSwitcher}
    >
      <IntegrationHealthBanner
        health={integrationHealth}
        onOpenIntegrations={() => setActiveTab("system")}
      />
      {isLoading ? (
        <div role="status" aria-live="polite" className="h-full flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-brand" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-muted/70">Loading settings</span>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {activeTab === "carrier" && (
            <motion.div
              key="carrier"
              id="admin-panel-carrier"
              role="tabpanel"
              tabIndex={0}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-full grid grid-cols-1 xl:grid-cols-2 gap-3 min-h-0"
            >
              {/* Carrier authentication */}
              <Panel title="Wireline Voice Network" hint="CALLS" icon={Cpu} scroll>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="rounded-xl glass border border-brand/30 p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                        <p className="text-[9px] uppercase tracking-[0.3em] text-ink/80">Voice network key</p>
                      </div>
                      <p className="text-[9px] uppercase tracking-[0.3em] text-brand">Managed by Wireline</p>
                    </div>
                    <div className={cn(
                      "rounded-xl border p-3 space-y-1.5",
                      import.meta.env.VITE_VAPI_PUBLIC_KEY
                        ? "bg-emerald-500/10 border-emerald-500/30"
                        : "bg-rose-500/10 border-rose-500/30"
                    )}>
                      <div className="flex items-center gap-1.5">
                        <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse",
                          import.meta.env.VITE_VAPI_PUBLIC_KEY ? "bg-emerald-500" : "bg-rose-500"
                        )} />
                        <p className="text-[9px] uppercase tracking-[0.3em] text-ink/80">Browser voice key</p>
                      </div>
                      <p className={cn("text-[9px] uppercase tracking-[0.3em]",
                        import.meta.env.VITE_VAPI_PUBLIC_KEY ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {import.meta.env.VITE_VAPI_PUBLIC_KEY ? "Connected" : "Missing"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="vapi-phone-number-id" className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Default Wireline phone number ID</label>
                    <input
                      id="vapi-phone-number-id"
                      type="text"
                      value={settings.vapi_phone_number_id}
                      onChange={e => setSettings({ ...settings, vapi_phone_number_id: e.target.value })}
                      className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono"
                      placeholder="e.g. 3c7a9f…"
                    />
                    <p className="text-[9px] text-muted/70 leading-relaxed">
                      Must match your Vapi number id for outbound dialing. Inbound webhooks infer the tenant when Vapi sends <span className="font-mono">call.phoneNumberId</span>; register each line below and assign an agent, or set default inbound routing here.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="vapi-inbound-agent-id" className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Default inbound voice agent</label>
                    <div className="relative">
                      <select
                        id="vapi-inbound-agent-id"
                        aria-label="Default inbound Wireline agent for unmatched Vapi phone rows"
                        value={settings.vapi_phone_inbound_agent_id}
                        onChange={e =>
                          setSettings({ ...settings, vapi_phone_inbound_agent_id: e.target.value })
                        }
                        className="w-full text-sm bg-black/5 border border-black/10 rounded-lg pl-3 pr-8 py-2 outline-none focus:border-brand/50 appearance-none cursor-pointer text-ink"
                      >
                        <option value="">Oldest voice agent (fallback)</option>
                        {agents
                          .filter(a => a.channel === "voice" || a.channel === "omnichannel" || !a.channel)
                          .map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                      </select>
                      <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                    </div>
                    <p className="text-[9px] text-muted/70 leading-relaxed">
                      Used when a line&apos;s Agent is unset in Phone Numbers below, or Vapi sends only Default Wireline ID. Set Riley (or another agent) here for consistent inbound greetings.
                    </p>
                  </div>

                  {/* Voice LLM picker */}
                  <div className="rounded-2xl glass border border-white/10 p-4 space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.4em] text-brand">Voice LLM</div>
                      <h4 className="font-display italic lowercase text-xl text-ink leading-tight mt-0.5">voice brain for live calls</h4>
                      <p className="text-[10px] text-muted/80 mt-1 leading-relaxed">
                        Wireline routes each voice call through this LLM. Defaults to Gemini Flash.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {[
                        { v: "google", label: "Google", sub: "Gemini", desc: "Lowest latency, cheapest." },
                        { v: "anthropic", label: "Anthropic", sub: "Claude", desc: "Best reasoning, most steerable." },
                      ].map((p) => (
                        <button
                          key={p.v}
                          type="button"
                          aria-pressed={settings.voice_llm_provider === p.v}
                          onClick={() => setSettings({
                            ...settings,
                            voice_llm_provider: p.v,
                            voice_llm_model:
                              p.v === "google" ? "gemini-1.5-flash" :
                              "claude-3-5-sonnet-20241022",
                          })}
                          className={cn(
                            "text-left rounded-xl p-3 transition-all border",
                            settings.voice_llm_provider === p.v
                              ? "bg-brand/10 border-brand/40"
                              : "bg-black/20 border-white/8 hover:border-white/30"
                          )}
                        >
                          <div className="flex items-baseline justify-between mb-0.5">
                            <span className="text-sm text-ink">{p.label}</span>
                            <span className="text-[9px] uppercase tracking-[0.3em] text-muted">{p.sub}</span>
                          </div>
                          <p className="text-[10px] text-muted/80 leading-snug">{p.desc}</p>
                        </button>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="voice-llm-model" className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Model ID</label>
                      <input
                        id="voice-llm-model"
                        type="text"
                        value={settings.voice_llm_model}
                        onChange={(e) => setSettings({ ...settings, voice_llm_model: e.target.value })}
                        placeholder="e.g. claude-3-5-sonnet-20241022"
                        className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono"
                      />
                      <p className="text-[10px] text-muted/70 leading-relaxed">
                        Supported models may change over time. Check your
                        <a href={providerDocsUrl} target="_blank" rel="noopener noreferrer" className="text-brand mx-1 underline">provider documentation</a>
                        for the current list.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl glass border border-white/10 p-4 space-y-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.4em] text-brand">Wireline Messaging Network</div>
                      <h4 className="font-display italic lowercase text-xl text-ink leading-tight mt-0.5">texts, whatsapp, lookup, alerts</h4>
                      <p className="text-[10px] text-muted/80 mt-1 leading-relaxed">
                        Use your Wireline texting layer for SMS, WhatsApp, number intelligence, and live escalation alerts.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {[
                        {
                          key: "twilio_messaging_enabled" as const,
                          label: "Texting",
                          desc: "Allow agents and workflows to send SMS / WhatsApp follow-ups from your Wireline number.",
                        },
                        {
                          key: "twilio_lookup_enabled" as const,
                          label: "Number intelligence",
                          desc: "Validate numbers and reveal line type before texting.",
                        },
                        {
                          key: "twilio_manager_alerts_enabled" as const,
                          label: "Live escalation alerts",
                          desc: "Send urgent live-call alerts to a manager phone.",
                        },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setSettings({ ...settings, [item.key]: !settings[item.key] })}
                          className={cn(
                            "text-left rounded-xl p-3 transition-all border",
                            settings[item.key]
                              ? "bg-brand/10 border-brand/40"
                              : "bg-black/20 border-white/8 hover:border-white/30"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm text-ink">{item.label}</span>
                            <span className={cn(
                              "text-[8px] uppercase tracking-[0.25em] px-1.5 py-0.5 rounded-full border",
                              settings[item.key]
                                ? "bg-brand/10 border-brand/30 text-brand"
                                : "bg-white/5 border-white/10 text-muted"
                            )}>
                              {settings[item.key] ? "On" : "Off"}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted/80 leading-snug">{item.desc}</p>
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Texting service ID</label>
                        <input
                          type="text"
                          value={settings.twilio_messaging_service_sid}
                          onChange={(e) => setSettings({ ...settings, twilio_messaging_service_sid: e.target.value })}
                          placeholder="MGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                          className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Alert destination number</label>
                        <input
                          type="tel"
                          value={settings.twilio_manager_alert_number}
                          onChange={(e) => setSettings({ ...settings, twilio_manager_alert_number: e.target.value })}
                          placeholder="+1 800 555 0100"
                          className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 tabular-nums"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Primary texting number</label>
                        <input
                          type="tel"
                          value={settings.twilio_sms_from_number}
                          onChange={(e) => setSettings({ ...settings, twilio_sms_from_number: e.target.value })}
                          placeholder="+1 800 555 0100"
                          className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 tabular-nums"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">WhatsApp number</label>
                        <input
                          type="tel"
                          value={settings.twilio_whatsapp_from_number}
                          onChange={(e) => setSettings({ ...settings, twilio_whatsapp_from_number: e.target.value })}
                          placeholder="+1 800 555 0100"
                          className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 tabular-nums"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Outbound webhooks + intake keys */}
                  <WebhooksManager />
                  <IntakeKeysManager />

                  <div className="pt-3 border-t border-white/8">
                    <button
                      onClick={saveSettings}
                      disabled={isSaving}
                      className="brutal-btn !py-2.5 !px-5 !text-[11px] !tracking-[0.3em] disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                      Save settings
                    </button>
                  </div>
                </div>
              </Panel>

              {/* Hub & routing */}
              <Panel title="Wireline Phone Numbers" hint="VOICE ROUTING" icon={Phone} scroll>
                <div className="space-y-3">
                  {phoneNumbers.length === 0 ? (
                    <div className="rounded-xl glass border border-white/10 border-dashed py-8 text-center">
                      <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70">No active lines</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {phoneNumbers.map(pt => (
                        <motion.div
                          layout
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          key={pt.id}
                          className="rounded-xl glass border border-white/8 p-3 flex flex-col xl:flex-row xl:items-center gap-2"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-display italic text-lg text-ink leading-none tabular-nums truncate">{pt.phone_number}</div>
                            <div className="text-[9px] uppercase tracking-[0.3em] text-muted/60 mt-1 font-mono">
                              {pt.vapi_number_id?.substring(0, 16)}…
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <LinkIcon className="w-3 h-3 text-brand" />
                            <div className="relative">
                              <select
                                aria-label={`Assign agent to ${pt.phone_number}`}
                                value={pt.agent_id || ""}
                                onChange={(e) => updateNumberAgent(pt.id, e.target.value)}
                                className="text-xs bg-black/5 border border-black/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-brand/50 appearance-none cursor-pointer text-ink min-w-[150px]"
                              >
                                <option value="">Unassigned</option>
                                {agents.filter(a => a.channel === 'voice' || a.channel === 'omnichannel' || !a.channel).map(a => (
                                  <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                              </select>
                              <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none rotate-90" />
                            </div>
                            <button
                              onClick={() => deletePhoneNumber(pt.id)}
                              disabled={isDeletingNumber === pt.id}
                              title="Delete phone number"
                              aria-label={`Delete phone number ${pt.phone_number}`}
                              className="w-7 h-7 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-rose-500 hover:border-rose-500/30 disabled:opacity-40 transition-all"
                            >
                              {isDeletingNumber === pt.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Trash2 className="w-3 h-3" />}
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Add new */}
                  <div className="rounded-xl glass border border-white/8 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] uppercase tracking-[0.3em] text-ink inline-flex items-center gap-1.5">
                        <Plus className="w-3 h-3 text-brand" /> Add Wireline number
                      </h4>
                      <button
                        onClick={syncCarrierNumbers}
                        disabled={isSyncing}
                        className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.3em] text-muted/70 hover:text-brand transition-colors"
                      >
                        {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                        Sync numbers
                      </button>
                    </div>

                    <AnimatePresence>
                      {carrierNumbers.length > 0 && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-1 max-h-[200px] overflow-y-auto scrollbar-hide">
                            {carrierNumbers.map(c => (
                              <button
                                key={c.id}
                                onClick={() => { setNewNumber(c.number); setNewNumberVapiId(c.id); }}
                                className="w-full px-3 py-2 rounded-lg glass border border-white/8 hover:border-brand/40 hover:bg-brand/5 transition-all flex items-center justify-between text-xs text-ink group"
                              >
                                <span className="font-mono tabular-nums">{c.number}</span>
                                <span className="text-[9px] text-muted/70 font-mono">
                                  {c.id.substring(0, 8)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <input
                        type="tel"
                        value={newNumber}
                        onChange={e => setNewNumber(e.target.value)}
                        placeholder="+1 800 555 0100"
                        className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 tabular-nums"
                      />
                      <input
                        type="text"
                        value={newNumberVapiId}
                        onChange={e => setNewNumberVapiId(e.target.value)}
                        placeholder="Wireline voice number ID"
                        className="w-full text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono"
                      />
                    </div>
                    <button
                      onClick={addPhoneNumber}
                      disabled={!newNumber || !newNumberVapiId}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.3em] hover:bg-brand/25 transition-colors disabled:opacity-30"
                    >
                      <Plus className="w-3 h-3" /> Register number
                    </button>
                  </div>
                </div>
              </Panel>
            </motion.div>
          )}

          {activeTab === "subscription" && (
            <motion.div
              key="subscription"
              id="admin-panel-subscription"
              role="tabpanel"
              tabIndex={0}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-full overflow-y-auto scrollbar-hide space-y-3"
            >
              {/* Stripe billing — keep as-is, already follows the new design */}
              <StripeBillingCard />

              {/* Subscription state simulator */}
              <Panel title="subscription state" hint="SIMULATOR" icon={CreditCard}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="rounded-xl glass border border-rose-500/20 p-3 space-y-3 relative">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3 text-rose-500" />
                        <label className="text-[10px] uppercase tracking-[0.3em] text-rose-500">Operational state</label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setSettings({ ...settings, subscription_status: 'active' })}
                          className={cn(
                            "py-3 rounded-lg border text-[10px] uppercase tracking-[0.25em] transition-all flex items-center justify-center gap-1.5",
                            settings.subscription_status === 'active'
                              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-500"
                              : "bg-white/5 border-white/10 text-muted/70 hover:border-white/20"
                          )}
                        >
                          {settings.subscription_status === 'active' && <CheckCircle2 className="w-3 h-3" />}
                          Active
                        </button>
                        <button
                          onClick={() => setSettings({ ...settings, subscription_status: 'past_due' })}
                          className={cn(
                            "py-3 rounded-lg border text-[10px] uppercase tracking-[0.25em] transition-all flex items-center justify-center gap-1.5",
                            settings.subscription_status === 'past_due'
                              ? "bg-rose-500/15 border-rose-500/40 text-rose-500"
                              : "bg-white/5 border-white/10 text-muted/70 hover:border-white/20"
                          )}
                        >
                          {settings.subscription_status === 'past_due' && <Activity className="w-3 h-3 animate-pulse" />}
                          Suspended
                        </button>
                      </div>
                      <p className="text-[10px] text-muted/80 leading-relaxed">
                        Suspending an account locks fleet routing and disables carrier webhooks immediately.
                      </p>
                    </div>

                    <div className="rounded-xl glass border border-white/10 p-3 space-y-3">
                      <label className="text-[10px] uppercase tracking-[0.3em] text-muted/70">Max agents</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="1"
                          max="20"
                          value={settings.max_agents}
                          onChange={e => setSettings({ ...settings, max_agents: parseInt(e.target.value) })}
                          className="flex-1 accent-brand"
                        />
                        <div className="w-12 h-12 rounded-xl glass border border-brand/40 text-brand flex items-center justify-center font-display italic text-2xl tabular-nums">
                          {settings.max_agents}
                        </div>
                      </div>
                      <div className="flex justify-between text-[9px] uppercase tracking-[0.3em] text-muted/60">
                        <span>Starter</span>
                        <span>Enterprise</span>
                      </div>
                    </div>

                    <button
                      onClick={saveSettings}
                      disabled={isSaving}
                      className="brutal-btn w-full !py-2.5 !text-[11px] !tracking-[0.3em] disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save billing
                    </button>
                  </div>

                  <div className="rounded-2xl glass border border-brand/20 p-4 space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-white/8">
                      <ServerCog className="w-3.5 h-3.5 text-brand" />
                      <h4 className="font-display italic lowercase text-base text-ink">developer terminal</h4>
                    </div>
                    <div className="space-y-2 text-[11px] font-mono">
                      <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-muted/70 uppercase tracking-[0.2em] text-[9px]">Core</span>
                        <span className="text-ink">v2.0.4</span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-muted/70 uppercase tracking-[0.2em] text-[9px]">State</span>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-full border text-[9px] uppercase tracking-[0.25em] leading-none",
                          settings.subscription_status === 'active'
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                            : "bg-rose-500/10 border-rose-500/30 text-rose-500"
                        )}>
                          {settings.subscription_status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-1 border-b border-white/5">
                        <span className="text-muted/70 uppercase tracking-[0.2em] text-[9px]">Agents</span>
                        <span className="text-ink tabular-nums">{agents.length} deployed</span>
                      </div>
                      <div className="flex items-center justify-between py-1">
                        <span className="text-muted/70 uppercase tracking-[0.2em] text-[9px]">Quota</span>
                        <span className="text-brand tabular-nums">{Math.max(0, settings.max_agents - agents.length)} free</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Danger Zone */}
              <Panel title="Danger Zone" hint="Irreversible actions" icon={AlertTriangle} scroll>
                <div className="space-y-5">
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-rose-500 uppercase tracking-[0.2em]">Delete account</p>
                        <p className="text-xs text-muted/80">
                          Permanently deletes your account and all associated data — agents, call logs, knowledge base,
                          email threads, campaigns, and billing records. This action cannot be undone.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] text-muted">
                        Type <span className="font-mono text-rose-500">DELETE MY ACCOUNT</span> to confirm:
                      </p>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={e => setDeleteConfirmText(e.target.value)}
                        placeholder="DELETE MY ACCOUNT"
                        className="w-full h-9 px-3 rounded-lg bg-black/5 border border-rose-500/20 text-xs font-mono text-ink outline-none focus:border-rose-500/50 transition-all placeholder:text-muted/40"
                      />
                      <button
                        onClick={deleteAccount}
                        disabled={deletingAccount || deleteConfirmText !== "DELETE MY ACCOUNT"}
                        className="w-full h-9 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-500 text-[11px] uppercase tracking-[0.2em] hover:bg-rose-500/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                      >
                        {deletingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        {deletingAccount ? "Deleting…" : "Delete my account"}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-muted/60 border-t border-white/5 pt-3">
                    <Link to="/privacy" className="hover:text-muted transition-colors">Privacy Policy</Link>
                    <span>·</span>
                    <Link to="/terms" className="hover:text-muted transition-colors">Terms of Service</Link>
                  </div>
                </div>
              </Panel>
            </motion.div>
          )}
          {activeTab === "system" && (
            <motion.div
              key="system"
              id="admin-panel-system"
              role="tabpanel"
              tabIndex={0}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col gap-3 min-h-0 overflow-y-auto scrollbar-hide pb-4"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 shrink-0">
              <Panel title="AI Engine" hint="Claude · Anthropic" icon={Bot} scroll>
                <div className="space-y-4">
                  <div className="rounded-xl glass border border-white/8 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        claudeStatus?.available ? "bg-emerald-500/15 border border-emerald-500/30" : "bg-rose-500/15 border border-rose-500/30"
                      )}>
                        <Zap className={cn("w-4 h-4", claudeStatus?.available ? "text-emerald-600" : "text-rose-500")} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-ink">
                          {claudeStatus?.available ? "Claude Online" : "Claude Offline"}
                        </div>
                        <div className="text-[10px] text-muted uppercase tracking-[0.25em] mt-0.5">
                          {claudeStatus?.model || "—"}
                        </div>
                      </div>
                      <div className="ml-auto">
                        {claudeStatus?.available
                          ? <span className="px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 text-[9px] uppercase tracking-[0.25em]">Active</span>
                          : <span className="px-2 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-500 text-[9px] uppercase tracking-[0.25em]">Offline</span>}
                      </div>
                    </div>
                    <div className="text-[11px] text-muted leading-relaxed border-t border-white/5 pt-3">
                      Your Anthropic API key is configured server-side. All Claude AI features — Daily Brief, call enrichment, recipes, coaching, qualification — are available to your users at no extra cost to them. AI usage is metered through your Wireline subscription.
                    </div>
                  </div>
                  <div className="rounded-xl glass border border-white/8 p-4 space-y-2">
                    <div className="text-[9px] uppercase tracking-[0.3em] text-brand mb-3">Capabilities Active</div>
                    {(claudeStatus?.capabilities || [
                      "brief", "qualify", "objection-drill", "cold-email",
                      "persona-clone", "summarize-thread", "route-intent",
                      "smart-draft", "agent-review"
                    ]).map((cap: string) => (
                      <div key={cap} className="flex items-center gap-2 text-[11px] text-ink/80">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="capitalize">{cap.replace(/-/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
            </div>
          </motion.div>
        )}

        {activeTab === "team" && (
            <motion.div
              key="team"
              id="admin-panel-team"
              role="tabpanel"
              tabIndex={0}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col gap-3 min-h-0 overflow-y-auto scrollbar-hide pb-4"
            >
              <TeamPanel 
                members={teamMembers} 
                onInvite={inviteTeamMember} 
                onRemove={removeTeamMember} 
              />
            </motion.div>
          )}

          {activeTab === "flywheel" && (
            <motion.div
              key="flywheel"
              id="admin-panel-flywheel"
              role="tabpanel"
              tabIndex={0}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-full flex flex-col gap-3 min-h-0 overflow-y-auto scrollbar-hide pb-4"
            >
              <GrowthPanel 
                settings={settings} 
                setSettings={setSettings} 
                onSave={saveSettings} 
                isSaving={isSaving} 
              />
            </motion.div>
          )}

          {activeTab === "quality" && (
            <motion.div
              key="quality"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <KimiQualityPanel />
            </motion.div>
          )}

          {activeTab === "activity" && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-full"
            >
              <AuditActivityPanel />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </PageShell>
    <ConfirmModal
      open={confirmState.open}
      title={confirmState.title}
      message={confirmState.message}
      danger
      onConfirm={confirmState.onConfirm}
      onCancel={() => setConfirmState(CLOSED_CONFIRM)}
    />
    </div>
    </div>
  );
}



