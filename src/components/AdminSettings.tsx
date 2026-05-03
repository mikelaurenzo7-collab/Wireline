import { useState, useEffect } from "react";
import { ServerCog, KeyRound, Loader2, ShieldCheck, Phone, Plus, Link as LinkIcon, Save, Terminal, Shield, Zap, Activity, Signal, Globe, CreditCard, Cpu, ChevronRight, RotateCw, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import WebhooksManager from "./WebhooksManager";
import IntakeKeysManager from "./IntakeKeysManager";
import StripeBillingCard from "./StripeBillingCard";

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
  
  const [newNumber, setNewNumber] = useState("");
  const [newNumberVapiId, setNewNumberVapiId] = useState("");

  const [activeTab, setActiveTab] = useState<"carrier" | "subscription">("carrier");

  const [carrierNumbers, setCarrierNumbers] = useState<any[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

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
        setSaveMessage("PLATFORM_SETTINGS_COMMITTED.");
        setTimeout(() => setSaveMessage(""), 3000);
    } catch (e) {
        setSaveMessage("SYNC_FAILURE.");
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
    } catch(e) {
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
     } catch(e) {
        console.error(e);
     }
  }

  return (
    <div className="flex flex-col space-y-12 md:space-y-20 pb-40 max-w-[1700px] mx-auto w-full p-8 md:p-12 lg:p-16">
      <header className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-10 border-b-8 border-ink pb-12">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
             <div className="bg-brand text-ink text-[10px] font-black px-3 py-1 uppercase tracking-widest brutal-border shadow-none italic font-display animate-pulse flex items-center gap-2">
               <ShieldCheck className="w-3 h-3" /> SYSTEM_CORE: SECURED
             </div>
             <div className="flex items-center gap-2 px-3 py-1 bg-ink text-brand brutal-border shadow-none">
                <Globe className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-tighter italic">GATEWAY: GLOBAL_RELAY</span>
             </div>
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-ink uppercase tracking-tighter font-display italic leading-[0.8]">
            PLATFORM<br />CONTROL
          </h1>
          <p className="text-muted font-bold uppercase tracking-[0.4em] text-xs md:text-sm max-w-xl leading-relaxed italic underline decoration-brand decoration-4 underline-offset-[-2px]">
            Master configuration console for carrier credentials, nodal capacity, and global fleet routing parameters.
          </p>
        </div>
        
        <div className="flex flex-col items-end gap-6 w-full lg:w-auto">
           <div className="bg-ink p-2 brutal-border shadow-none flex border-4 border-ink">
              <button 
                onClick={() => setActiveTab("carrier")} 
                className={cn("px-10 py-4 text-[10px] font-black uppercase tracking-[0.3em] transition-all italic", activeTab === "carrier" ? "bg-brand text-ink" : "text-white/40 hover:text-white")}
              >
                CARRIER_NODES
              </button>
              <button 
                onClick={() => setActiveTab("subscription")} 
                className={cn("px-10 py-4 text-[10px] font-black uppercase tracking-[0.3em] transition-all italic", activeTab === "subscription" ? "bg-brand text-ink" : "text-white/40 hover:text-white")}
              >
                BILLING_STATE
              </button>
           </div>
        </div>
      </header>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-48 space-y-8">
           <Loader2 className="w-20 h-20 animate-spin text-brand" />
           <span className="text-[12px] font-black uppercase tracking-[0.8em] text-ink italic animate-pulse">EXTRACTING_SYSTEM_CONFIG...</span>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          {activeTab === "carrier" ? (
            <motion.div 
              key="carrier"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="grid grid-cols-1 xl:grid-cols-2 gap-16 items-start"
            >
              {/* Carrier Config Card */}
              <div className="bg-white brutal-border border-8 p-12 md:p-16 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform">
                   <ServerCog className="w-64 h-64 text-zinc-950" />
                </div>
                
                <header className="flex items-center gap-6 border-b-8 border-ink pb-10 mb-12 relative z-10">
                   <Cpu className="w-10 h-10 text-brand" />
                   <h2 className="text-3xl font-black uppercase tracking-tighter font-display italic leading-none">CARRIER_AUTHENTICATION</h2>
                </header>
                
                <div className="space-y-12 relative z-10">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="p-8 bg-zinc-950 brutal-border border-4 border-brand shadow-none flex flex-col justify-between group h-40">
                      <div className="flex items-center gap-4">
                        <div className="w-3 h-3 bg-brand rounded-full animate-pulse" />
                        <p className="text-[10px] font-black text-white uppercase tracking-[0.4em] italic leading-none mt-1">SECRET_KEY: ENCRYPTED</p>
                      </div>
                      <div className="text-[9px] font-black text-brand uppercase tracking-widest italic border-t border-brand/20 pt-4">MANAGED_BY_SECURE_VAULT</div>
                    </div>

                    <div className={cn(
                      "p-8 brutal-border border-4 shadow-none flex flex-col justify-between h-40 transition-all", 
                      import.meta.env.VITE_VAPI_PUBLIC_KEY ? "bg-emerald-50 border-emerald-500" : "bg-rose-50 border-rose-500"
                    )}>
                      <div className="flex items-center gap-4">
                        <div className={cn("w-3 h-3 rounded-full animate-ping", import.meta.env.VITE_VAPI_PUBLIC_KEY ? "bg-emerald-500" : "bg-rose-500")} />
                        <p className="text-[10px] font-black text-ink uppercase tracking-[0.4em] italic leading-none mt-1">
                          RELAY_STATUS: {import.meta.env.VITE_VAPI_PUBLIC_KEY ? "SYNCHRONIZED" : "KEY_NOT_DETECTED"}
                        </p>
                      </div>
                      <div className="text-[9px] font-black text-muted uppercase tracking-widest italic border-t border-ink/5 pt-4">PUBLIC_GATEWAY_TOKEN_CHECK</div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <label className="text-[10px] font-black text-muted uppercase tracking-[0.5em] block italic ml-1">ROUTING_DESIGNATION (FALLBACK_ID)</label>
                    <input
                      type="text"
                      value={settings.vapi_phone_number_id}
                      onChange={e => setSettings({...settings, vapi_phone_number_id: e.target.value})}
                      className="w-full p-8 brutal-border border-4 outline-none focus:bg-brand font-black text-ink uppercase tracking-widest text-xl bg-paper font-mono h-24 placeholder:text-zinc-100 italic"
                      placeholder="E.G. DEPLOYMENT_HEX_CODE"
                    />
                  </div>

                  {/* ── Voice LLM picker ─────────────────────────────────────── */}
                  <div className="relative aurora-ring rounded-2xl mt-8">
                    <div className="relative rounded-2xl glass border border-white/10 p-6 space-y-5 overflow-hidden">
                      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-25 blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #C58BFF, transparent)" }} />
                      <div className="relative z-10 flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.4em] text-brand">Voice LLM</div>
                          <h4 className="font-display italic text-2xl text-ink leading-tight mt-1">Brain Powering Live Calls</h4>
                          <p className="text-[11px] text-ink/55 mt-1">Vapi runs each voice call through this LLM. Defaults to Gemini Flash; switch to Anthropic to route through Claude.</p>
                        </div>
                      </div>
                      <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {[
                          { v: "google",    label: "Google",    sub: "Gemini",    desc: "Lowest latency, cheapest." },
                          { v: "anthropic", label: "Anthropic", sub: "Claude",    desc: "Best reasoning, more steerable." },
                          { v: "openai",    label: "OpenAI",    sub: "GPT",       desc: "Optional — set the model below." },
                          { v: "groq",      label: "Groq",      sub: "OSS via Groq", desc: "Optional — set the model below." },
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
                              "relative z-10 text-left rounded-xl p-4 transition-all border",
                              settings.voice_llm_provider === p.v
                                ? "bg-brand/10 border-brand/40"
                                : "bg-black/20 border-white/8 hover:border-white/30",
                            )}
                          >
                            <div className="flex items-baseline justify-between mb-1">
                              <span className="text-sm font-medium text-ink">{p.label}</span>
                              <span className="text-[9px] uppercase tracking-[0.3em] text-muted">{p.sub}</span>
                            </div>
                            <p className="text-[11px] text-ink/55 leading-snug">{p.desc}</p>
                          </button>
                        ))}
                      </div>
                      <div className="relative z-10 space-y-2">
                        <label className="text-[10px] uppercase tracking-[0.4em] text-muted">Model ID (must be supported by Vapi for this provider)</label>
                        <input
                          type="text"
                          value={settings.voice_llm_model}
                          onChange={(e) => setSettings({ ...settings, voice_llm_model: e.target.value })}
                          placeholder="e.g. claude-3-5-sonnet-20241022"
                          className="w-full h-12 px-4 rounded-xl bg-black/30 border border-white/10 outline-none text-ink text-sm font-mono placeholder:text-muted/50 focus:border-brand/60 transition-all"
                        />
                        <p className="text-[10px] text-muted/70 leading-relaxed">
                          Vapi's supported models change over time — check
                          <a href="https://docs.vapi.ai/customization/multilingual/customize-models" target="_blank" rel="noopener noreferrer" className="text-brand mx-1 underline">Vapi docs</a>
                          for the current list. Saves apply to all subsequent voice calls.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ── Outbound webhooks ──────────────────────────────────── */}
                  <WebhooksManager />

                  {/* ── Inbound lead intake API ─────────────────────────────── */}
                  <IntakeKeysManager />

                  <div className="pt-12 border-t-4 border-ink flex flex-col md:flex-row items-center justify-between gap-8">
                      <button
                        onClick={saveSettings}
                        disabled={isSaving}
                        className="brutal-btn !bg-ink !text-brand !py-6 !px-12 flex items-center gap-6 active:translate-x-1 active:translate-y-1 active:shadow-none text-sm uppercase font-black tracking-[0.3em] italic hover:shadow-none transition-all w-full md:w-auto"
                      >
                        {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : <KeyRound className="w-6 h-6" />}
                        COMMIT_CHANGES
                      </button>
                      <AnimatePresence>
                        {saveMessage && (
                          <motion.span 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.4em] italic pr-4"
                          >
                            <span className="bg-emerald-500 text-white px-3 py-1 brutal-border border-2 shadow-none mr-3">SUCCESS</span> {saveMessage}
                          </motion.span>
                        )}
                      </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Carrier Hub & Routing */}
              <div className="bg-white brutal-border border-8 p-12 md:p-16 border-ink relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform">
                   <Globe className="w-64 h-64 text-zinc-950" />
                </div>

                <header className="flex items-center gap-6 border-b-8 border-ink pb-10 mb-12 relative z-10">
                   <Phone className="w-10 h-10 text-brand fill-ink" />
                   <h2 className="text-3xl font-black uppercase tracking-tighter font-display italic leading-none">NODAL_HUB_ROUTING</h2>
                </header>
                
                <div className="space-y-12 relative z-10">
                   {phoneNumbers.length === 0 ? (
                      <div className="p-20 text-center text-muted font-black text-xs uppercase tracking-[0.5em] italic bg-paper brutal-border border-4 border-dashed shadow-none">ZERO_ACTIVE_LINES_IDENTIFIED.</div>
                   ) : (
                      <div className="space-y-8 max-h-[400px] overflow-y-auto pr-8 scrollbar-hide">
                         {phoneNumbers.map(pt => (
                            <motion.div 
                              layout
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              key={pt.id} 
                              className="p-8 brutal-border border-4 shadow-none bg-paper flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8 group/item hover:bg-white transition-all border-zinc-200 hover:border-ink"
                            >
                               <div className="space-y-2">
                                  <div className="font-black text-3xl text-ink font-display tracking-tighter italic leading-none group-hover/item:translate-x-2 transition-transform">{pt.phone_number}</div>
                                  <div className="text-[10px] font-black text-muted uppercase tracking-[0.4em] italic opacity-40">SIGNAL_ID: {pt.vapi_number_id?.substring(0,16).toUpperCase()}</div>
                               </div>
                               <div className="flex items-center gap-6 w-full xl:w-auto">
                                  <div className="bg-ink p-3 brutal-border border-2 shadow-none"><LinkIcon className="w-5 h-5 text-brand shrink-0" /></div>
                                  <div className="relative flex-1">
                                    <select 
                                       value={pt.agent_id || ""}
                                       onChange={(e) => updateNumberAgent(pt.id, e.target.value)}
                                       className="w-full xl:w-48 p-4 brutal-border border-4 font-black uppercase text-[10px] tracking-widest outline-none hover:bg-brand cursor-pointer shadow-none focus:bg-brand bg-white h-14 appearance-none italic"
                                    >
                                       <option value="">UNASSIGNED_MODE</option>
                                       {agents.filter(a => a.channel === 'voice' || a.channel === 'omnichannel' || !a.channel).map(a => (
                                           <option key={a.id} value={a.id}>{a.name.toUpperCase()}</option>
                                       ))}
                                    </select>
                                    <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-ink pointer-events-none rotate-90" />
                                  </div>
                               </div>
                            </motion.div>
                         ))}
                      </div>
                   )}
                   
                   <div className="p-10 border-t-8 border-ink bg-zinc-50 brutal-border border-4 shadow-none">
                      <header className="flex flex-col md:flex-row items-center justify-between gap-6 mb-10">
                          <h3 className="text-[11px] font-black uppercase tracking-[0.5em] text-ink italic leading-none flex items-center gap-4">
                            <Plus className="w-5 h-5 text-brand fill-ink" /> INJECT_NEW_CARRIER_NODE
                          </h3>
                          <button 
                            onClick={syncCarrierNumbers}
                            disabled={isSyncing}
                            className="w-full md:w-auto brutal-btn !bg-ink !text-brand !py-2 !px-6 text-[10px] uppercase font-black italic tracking-widest shadow-none flex items-center justify-center gap-4 active:scale-95 transition-all"
                          >
                             {isSyncing ? <Loader2 className="w-4 h-4 animate-spin text-brand" /> : <RotateCw className="w-4 h-4" style={{ animation: isSyncing ? 'spin 1s linear infinite' : 'none' }} />}
                             DISCOVER_ACTIVE_VECTOR_SIGNALS
                          </button>
                      </header>

                      <AnimatePresence>
                        {carrierNumbers.length > 0 && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="mb-10 space-y-4 max-h-[300px] overflow-y-auto pr-4 scrollbar-hide border-b-4 border-dashed border-ink/10 pb-8"
                            >
                               {carrierNumbers.map(cn => (
                                  <button 
                                    key={cn.id}
                                    onClick={() => {
                                      setNewNumber(cn.number);
                                      setNewNumberVapiId(cn.id);
                                    }}
                                    className="w-full p-6 bg-white brutal-border border-2 shadow-none flex justify-between items-center group hover:bg-brand transition-all text-xs font-black italic text-ink"
                                  >
                                     <span className="font-mono tracking-tighter flex items-center gap-4">
                                       <Signal className="w-4 h-4 text-ink/20 group-hover:text-ink/60" /> {cn.number}
                                     </span>
                                     <div className="flex items-center gap-6">
                                        <span className="text-[8px] text-muted group-hover:text-ink/40 uppercase tracking-[0.2em] font-mono">VECTOR_HEX_{cn.id.substring(0,8).toUpperCase()}</span>
                                        <div className="w-8 h-8 brutal-border border-2 bg-ink text-brand flex items-center justify-center shadow-none group-hover:bg-white group-hover:text-ink transition-all"><Plus className="w-4 h-4" /></div>
                                     </div>
                                  </button>
                               ))}
                            </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                         <div className="space-y-4">
                            <label className="text-[9px] font-black text-muted uppercase tracking-[0.4em] italic ml-1">CARRIER_NUMBER</label>
                            <input 
                              type="tel" 
                              value={newNumber}
                              onChange={e => setNewNumber(e.target.value)}
                              placeholder="+1 800 555 0100" 
                              className="w-full p-6 brutal-border border-4 text-sm font-black uppercase tracking-widest shadow-none focus:bg-brand outline-none h-16 italic font-display bg-white" 
                            />
                         </div>
                         <div className="space-y-4">
                            <label className="text-[9px] font-black text-muted uppercase tracking-[0.4em] italic ml-1">VECTOR_SYSTEM_ID</label>
                            <input 
                              type="text" 
                              value={newNumberVapiId}
                              onChange={e => setNewNumberVapiId(e.target.value)}
                              placeholder="e.g. 3c7a9f..." 
                              className="w-full p-6 brutal-border border-4 text-sm font-black uppercase tracking-widest shadow-none focus:bg-brand outline-none h-16 italic font-display bg-white" 
                            />
                         </div>
                      </div>
                      <button 
                         onClick={addPhoneNumber}
                         disabled={!newNumber || !newNumberVapiId}
                         className="brutal-btn !bg-ink !text-brand !py-6 w-full flex justify-center items-center gap-6 active:translate-x-1 active:translate-y-1 hover:shadow-none disabled:opacity-30 text-xs font-black uppercase tracking-[0.4em] italic border-4"
                      >
                         <Shield className="w-6 h-6" /> REGISTER_TO_FLEET_CORE
                      </button>
                   </div>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="subscription"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 xl:grid-cols-12 gap-16 items-start"
            >
              {/* ── Real Stripe billing — checkout, portal, plan picker ── */}
              <div className="xl:col-span-12">
                <StripeBillingCard />
              </div>

              {/* Billing Simulator Card */}
              <div className="xl:col-span-12 bg-white brutal-border border-8 p-12 md:p-16 relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none group-hover:rotate-6 transition-transform">
                   <CreditCard className="w-64 h-64 text-zinc-950" />
                </div>
                
                <header className="flex items-center gap-6 border-b-8 border-ink pb-10 mb-12 relative z-10">
                   <Activity className="w-10 h-10 text-rose-500 fill-ink" />
                   <h2 className="text-3xl font-black uppercase tracking-tighter font-display italic leading-none">TACTICAL_BILLING_SIMULATOR</h2>
                </header>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 relative z-10">
                  <div className="space-y-12">
                    <div className="p-10 bg-rose-50 brutal-border border-8 border-rose-500 shadow-none relative">
                       <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-12 h-12 bg-rose-500 rounded-full flex items-center justify-center text-white brutal-border border-4 shadow-none italic font-black">!</div>
                       <label className="block text-[11px] font-black text-rose-950 uppercase tracking-[0.5em] mb-8 italic">SUBSCRIPTION_OPERATIONAL_STATE</label>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <button 
                            onClick={() => setSettings({...settings, subscription_status: 'active'})}
                            className={cn(
                              "h-24 brutal-border border-4 font-black uppercase text-xs tracking-[0.3em] transition-all italic flex items-center justify-center gap-4", 
                              settings.subscription_status === 'active' ? "bg-emerald-500 text-white  -translate-x-1 -translate-y-1" : "bg-white text-muted/20 border-zinc-100 shadow-none grayscale"
                            )}
                          >
                             {settings.subscription_status === 'active' && <CheckCircle2 className="w-6 h-6" />}
                             ACTIVE_DEPLOYMENT
                          </button>
                          <button 
                            onClick={() => setSettings({...settings, subscription_status: 'past_due'})}
                            className={cn(
                              "h-24 brutal-border border-4 font-black uppercase text-xs tracking-[0.3em] transition-all italic flex items-center justify-center gap-4", 
                              settings.subscription_status === 'past_due' ? "bg-rose-500 text-white  -translate-x-1 -translate-y-1" : "bg-white text-muted/20 border-zinc-100 shadow-none grayscale"
                            )}
                          >
                             {settings.subscription_status === 'past_due' && <Activity className="w-6 h-6 animate-pulse" />}
                             SUSPENDED_RELAY
                          </button>
                       </div>
                       <p className="text-[10px] font-black text-rose-700 mt-8 uppercase tracking-[0.3em] italic leading-relaxed underline decoration-rose-500 decoration-4">
                         WARNING: SUSPENSION_TRIGGERS_GLOBAL_NODAL_LOCKOUT_PROCEDURES.
                       </p>
                    </div>

                    <div className="p-10 bg-zinc-50 brutal-border border-8 border-ink shadow-none">
                       <label className="block text-[11px] font-black text-ink uppercase tracking-[0.5em] mb-10 italic">FLEET_NODE_CAPACITY (MAX_AGENTS)</label>
                       <div className="flex items-center gap-10">
                          <div className="flex-1 space-y-4">
                            <input 
                               type="range" 
                               min="1" 
                               max="20" 
                               value={settings.max_agents} 
                               onChange={e => setSettings({...settings, max_agents: parseInt(e.target.value)})}
                               className="w-full accent-ink h-4 rounded-none bg-zinc-200 appearance-none cursor-pointer border-4 border-ink"
                            />
                            <div className="flex justify-between text-[9px] font-black text-muted tracking-widest uppercase italic">
                               <span>STARTER_BASE</span>
                               <span>ENTERPRISE_CORE</span>
                            </div>
                          </div>
                          <div className="w-24 h-24 brutal-border border-8 bg-ink text-brand flex items-center justify-center font-black text-4xl font-display italic">{settings.max_agents}</div>
                       </div>
                    </div>

                    <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-8">
                       <button 
                          onClick={saveSettings} 
                          disabled={isSaving}
                          className="brutal-btn !bg-ink !text-brand !py-8 !px-16 flex items-center gap-6 active:translate-x-1 active:translate-y-1 active:shadow-none text-sm uppercase font-black tracking-[0.4em] italic hover:shadow-none transition-all w-full md:w-auto border-4"
                       >
                          {isSaving ? <Loader2 className="w-8 h-8 animate-spin" /> : <Save className="w-8 h-8" />}
                          COMMIT_BILLING_PROTOCOL
                       </button>
                    </div>
                  </div>

                  <div className="p-10 md:p-14 bg-zinc-950 text-white border-8 border-brand brutal-border relative overflow-hidden flex flex-col justify-between group h-max">
                      <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none group-hover:rotate-12 transition-transform">
                         <Terminal className="w-64 h-64 text-brand" />
                      </div>
                      <div className="space-y-10 relative z-10">
                        <h4 className="text-xl font-black text-brand uppercase tracking-[0.4em] mb-12 border-b-4 border-brand/20 pb-4 italic">DEVELOPER_OPERATIONS_TERMINAL</h4>
                        <div className="space-y-8 font-mono text-[10px] md:text-xs text-white/50 leading-loose uppercase">
                           <p className="flex justify-between border-b-2 border-white/5 pb-4">
                               <span className="flex items-center gap-3"><ChevronRight className="w-4 h-4 text-brand" /> CORE_VERSION:</span>
                               <span className="text-white font-black italic">v2.0.4-TACTICAL</span>
                           </p>
                           <p className="flex justify-between border-b-2 border-white/5 pb-4">
                               <span className="flex items-center gap-3"><ChevronRight className="w-4 h-4 text-brand" /> OPERATIONAL_STAT:</span>
                               <span className={cn("font-black italic px-4 py-1 brutal-border border-2 shadow-none", settings.subscription_status === 'active' ? "text-emerald-400 border-emerald-400" : "text-rose-400 border-rose-400")}>
                                 {settings.subscription_status?.toUpperCase()}
                               </span>
                           </p>
                           <p className="flex justify-between border-b-2 border-white/5 pb-4">
                               <span className="flex items-center gap-3"><ChevronRight className="w-4 h-4 text-brand" /> DEPLOYED_ASSETS:</span>
                               <span className="text-white font-black italic underline decoration-brand decoration-2">{agents.length} NODES</span>
                           </p>
                           <p className="flex justify-between border-b-2 border-white/5 pb-4">
                               <span className="flex items-center gap-3"><ChevronRight className="w-4 h-4 text-brand" /> AVAILABLE_QUOTA:</span>
                               <span className="text-brand font-black italic">{Math.max(0, settings.max_agents - agents.length)} RELAY_SLOTS</span>
                           </p>
                        </div>
                        <div className="mt-12 p-8 bg-brand/5 brutal-border border-4 border-brand/20 italic text-[10px] tracking-[0.3em] leading-loose text-white/40 uppercase font-bold">
                           CHANGING_OPERATIONAL_STATES_WILL_IMMEDIATELY_AFFECT_THE_FLEET'S_ABILITY_TO_INITIALIZE_THREADS_VIA_CARRIER_WEBHOOKS_AND_REST_APIS.
                        </div>
                      </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
