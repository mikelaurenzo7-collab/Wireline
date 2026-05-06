import { useState, useEffect } from "react";
import { ServerCog, KeyRound, Loader2, Phone, Plus, Link as LinkIcon, Save, ChevronRight, RotateCw, CheckCircle2, Trash2, AlertTriangle, Cpu, CreditCard, Activity, ShieldCheck, Zap, Bot, Wifi, History, TrendingUp, DollarSign, BarChart3, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import WebhooksManager from "./WebhooksManager";
import IntakeKeysManager from "./IntakeKeysManager";
import StripeBillingCard from "./StripeBillingCard";
import PageShell, { Panel } from "./PageShell";
import { useToast } from "../contexts/ToastContext";

export default function AdminSettings() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [settings, setSettings] = useState({
    vapi_phone_number_id: "",
    subscription_status: "active",
    max_agents: 3,
    voice_llm_provider: "google",
    voice_llm_model: "gemini-1.5-flash",
  });
  const [agents, setAgents] = useState<any[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingNumber, setIsDeletingNumber] = useState<number | string | null>(null);
  const [claudeStatus, setClaudeStatus] = useState<{ available: boolean; model: string; capabilities?: string[] } | null>(null);

  const [newNumber, setNewNumber] = useState("");
  const [newNumberVapiId, setNewNumberVapiId] = useState("");

  const [activeTab, setActiveTab] = useState<"carrier" | "subscription" | "system" | "activity">("carrier");

  const [carrierNumbers, setCarrierNumbers] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const providerDocsUrl = {
    google: "https://ai.google.dev/gemini-api/docs/models",
    anthropic: "https://docs.anthropic.com/en/docs/about-claude/models/overview",
    openai: "https://platform.openai.com/docs/models",
    groq: "https://console.groq.com/docs/models",
  }[settings.voice_llm_provider] ?? "https://platform.openai.com/docs/models";

  useEffect(() => { fetchData(); fetchClaudeStatus(); }, []);

  const fetchClaudeStatus = async () => {
    try {
      const r = await authFetch("/api/claude/status");
      if (r.ok) setClaudeStatus(await r.json());
    } catch (_) { /* non-critical */ }
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
          subscription_status: settingsRes.subscription_status || "active",
          max_agents: settingsRes.max_agents || 3,
          voice_llm_provider: settingsRes.voice_llm_provider || "google",
          voice_llm_model: settingsRes.voice_llm_model || "gemini-1.5-flash",
        });
      }
      setAgents(agentsRes.agents || []);
      setPhoneNumbers(numbersRes.numbers || []);
    } catch (e) {
      console.error(e);
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
      toastSuccess("Settings saved", "Platform configuration updated.");
    } catch (e: any) {
      toastError("Save failed", e.message);
    }
    setIsSaving(false);
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
    }
  };

  const deletePhoneNumber = async (id: number | string) => {
    if (!confirm("Remove this carrier number?")) return;
    setIsDeletingNumber(id);
    try {
      const resp = await authFetch(`/api/phone-numbers/${id}`, { method: "DELETE" });
      if (resp.ok) {
        setPhoneNumbers(prev => prev.filter(n => n.id !== id));
      }
    } catch (e) {
      console.error(e);
    }
    setIsDeletingNumber(null);
  };

  const tabSwitcher = (
    <div className="flex p-1 rounded-full glass border border-white/10" role="tablist">
      {(["carrier", "subscription", "system", "activity"] as const).map(t => (
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
          {t === "carrier" ? "Carrier" : t === "subscription" ? "Billing" : t === "system" ? "System" : "Activity"}
        </button>
      ))}
    </div>
  );

  return (
    <PageShell
      title="Settings"
      eyebrow="Admin · Configuration"
      subtitle="API credentials, phone numbers, and platform configuration."
      actions={tabSwitcher}
    >
      {isLoading ? (
        <div role="status" aria-live="polite" className="h-full flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-brand" aria-hidden="true" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-muted/70">Loading settings</span>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {activeTab === "carrier" ? (
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
              <Panel title="Wireline Credentials" hint="VOICE" icon={Cpu} scroll>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="rounded-xl glass border border-brand/30 p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                        <p className="text-[9px] uppercase tracking-[0.3em] text-ink/80">Secret key</p>
                      </div>
                      <p className="text-[9px] uppercase tracking-[0.3em] text-brand">Managed via secure vault</p>
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
                        <p className="text-[9px] uppercase tracking-[0.3em] text-ink/80">Public key</p>
                      </div>
                      <p className={cn("text-[9px] uppercase tracking-[0.3em]",
                        import.meta.env.VITE_VAPI_PUBLIC_KEY ? "text-emerald-500" : "text-rose-500"
                      )}>
                        {import.meta.env.VITE_VAPI_PUBLIC_KEY ? "Detected" : "Missing"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="vapi-phone-number-id" className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Fallback Wireline number ID</label>
                    <input
                      id="vapi-phone-number-id"
                      type="text"
                      value={settings.vapi_phone_number_id}
                      onChange={e => setSettings({ ...settings, vapi_phone_number_id: e.target.value })}
                      className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono"
                      placeholder="e.g. 3c7a9f…"
                    />
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
                        { v: "openai", label: "OpenAI", sub: "GPT", desc: "Optional — set the model below." },
                        { v: "groq", label: "Groq", sub: "OSS via Groq", desc: "Optional — set the model below." },
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
                              p.v === "anthropic" ? "claude-3-5-sonnet-20241022" :
                              p.v === "openai" ? "gpt-4o-mini" :
                              "llama-3.3-70b-versatile",
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
                        className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono"
                      />
                      <p className="text-[10px] text-muted/70 leading-relaxed">
                        Supported models may change over time. Check your
                        <a href={providerDocsUrl} target="_blank" rel="noopener noreferrer" className="text-brand mx-1 underline">provider documentation</a>
                        for the current list.
                      </p>
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
              <Panel title="Phone Numbers" hint="CARRIER NUMBERS" icon={Phone} scroll>
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
                                className="text-xs bg-black/30 border border-white/10 rounded-lg pl-2.5 pr-7 py-1.5 outline-none focus:border-brand/50 appearance-none cursor-pointer text-ink min-w-[150px]"
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
                        <Plus className="w-3 h-3 text-brand" /> Add carrier number
                      </h4>
                      <button
                        onClick={syncCarrierNumbers}
                        disabled={isSyncing}
                        className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-[0.3em] text-muted/70 hover:text-brand transition-colors"
                      >
                        {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                        Discover
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
                        className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 tabular-nums"
                      />
                      <input
                        type="text"
                        value={newNumberVapiId}
                        onChange={e => setNewNumberVapiId(e.target.value)}
                        placeholder="Wireline number ID"
                        className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono"
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
          ) : (
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
              className="h-full grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-0"
            >
              <Panel title="AI Engine" hint="Claude · Anthropic" icon={Bot} scroll>
                <div className="space-y-4">
                  <div className="rounded-xl glass border border-white/8 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        claudeStatus?.available ? "bg-emerald-500/15 border border-emerald-500/30" : "bg-rose-500/15 border border-rose-500/30"
                      )}>
                        <Zap className={cn("w-4 h-4", claudeStatus?.available ? "text-emerald-400" : "text-rose-400")} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-ink">
                          {claudeStatus?.available ? "Claude Online" : "Claude Offline"}
                        </div>
                        <div className="text-[10px] text-muted uppercase tracking-[0.25em] mt-0.5">
                          {claudeStatus?.model || "claude-opus-4-7"}
                        </div>
                      </div>
                      <div className="ml-auto">
                        {claudeStatus?.available
                          ? <span className="px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] uppercase tracking-[0.25em]">Active</span>
                          : <span className="px-2 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[9px] uppercase tracking-[0.25em]">Offline</span>}
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
                        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="capitalize">{cap.replace(/-/g, ' ')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Panel>
              <Panel title="Platform Health" hint="Wireline Core" icon={ShieldCheck} scroll>
                <div className="space-y-3">
                  {[
                    {
                      label: "AI Engine",
                      desc: "Powers all Wireline AI features",
                      ok: !!claudeStatus?.available,
                      icon: Bot,
                    },
                    {
                      label: "Voice SDK",
                      desc: "Voice browser SDK",
                      ok: !!import.meta.env.VITE_VAPI_PUBLIC_KEY,
                      icon: Wifi,
                    },
                    {
                      label: "VITE_SUPABASE_URL",
                      desc: "Database connection",
                      ok: !!import.meta.env.VITE_SUPABASE_URL,
                      icon: Activity,
                    },
                    {
                      label: "Agents",
                      desc: `${agents.length} of ${settings.max_agents} deployed`,
                      ok: agents.length > 0,
                      icon: Bot,
                    },
                  ].map(item => (
                    <div key={item.label} className="rounded-xl glass border border-white/8 p-3 flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        item.ok ? "bg-emerald-500/15" : "bg-rose-500/15"
                      )}>
                        <item.icon className={cn("w-3.5 h-3.5", item.ok ? "text-emerald-400" : "text-rose-400")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-mono text-ink truncate">{item.label}</div>
                        <div className="text-[10px] text-muted">{item.desc}</div>
                      </div>
                      <span className={cn(
                        "text-[8px] uppercase tracking-[0.25em] shrink-0",
                        item.ok ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {item.ok ? "OK" : "Missing"}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            </motion.div>
          )}
          {activeTab === "activity" && (
            <motion.div
              key="activity"
              id="admin-panel-activity"
              role="tabpanel"
              tabIndex={0}
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
  );
}

/* ──────────────────────────  AI Activity Audit Panel  ─────────────── */

/** Minimum cost denominator to avoid division-by-zero in bar chart scaling. */
const MIN_COST_THRESHOLD = 0.0001;

/** Format an action slug into human-readable display text. */
function formatActionName(action: string): string {
  return action.replace(/-/g, ' ');
}

function AuditActivityPanel() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentLoading, setRecentLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/audit/summary?days=${days}`)
      .then(r => r.json())
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    setRecentLoading(true);
    authFetch("/api/audit/recent?limit=50")
      .then(r => r.json())
      .then(d => setRecent(d.entries || []))
      .finally(() => setRecentLoading(false));
  }, []);

  const totals = summary?.totals ?? {};
  const byAction: any[] = summary?.by_action ?? [];
  const byDay: any[] = summary?.by_day ?? [];
  const byModel: any[] = summary?.by_model ?? [];
  const maxActionCost = Math.max(MIN_COST_THRESHOLD, ...byAction.map((a: any) => Number(a.cost)));

  const windowOpts = [7, 14, 30, 90] as const;

  return (
    <div className="h-full flex flex-col gap-3 overflow-y-auto scrollbar-hide pb-6">
      {/* Window selector */}
      <div className="flex items-center justify-between shrink-0">
        <h3 className="text-[9px] uppercase tracking-[0.4em] text-muted">AI Usage · Last</h3>
        <div className="flex p-0.5 rounded-full glass border border-white/10">
          {windowOpts.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "px-3 py-1 rounded-full text-[9px] uppercase tracking-[0.22em] transition-colors",
                days === d ? "bg-brand/20 text-brand" : "text-muted hover:text-ink"
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div role="status" aria-live="polite" className="flex-1 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-brand" aria-hidden="true" />
          <span className="text-[9px] uppercase tracking-[0.4em] text-muted/70">Loading audit data</span>
        </div>
      ) : (
        <>
          {/* Hero stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
            {[
              { label: "AI Calls",        value: totals.calls ?? 0,                          icon: Activity,    accent: "#7DF9FF" },
              { label: "Total Cost",      value: `$${Number(totals.cost ?? 0).toFixed(4)}`,  icon: DollarSign,  accent: "#C58BFF" },
              { label: "Cache Saved",     value: `$${Number(totals.cache_savings_usd ?? 0).toFixed(4)}`, icon: TrendingUp, accent: "#4DFFC4" },
              { label: "Avg Cost/Call",   value: `$${Number(totals.avg_cost_per_call ?? 0).toFixed(5)}`, icon: BarChart3,  accent: "#FF6BD9" },
            ].map(({ label, value, icon: Icon, accent }) => (
              <div key={label} className="relative rounded-xl glass border border-white/10 p-4 overflow-hidden">
                <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-20 blur-3xl pointer-events-none" style={{ background: `radial-gradient(circle,${accent},transparent)` }} />
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-3 h-3 shrink-0" style={{ color: accent }} />
                  <p className="text-[9px] uppercase tracking-[0.32em] text-muted truncate">{label}</p>
                </div>
                <p className="font-display italic text-xl leading-none tabular-nums" style={{ color: accent }}>{value}</p>
              </div>
            ))}
          </div>

          {/* Daily cost trend + model breakdown */}
          <div className="grid md:grid-cols-2 gap-3 shrink-0">
            {/* Daily trend */}
            <div className="rounded-2xl glass border border-white/10 p-5">
              <h4 className="text-[9px] uppercase tracking-[0.32em] text-muted mb-4 flex items-center gap-1.5">
                <TrendingUp className="w-3 h-3" /> Daily Cost Trend
              </h4>
              {byDay.length > 1 ? (
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={byDay} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                      <defs>
                        <linearGradient id="auditGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#7DF9FF" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#7DF9FF" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="day" tick={{ fill: "#8B89B8", fontSize: 9 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#8B89B8", fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${v.toFixed(3)}`} />
                      <Tooltip
                        contentStyle={{ background: "#0F0E2D", border: "1px solid rgba(125,249,255,0.2)", borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: "#8B89B8" }}
                        itemStyle={{ color: "#7DF9FF" }}
                        formatter={(v: any) => [`$${Number(v).toFixed(4)}`, "Cost"]}
                      />
                      <Area type="monotone" dataKey="cost" stroke="#7DF9FF" strokeWidth={1.5} fill="url(#auditGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-36 flex items-center justify-center text-[10px] text-muted/60">Not enough data yet</div>
              )}
            </div>

            {/* Model breakdown */}
            <div className="rounded-2xl glass border border-white/10 p-5">
              <h4 className="text-[9px] uppercase tracking-[0.32em] text-muted mb-4 flex items-center gap-1.5">
                <Bot className="w-3 h-3" /> Model Usage
              </h4>
              {byModel.length === 0 ? (
                <div className="h-36 flex items-center justify-center text-[10px] text-muted/60">No data yet</div>
              ) : (
                <div className="space-y-2.5">
                  {byModel.map((m: any) => {
                    const maxCost = Math.max(MIN_COST_THRESHOLD, ...byModel.map((x: any) => Number(x.cost)));
                    const pct = (Number(m.cost) / maxCost) * 100;
                    return (
                      <div key={m.model} className="flex items-center gap-3">
                        <span className="text-[9px] font-mono text-muted w-36 shrink-0 truncate">{m.model || "unknown"}</span>
                        <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.7, ease: "easeOut" }}
                            className="h-full rounded-full"
                            style={{ background: "linear-gradient(90deg,#7DF9FF,#C58BFF)" }}
                          />
                        </div>
                        <span className="text-[9px] font-mono text-ink/70 w-16 text-right shrink-0">${Number(m.cost).toFixed(4)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Cost by action */}
          <div className="rounded-2xl glass border border-white/10 p-5 shrink-0">
            <h4 className="text-[9px] uppercase tracking-[0.32em] text-muted mb-4 flex items-center gap-1.5">
              <BarChart3 className="w-3 h-3" /> Cost by Action
            </h4>
            {byAction.length === 0 ? (
              <p className="text-[10px] text-muted/60 text-center py-4">No actions recorded yet</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-2">
                {byAction.map((a: any) => {
                  const pct = (Number(a.cost) / maxActionCost) * 100;
                  return (
                    <div key={a.action} className="flex items-center gap-3">
                      <span className="text-[9px] text-muted w-36 shrink-0 truncate capitalize">{formatActionName(a.action as string)}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.7, ease: "easeOut" }}
                          className="h-full rounded-full"
                          style={{ background: "linear-gradient(90deg,#C58BFF,#FF6BD9)" }}
                        />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[8px] font-mono text-ink/60 tabular-nums">{a.calls}×</span>
                        <span className="text-[9px] font-mono text-ink/80 tabular-nums w-16 text-right">${Number(a.cost).toFixed(4)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent audit log */}
          <div className="rounded-2xl glass border border-white/10 overflow-hidden shrink-0">
            <div className="px-5 py-3 border-b border-white/8 flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-muted" />
              <h4 className="text-[9px] uppercase tracking-[0.32em] text-muted">Recent Activity</h4>
              {recentLoading && <Loader2 className="w-3 h-3 animate-spin text-brand ml-auto" />}
            </div>
            <div className="divide-y divide-white/5 max-h-72 overflow-y-auto scrollbar-hide">
              {recent.length === 0 && !recentLoading ? (
                <div className="px-5 py-6 text-center text-[10px] text-muted/60">No AI activity recorded yet</div>
              ) : (
                recent.map((entry: any, i: number) => (
                  <div key={entry.id ?? i} className="px-5 py-2.5 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                    <div className="min-w-0 flex-1 flex items-center gap-3">
                      <span className="text-[9px] font-mono text-brand/80 shrink-0 capitalize">{formatActionName(entry.action as string || "—")}</span>
                      <span className="text-[8px] text-muted shrink-0 font-mono">{entry.model || "—"}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {entry.latency_ms != null && (
                        <span className="text-[8px] font-mono text-muted/60 tabular-nums flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />{entry.latency_ms}ms
                        </span>
                      )}
                      <span className="text-[9px] font-mono text-ink/70 tabular-nums w-16 text-right">
                        {entry.cost_usd != null ? `$${Number(entry.cost_usd).toFixed(5)}` : "—"}
                      </span>
                      <span className="text-[8px] text-muted/50 tabular-nums w-24 text-right">
                        {entry.created_at ? new Date(entry.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
