import { useState, useEffect } from "react";
import { ServerCog, KeyRound, Loader2, Phone, Plus, Link as LinkIcon, Save, ChevronRight, RotateCw, CheckCircle2, Trash2, AlertTriangle, Cpu, CreditCard, Activity } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import WebhooksManager from "./WebhooksManager";
import IntakeKeysManager from "./IntakeKeysManager";
import StripeBillingCard from "./StripeBillingCard";
import PageShell, { Panel } from "./PageShell";

export default function AdminSettings() {
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
  const [saveMessage, setSaveMessage] = useState("");
  const [isDeletingNumber, setIsDeletingNumber] = useState<number | string | null>(null);

  const [newNumber, setNewNumber] = useState("");
  const [newNumberVapiId, setNewNumberVapiId] = useState("");

  const [activeTab, setActiveTab] = useState<"carrier" | "subscription">("carrier");

  const [carrierNumbers, setCarrierNumbers] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => { fetchData(); }, []);

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
    setSaveMessage("");
    try {
      await authFetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      setSaveMessage("Settings saved.");
      setTimeout(() => setSaveMessage(""), 3000);
    } catch (e) {
      setSaveMessage("Save failed.");
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
    } catch (e) {
      console.error(e);
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
    <div className="flex p-1 rounded-full glass border border-white/10">
      {(["carrier", "subscription"] as const).map(t => (
        <button
          key={t}
          onClick={() => setActiveTab(t)}
          className={cn(
            "px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.25em] transition-colors",
            activeTab === t ? "bg-brand/20 text-brand" : "text-muted hover:text-ink"
          )}
        >
          {t === "carrier" ? "Carrier" : "Billing"}
        </button>
      ))}
    </div>
  );

  return (
    <PageShell
      title="Platform Settings"
      eyebrow="Admin · Configuration"
      subtitle="Carrier credentials, capacity, and routing parameters."
      actions={tabSwitcher}
    >
      {isLoading ? (
        <div className="h-full flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-brand" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-muted/70">Loading settings</span>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {activeTab === "carrier" ? (
            <motion.div
              key="carrier"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-full grid grid-cols-1 xl:grid-cols-2 gap-3 min-h-0"
            >
              {/* Carrier authentication */}
              <Panel title="carrier authentication" hint="VAPI" icon={Cpu} scroll>
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
                    <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Fallback Vapi number ID</label>
                    <input
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
                        Vapi runs each voice call through this LLM. Defaults to Gemini Flash.
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
                      <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Model ID</label>
                      <input
                        type="text"
                        value={settings.voice_llm_model}
                        onChange={(e) => setSettings({ ...settings, voice_llm_model: e.target.value })}
                        placeholder="e.g. claude-3-5-sonnet-20241022"
                        className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 font-mono"
                      />
                      <p className="text-[10px] text-muted/70 leading-relaxed">
                        Vapi's supported models change — check the
                        <a href="https://docs.vapi.ai/customization/multilingual/customize-models" target="_blank" rel="noopener noreferrer" className="text-brand mx-1 underline">Vapi docs</a>
                        for the current list.
                      </p>
                    </div>
                  </div>

                  {/* Outbound webhooks + intake keys */}
                  <WebhooksManager />
                  <IntakeKeysManager />

                  <div className="pt-3 border-t border-white/8 flex items-center justify-between gap-3">
                    <button
                      onClick={saveSettings}
                      disabled={isSaving}
                      className="brutal-btn !py-2.5 !px-5 !text-[11px] !tracking-[0.3em] disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                      Save settings
                    </button>
                    <AnimatePresence>
                      {saveMessage && (
                        <motion.span
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-[10px] uppercase tracking-[0.25em]"
                        >
                          <CheckCircle2 className="w-3 h-3" /> {saveMessage}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </Panel>

              {/* Hub & routing */}
              <Panel title="hub routing" hint="CARRIER NUMBERS" icon={Phone} scroll>
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
                              title="Remove carrier number"
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
                        placeholder="Vapi number ID"
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
        </AnimatePresence>
      )}
    </PageShell>
  );
}
