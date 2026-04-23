import { useState, useEffect } from "react";
import { ServerCog, KeyRound, Loader2, ShieldCheck, Phone, Plus, Link as LinkIcon, Save } from "lucide-react";
import { cn } from "../lib/utils";

export default function AdminSettings() {
  const [settings, setSettings] = useState({ vapi_phone_number_id: "", subscription_status: "active", max_agents: 3 });
  const [agents, setAgents] = useState<any[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  
  const [newNumber, setNewNumber] = useState("");
  const [newNumberVapiId, setNewNumberVapiId] = useState("");

  const [activeTab, setActiveTab] = useState<"carrier" | "subscription">("carrier");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [settingsRes, agentsRes, numbersRes] = await Promise.all([
         fetch("/api/settings").then(r => r.json()),
         fetch("/api/agents").then(r => r.json()),
         fetch("/api/phone-numbers").then(r => r.json()).catch(() => ({ numbers: [] }))
      ]);
      
      if (settingsRes) {
         setSettings({ 
             vapi_phone_number_id: settingsRes.vapi_phone_number_id || "",
             subscription_status: settingsRes.subscription_status || "active",
             max_agents: settingsRes.max_agents || 3
         });
      }
      setAgents(agentsRes.agents || []);
      setPhoneNumbers(numbersRes.numbers || []);
    } catch (e) {
      console.error(e);
    }
    setIsLoading(false);
  };

  const saveSettings = async () => {
    setIsSaving(true);
    setSaveMessage("");
    try {
        await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings)
        });
        setSaveMessage("Platform settings saved successfully.");
        setTimeout(() => setSaveMessage(""), 3000);
    } catch (e) {
        setSaveMessage("Error saving settings.");
    }
    setIsSaving(false);
  };
  
  const addPhoneNumber = async () => {
    if (!newNumber || !newNumberVapiId) return;
    try {
       await fetch("/api/phone-numbers", {
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
        await fetch(`/api/phone-numbers/${id}`, {
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
    <div className="flex flex-col min-h-full bg-white space-y-6 md:space-y-8 pb-32 max-w-7xl mx-auto w-full p-4 md:p-8 lg:p-10">
      <header className="border-b-8 border-ink pb-6 md:pb-8 relative flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
         <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-brand text-ink text-[10px] font-black px-2 py-0.5 uppercase tracking-widest brutal-border shadow-none italic font-display animate-pulse">SYSTEM CORE</span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-ink text-brand brutal-border shadow-none">
                 <ShieldCheck className="w-2.5 h-2.5" />
                 <span className="text-[8px] font-black uppercase tracking-tighter italic">Fleet Operations</span>
              </div>
           </div>
           <h1 className="text-4xl md:text-7xl font-black text-ink uppercase tracking-tight font-display italic leading-none">
             Platform Console
           </h1>
         </div>
         <div className="flex flex-col gap-4 lg:text-right">
            <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px] max-w-xs leading-relaxed">Configure carrier credentials and global fleet routing parameters.</p>
            <div className="flex bg-ink p-1 brutal-border shadow-none">
                <button 
                  onClick={() => setActiveTab("carrier")} 
                  className={cn("px-4 py-2 text-[8px] font-black uppercase tracking-widest transition-all italic", activeTab === "carrier" ? "bg-brand text-ink" : "text-white/40 hover:text-white")}
                >
                  CARRIER CONFIG
                </button>
                <button 
                  onClick={() => setActiveTab("subscription")} 
                  className={cn("px-4 py-2 text-[8px] font-black uppercase tracking-widest transition-all italic", activeTab === "subscription" ? "bg-brand text-ink" : "text-white/40 hover:text-white")}
                >
                  BILLING STATE
                </button>
            </div>
         </div>
      </header>

      {isLoading ? (
        <div className="flex justify-center p-24 text-center"><Loader2 className="w-12 h-12 animate-spin text-brand" /></div>
      ) : activeTab === "carrier" ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-white brutal-border p-6 md:p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex items-center gap-4 text-ink mb-8 border-b-4 border-ink pb-4">
                 <ServerCog className="w-6 h-6 text-brand" />
                 <h2 className="text-xl font-black uppercase font-display italic">Carrier Configuration</h2>
              </div>
              
              <div className="space-y-8">
                <div className="p-4 bg-zinc-950 brutal-border border-brand shadow-none flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-brand" />
                    <div>
                      <p className="text-[10px] font-black text-white uppercase tracking-widest italic leading-none mb-1">Carrier Key: Encrypted</p>
                      <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Managed via Platform Environment</p>
                    </div>
                  </div>
                  <div className="px-2 py-1 bg-brand text-ink text-[7px] font-black uppercase tracking-widest animate-pulse">Protected</div>
                </div>

                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] mb-3 italic">Routing ID (Fallback)</label>
                  <input 
                    type="text" 
                    value={settings.vapi_phone_number_id} 
                    onChange={e => setSettings({...settings, vapi_phone_number_id: e.target.value})} 
                    className="w-full p-4 brutal-border outline-none focus:bg-brand font-black text-ink uppercase tracking-widest text-[10px] bg-zinc-50 shadow-none font-mono h-12" 
                    placeholder="E.G. 1BD8DF4A-..." 
                  />
                </div>
                
                <div className="pt-6 border-t-2 border-ink/10 flex items-center justify-between">
                    <button 
                      onClick={saveSettings} 
                      disabled={isSaving}
                      className="brutal-btn !bg-ink !text-brand !py-3 !px-8 flex items-center gap-3 active:translate-x-1 active:translate-y-1 active:shadow-none text-[10px] uppercase font-black tracking-widest italic"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                      SAVE SETTINGS
                    </button>
                    {saveMessage && <span className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.2em] italic pr-4">{saveMessage}</span>}
                </div>
              </div>
            </div>

            <div className="bg-white brutal-border p-6 md:p-8 shadow-[6px_6px_0px_0px_rgba(250,204,21,1)] border-brand">
              <div className="flex items-center gap-4 text-ink mb-8 border-b-4 border-ink pb-4">
                 <Phone className="w-6 h-6 text-brand" />
                 <h2 className="text-xl font-black uppercase font-display italic">Carrier Hub & Routing</h2>
              </div>
              
              <div className="space-y-6">
                 {phoneNumbers.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 font-bold text-[8px] uppercase tracking-widest italic bg-zinc-50 brutal-border shadow-none">No active lines identified.</div>
                 ) : (
                    <div className="space-y-3 pb-4">
                       {phoneNumbers.map(pt => (
                           <div key={pt.id} className="p-4 brutal-border shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                               <div>
                                  <div className="font-black text-base text-ink font-display tracking-tight italic">{pt.phone_number}</div>
                                  <div className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em]">PID_{pt.vapi_number_id?.substring(0,8)}</div>
                               </div>
                               <div className="flex items-center gap-3 w-full md:w-auto">
                                  <LinkIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                  <select 
                                     value={pt.agent_id || ""}
                                     onChange={(e) => updateNumberAgent(pt.id, e.target.value)}
                                     className="w-full md:w-32 p-1.5 brutal-border font-black uppercase text-[8px] outline-none hover:bg-brand cursor-pointer shadow-none focus:bg-brand bg-zinc-50"
                                  >
                                     <option value="">UNASSIGNED</option>
                                     {agents.filter(a => a.channel === 'voice' || a.channel === 'omnichannel' || !a.channel).map(a => (
                                         <option key={a.id} value={a.id}>{a.name.toUpperCase()}</option>
                                     ))}
                                  </select>
                               </div>
                           </div>
                       ))}
                    </div>
                 )}
                 
                 <div className="pt-6 border-t border-dashed border-ink/20">
                    <h3 className="text-[9px] font-black uppercase tracking-widest text-ink mb-3 italic">Register New Line</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                       <input 
                         type="text" 
                         value={newNumber}
                         onChange={e => setNewNumber(e.target.value)}
                         placeholder="+1 555 123 4567" 
                         className="p-3 brutal-border text-[10px] font-bold uppercase shadow-none focus:bg-brand outline-none h-11" 
                       />
                       <input 
                         type="text" 
                         value={newNumberVapiId}
                         onChange={e => setNewNumberVapiId(e.target.value)}
                         placeholder="PROVIDER NUMBER ID" 
                         className="p-3 brutal-border text-[10px] font-bold uppercase shadow-none focus:bg-brand outline-none h-11" 
                       />
                    </div>
                    <button 
                       onClick={addPhoneNumber}
                       disabled={!newNumber || !newNumberVapiId}
                       className="brutal-btn !bg-ink !text-white !py-2.5 w-full flex justify-center items-center gap-2 active:translate-x-1 active:translate-y-1 active:shadow-none disabled:opacity-50 text-[10px] font-black uppercase italic"
                    >
                       <Plus className="w-3 h-3" /> ADD TO HUB
                    </button>
                 </div>
              </div>
            </div>
        </div>
      ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-white brutal-border p-6 md:p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] border-rose-500">
               <div className="flex items-center gap-4 text-ink mb-8 border-b-4 border-ink pb-4">
                  <ShieldCheck className="w-6 h-6 text-rose-500" />
                  <h2 className="text-xl font-black uppercase font-display italic">Tactical Billing Simulator</h2>
               </div>
               
               <div className="space-y-10">
                  <div className="p-6 bg-rose-50 brutal-border border-rose-200">
                     <label className="block text-[10px] font-black text-rose-950 uppercase tracking-[0.3em] mb-4 italic">SUBSCRIPTION STATE</label>
                     <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => setSettings({...settings, subscription_status: 'active'})}
                          className={cn("p-4 brutal-border font-black uppercase text-[10px] transition-all", settings.subscription_status === 'active' ? "bg-emerald-500 text-white shadow-none" : "bg-white text-slate-300 opacity-50")}
                        >
                           ACTIVE
                        </button>
                        <button 
                          onClick={() => setSettings({...settings, subscription_status: 'past_due'})}
                          className={cn("p-4 brutal-border font-black uppercase text-[10px] transition-all", settings.subscription_status === 'past_due' ? "bg-rose-500 text-white shadow-none" : "bg-white text-slate-300 opacity-50")}
                        >
                           SUSPENDED
                        </button>
                     </div>
                     <p className="text-[8px] font-bold text-rose-700 mt-4 uppercase tracking-widest italic">Suspension triggers global fleet lockdown.</p>
                  </div>

                  <div className="p-6 bg-zinc-50 brutal-border border-zinc-200">
                     <label className="block text-[10px] font-black text-ink uppercase tracking-[0.3em] mb-4 italic">FLEET CAPACITY LIMIT</label>
                     <div className="flex items-center gap-6">
                        <input 
                           type="range" 
                           min="1" 
                           max="10" 
                           value={settings.max_agents} 
                           onChange={e => setSettings({...settings, max_agents: parseInt(e.target.value)})}
                           className="flex-1 accent-ink h-2 rounded-none bg-zinc-200 appearance-none cursor-pointer"
                        />
                        <div className="w-16 h-16 brutal-border bg-ink text-brand flex items-center justify-center font-black text-2xl font-display shadow-none">{settings.max_agents}</div>
                     </div>
                     <div className="flex justify-between mt-4">
                        <span className="text-[8px] font-black text-slate-400">STARTER</span>
                        <span className="text-[8px] font-black text-slate-400">ENTERPRISE</span>
                     </div>
                  </div>

                  <div className="pt-6 border-t-2 border-ink/10 flex items-center justify-between">
                     <button 
                        onClick={saveSettings} 
                        disabled={isSaving}
                        className="brutal-btn !bg-ink !text-brand !py-3 !px-8 flex items-center gap-3 active:translate-x-1 active:translate-y-1 active:shadow-none text-[10px] uppercase font-black tracking-widest italic"
                     >
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        UPDATE BILLING STATE
                     </button>
                  </div>
               </div>
            </div>

            <div className="p-8 md:p-12 bg-zinc-950 text-white border-2 border-brand brutal-border shadow-none">
                <h4 className="text-xs font-black text-brand uppercase tracking-[0.3em] mb-6 italic">Developer Terminal</h4>
                <div className="space-y-4 font-mono text-[9px] text-white/60 leading-relaxed uppercase">
                   <p className="flex justify-between border-b border-white/5 pb-2">
                       <span>Subscription ID:</span>
                       <span className="text-brand">WR_SIM_9X22</span>
                   </p>
                   <p className="flex justify-between border-b border-white/5 pb-2">
                       <span>Operational Status:</span>
                       <span className={settings.subscription_status === 'active' ? "text-emerald-400" : "text-rose-400"}>{settings.subscription_status?.toUpperCase()}</span>
                   </p>
                   <p className="flex justify-between border-b border-white/5 pb-2">
                       <span>Total Deployed:</span>
                       <span className="text-white">{agents.length} AGENTS</span>
                   </p>
                   <p className="flex justify-between border-b border-white/5 pb-2">
                       <span>Remaining Quota:</span>
                       <span className="text-white">{Math.max(0, settings.max_agents - agents.length)} NODES</span>
                   </p>
                </div>
                <div className="mt-8 p-4 bg-white/5 brutal-border border-white/10 italic text-[8px] tracking-[0.2em] leading-loose text-white/40">
                   Changing billing states will immediately affect the fleet's ability to initialize signals via carrier webhooks.
                </div>
            </div>
         </div>
      )}
    </div>
  );
}
