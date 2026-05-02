import { useState, useEffect } from "react";
import { Users, Plus, Phone, Bot, Save, Loader2, Link as LinkIcon, Copy, Trash2, Megaphone, Mail, Pencil, Sparkles, Terminal, ChevronRight, Zap, Target, Radio, Settings2, Shield } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";

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

export default function FleetSettings() {
  const [agents, setAgents] = useState<any[]>([]);
  const [subscription, setSubscription] = useState<{ status: string, max_agents: number }>({ status: 'active', max_agents: 3 });
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentId, setNewAgentId] = useState("");
  const [newAgentChannel, setNewAgentChannel] = useState("voice");
  const [selectedAgent, setSelectedAgent] = useState<any | null>(null);
  
  const [isConfigLoading, setIsConfigLoading] = useState(false);
  const [agentConfig, setAgentConfig] = useState<any>({ personality: "", directives: [], knowledge: [] });

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
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  useEffect(() => {
    if (selectedAgent) fetchAgentConfig(selectedAgent.id);
  }, [selectedAgent?.id]);

  const fetchAgentConfig = async (id: string) => {
    setIsConfigLoading(true);
    try {
       const res = await authFetch(`/api/agent-config/${id}`);
       const data = await res.json();
       setAgentConfig(data);
    } catch (e) {
      console.error(e);
    }
    setIsConfigLoading(false);
  };

  const handleCreateAgent = async () => {
    if (!newAgentName || !newAgentId) return;
    
    if (subscription.status !== 'active') {
      alert("Deployment suspended. Account subscription billing required.");
      return;
    }
    
    if (agents.length >= subscription.max_agents) {
      alert(`Fleet capacity reached (${subscription.max_agents} agents). Upgrade plan to deploy more.`);
      return;
    }

    setIsCreating(true);
    try {
      const resp = await authFetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: newAgentId, name: newAgentName, channel: newAgentChannel })
      });
      const data = await resp.json();
      
      if (resp.status === 403) {
         alert(data.error || "Access Denied. Please upgrade your plan.");
      } else {
         setNewAgentName("");
         setNewAgentId("");
         await fetchAgents();
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred. Please try again.");
    }
    setIsCreating(false);
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
    await authFetch(`/api/agent-config/${selectedAgent.id}/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "personality", content: val })
    });
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
        }
    } catch (e) {
        console.error(e);
    }
    setIsSavingEntry(false);
  };

  const deleteRule = async (type: string, rowId: string) => {
    await authFetch(`/api/agent-config/${selectedAgent.id}/${type}/${rowId}`, { method: "DELETE" });
    fetchAgentConfig(selectedAgent.id);
  };

  return (
    <div className="h-full flex flex-col md:flex-row bg-paper">
      
      {/* Sidebar: Agents List */}
      <aside className="w-full md:w-[450px] border-b-8 md:border-b-0 md:border-r-8 border-ink bg-white h-auto md:h-full flex flex-col shrink-0">
        <div className="p-10 md:p-14 border-b-8 border-ink bg-brand relative overflow-hidden group">
           <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none group-hover:rotate-12 transition-transform">
              <Users className="w-32 h-32 text-ink" />
           </div>
           <div className="flex items-center gap-3 mb-6 relative z-10">
              <span className="bg-ink text-brand text-[10px] font-black px-3 py-1 uppercase tracking-[0.3em] italic brutal-border shadow-none">ASSET INVENTORY</span>
           </div>
           <h2 className="text-3xl md:text-5xl font-black text-ink uppercase tracking-tighter font-display italic leading-none flex items-center gap-6 relative z-10">
             <Shield className="w-10 h-10 fill-ink" />
             FLEET NODES
           </h2>
        </div>
        
        <div className="p-8 md:p-10 flex-1 overflow-y-auto space-y-6 scrollbar-hide">
           <AnimatePresence mode="popLayout">
             {isLoading ? (
               <div className="flex flex-col items-center justify-center p-20 space-y-6">
                  <Loader2 className="w-12 h-12 animate-spin text-brand" />
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-muted italic">SYNCING NODE DATABASE...</span>
               </div>
             ) : agents.length === 0 ? (
               <div className="p-20 text-center border-4 border-ink border-dashed">
                  <p className="text-[10px] font-black text-muted uppercase tracking-[0.4em] italic mb-6">ZERO ASSETS DEPLOYED</p>
                  <Bot className="w-16 h-16 text-zinc-100 mx-auto" />
               </div>
             ) : (
               agents.map(agent => (
                  <motion.button
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={agent.id}
                    onClick={() => setSelectedAgent(agent)}
                    className={cn(
                      "w-full text-left p-8 flex items-center gap-6 transition-all brutal-border border-4 relative overflow-hidden group", 
                      selectedAgent?.id === agent.id 
                        ? "bg-brand border-ink shadow-[8px_8px_0px_0px_rgba(10,10,10,1)] translate-x-1 translate-y-1" 
                        : "bg-white border-zinc-200 shadow-none hover:border-ink"
                    )}
                  >
                     <div className={cn(
                       "w-16 h-16 brutal-border border-4 flex items-center justify-center shrink-0 shadow-none transition-all", 
                       selectedAgent?.id === agent.id ? "bg-ink text-brand" : "bg-zinc-100 text-muted group-hover:bg-brand group-hover:text-ink"
                     )}>
                       {agent.channel === 'email' ? <Mail className="w-8 h-8" /> : <Bot className="w-8 h-8" />}
                     </div>
                     <div className="overflow-hidden">
                       <div className="font-black text-ink uppercase tracking-tighter font-display text-2xl italic leading-none truncate mb-2">{agent.name}</div>
                       <div className="flex items-center gap-3">
                          <span className={cn(
                            "text-[8px] font-black px-2 py-0.5 brutal-border shadow-none uppercase tracking-widest italic",
                            selectedAgent?.id === agent.id ? "bg-ink text-brand" : "bg-zinc-100 text-muted"
                          )}>
                             {agent.channel?.toUpperCase()}
                          </span>
                          <span className="text-[9px] font-black text-muted uppercase tracking-widest truncate">ID_{agent.id.substring(0,10)}</span>
                       </div>
                     </div>
                  </motion.button>
                ))
              )}
            </AnimatePresence>

            <motion.div layout className="pt-12 mt-12 border-t-8 border-ink border-dashed space-y-10">
              <header className="flex items-center justify-between">
                <h3 className="text-[11px] font-black text-ink uppercase tracking-[0.4em] font-sans italic">DEPLOY MISSION UNIT</h3>
                <button 
                  onClick={async () => {
                    if (confirm("INJECT SPECIALIZED NEURAL UNITS INTO FLEET ARCHIVE?")) {
                      setIsCreating(true);
                      try {
                        const resp = await authFetch("/api/fleet/seed", { method: "POST" });
                        if (resp.ok) await fetchAgents();
                      } finally {
                        setIsCreating(false);
                      }
                    }
                  }}
                  className="brutal-btn !bg-ink !text-brand !py-2 !px-4 text-[9px] font-black uppercase tracking-widest italic flex items-center gap-3 group"
                >
                  <Sparkles className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" /> SEED
                </button>
              </header>
              
              <div className="bg-paper p-1.5 border-4 border-ink flex">
                 <button onClick={() => setNewAgentChannel('voice')} className={cn("flex-1 text-[10px] font-black py-4 uppercase tracking-[0.3em] transition-all italic", newAgentChannel === 'voice' ? "bg-ink text-brand" : "text-muted hover:text-ink")}>VOICE CORE</button>
                 <button onClick={() => setNewAgentChannel('email')} className={cn("flex-1 text-[10px] font-black py-4 uppercase tracking-[0.3em] transition-all italic", newAgentChannel === 'email' ? "bg-ink text-brand" : "text-muted hover:text-ink")}>EMAIL RELAY</button>
              </div>
              
              <div className="space-y-6">
                <div className="space-y-2">
                   <label className="text-[9px] font-black text-muted uppercase tracking-widest italic ml-1">DESIGNATION ID</label>
                   <input type="text" placeholder="NODE-XXX-YYY" value={newAgentId} onChange={e => setNewAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="w-full text-sm font-black p-5 brutal-border border-4 outline-none focus:bg-brand uppercase tracking-widest placeholder:text-zinc-200" />
                </div>
                <div className="space-y-2">
                   <label className="text-[9px] font-black text-muted uppercase tracking-widest italic ml-1">TACTICAL NAME</label>
                   <input type="text" placeholder="E.G. VANGUARD-1" value={newAgentName} onChange={e => setNewAgentName(e.target.value)} className="w-full text-sm font-black p-5 brutal-border border-4 outline-none focus:bg-brand uppercase tracking-widest placeholder:text-zinc-200" />
                </div>
              </div>

              <button 
                onClick={handleCreateAgent} 
                disabled={isCreating || !newAgentId || !newAgentName} 
                className="brutal-btn w-full !bg-ink !text-brand !py-6 text-sm font-black uppercase flex justify-center items-center gap-4 transition-all shadow-[8px_8px_0px_0px_rgba(212,255,77,1)] active:shadow-none active:translate-x-1 active:translate-y-1 hover:shadow-[12px_12px_0px_0px_rgba(212,255,77,1)]"
              >
                {isCreating ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />} COMMENCE DEPLOYMENT
              </button>
            </motion.div>
        </div>
      </aside>

      {/* Main Panel: Agent Configuration */}
      <main className="flex-1 h-full overflow-y-auto bg-paper p-8 md:p-16 lg:p-24 pb-40">
        <AnimatePresence mode="wait">
          {!selectedAgent ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="h-full flex flex-col items-center justify-center p-20 text-center space-y-10"
            >
              <div className="w-32 h-32 md:w-48 md:h-48 bg-white brutal-border border-8 flex items-center justify-center shadow-[16px_16px_0px_0px_rgba(10,10,10,1)] group hover:rotate-6 transition-transform">
                <Target className="w-16 h-16 md:w-24 md:h-24 text-zinc-100 group-hover:text-brand transition-colors" />
              </div>
              <div className="space-y-4">
                <h3 className="text-4xl md:text-6xl font-black text-ink uppercase font-display italic tracking-tighter">SELECT NODE</h3>
                <p className="max-w-md font-bold uppercase tracking-[0.4em] text-xs md:text-sm leading-loose text-muted mx-auto italic">RECONFIGURE NEURAL PARAMETERS AND OPERATIONAL HEURISTICS FOR INDIVIDUAL MISSION UNITS.</p>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key={selectedAgent.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-[1200px] mx-auto space-y-16 lg:space-y-24"
            >
              <header className="brutal-card !p-12 md:!p-20 border-8 relative group">
                 <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:-rotate-6 transition-transform">
                    {selectedAgent.channel === 'email' ? <Mail className="w-64 h-64 text-zinc-950" /> : <Bot className="w-64 h-64 text-zinc-950" />}
                 </div>
                 
                 <div className="flex flex-col lg:flex-row items-start justify-between gap-12 relative z-10">
                   <div className="flex-1 w-full space-y-8">
                      <div className="flex items-center gap-6">
                        <div className="w-4 h-16 md:h-24 bg-brand shadow-[4px_4px_0px_0px_rgba(10,10,10,1)]" />
                        <input 
                          type="text" 
                          value={selectedAgent.name} 
                          onChange={e => updateAgentMeta({ name: e.target.value })} 
                          className="text-4xl md:text-8xl font-black bg-transparent outline-none border-b-8 border-transparent focus:border-brand text-ink uppercase tracking-tighter font-display italic w-full" 
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-6">
                        <span className={cn(
                          "px-6 py-2 brutal-border border-4 shadow-none text-[10px] md:text-xs font-black uppercase tracking-[0.3em] italic",
                          selectedAgent.channel === 'email' ? "bg-zinc-950 text-white" : "bg-brand text-ink"
                        )}>
                          NODAL CHANNEL: {selectedAgent.channel?.toUpperCase()}
                        </span>
                        <div className="text-[10px] md:text-xs font-black text-muted uppercase tracking-[0.3em] italic flex items-center gap-4">
                          ASSET_ID: <span className="bg-zinc-100 text-ink px-4 py-1 brutal-border border-2 shadow-none font-mono">#{selectedAgent.id}</span>
                        </div>
                      </div>
                   </div>
                 </div>

                 <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-10 pt-16 border-t-4 border-ink/5">
                   <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-10 p-10 bg-zinc-50 brutal-border border-4 shadow-none">
                     <div className="space-y-4">
                       <label className="text-[10px] font-black text-ink uppercase tracking-[0.4em] block italic flex items-center gap-3">
                          <LinkIcon className="w-4 h-4" /> KNOWLEDGE DOMAIN URL
                       </label>
                       <input 
                         type="url" 
                         value={selectedAgent.website_url || ""} 
                         onChange={e => updateAgentMeta({ website_url: e.target.value })} 
                         placeholder="HTTPS://TACTICAL-INTEL.CORE"
                         className="w-full p-5 brutal-border border-4 outline-none focus:bg-brand bg-white text-sm font-black uppercase tracking-[0.2em] placeholder:text-zinc-200"
                       />
                     </div>
                     <div className="space-y-4">
                       <label className="text-[10px] font-black text-ink uppercase tracking-[0.4em] block italic flex items-center gap-3">
                          <Phone className="w-4 h-4" /> RESPONSE HANDOVER (PTSN)
                       </label>
                       <input 
                         type="text" 
                         value={selectedAgent.transfer_phone || ""} 
                         onChange={e => updateAgentMeta({ transfer_phone: e.target.value })} 
                         placeholder="+1.800.REDACTED"
                         className="w-full p-5 brutal-border border-4 outline-none focus:bg-brand bg-white text-sm font-black uppercase tracking-[0.2em] placeholder:text-zinc-200"
                       />
                     </div>
                   </div>

                    {/* Voice Node Config */}
                    {selectedAgent.channel !== 'email' && (
                     <div className="md:col-span-2 space-y-12 bg-white p-10 md:p-14 brutal-border border-4">
                         <header className="flex items-center gap-6 border-b-4 border-ink pb-8">
                           <Radio className="w-10 h-10 text-brand fill-ink animate-pulse" />
                           <h3 className="font-black text-ink text-3xl uppercase tracking-tighter font-display italic">CARRIER SIGNAL PARAMETERS</h3>
                         </header>
                         
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                              <div className="space-y-4">
                                <label className="text-[10px] font-black text-muted uppercase tracking-[0.3em] block italic">NEURAL VOCAL SIGNATURE</label>
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
                                    className="w-full p-5 brutal-border border-4 font-black uppercase tracking-widest text-xs outline-none focus:bg-brand bg-white h-16 cursor-pointer appearance-none"
                                  >
                                    <optgroup label="PREMIUM_REPLICANTS">
                                      {PREMIUM_VOICES.map(v => <option key={v.id} value={v.id}>{v.name.toUpperCase()}</option>)}
                                    </optgroup>
                                    <option value="custom">EXTERNAL_ID_OVERRIDE</option>
                                  </select>
                                  <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 text-ink pointer-events-none rotate-90" />
                                </div>
                              </div>
                              
                              <div className="space-y-4">
                                <label className="text-[10px] font-black text-muted uppercase tracking-[0.3em] block italic">TACTICAL ARCHETYPE</label>
                                <div className="relative">
                                  <select 
                                    value={selectedAgent.archetype || "Receptionist"} 
                                    onChange={(e) => updateAgentMeta({ archetype: e.target.value })}
                                    className="w-full p-5 brutal-border border-4 font-black uppercase tracking-widest text-xs outline-none focus:bg-brand bg-white h-16 cursor-pointer appearance-none"
                                  >
                                    <option value="Receptionist">FRONT LINE RELAY</option>
                                    <option value="The Closer">MISSION TERMINATOR</option>
                                    <option value="Support Tech">LOGISTICS NAVIGATOR</option>
                                    <option value="The Empath">DIPLOMATIC CORE</option>
                                    <option value="The Collector">DATA HARVESTER</option>
                                    <option value="Lead Qualifier">TARGET SCANNER</option>
                                  </select>
                                  <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 text-ink pointer-events-none rotate-90" />
                                </div>
                             </div>

                             <div className="space-y-4">
                               <label className="text-[10px] font-black text-muted uppercase tracking-[0.3em] block italic">AMBIENT ATMOSPHERE</label>
                               <div className="relative">
                                 <select 
                                   value={selectedAgent.ambient_noise || "off"} 
                                   onChange={(e) => updateAgentMeta({ ambient_noise: e.target.value })}
                                   className="w-full p-5 brutal-border border-4 font-black uppercase tracking-widest text-xs outline-none focus:bg-brand bg-white h-16 cursor-pointer appearance-none"
                                 >
                                   <option value="off">VACUUM (STUDIO)</option>
                                   <option value="office">KINETIC (OFFICE)</option>
                                 </select>
                                 <ChevronRight className="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-6 text-ink pointer-events-none rotate-90" />
                               </div>
                             </div>
                         </div>

                         <div className="space-y-6">
                           <div className="flex items-center justify-between">
                              <label className="text-[11px] font-black text-ink uppercase tracking-[0.5em] block italic">INITIAL ENGAGEMENT GREETING</label>
                              <Zap className="w-5 h-5 text-brand fill-ink" />
                           </div>
                           <input 
                             type="text" 
                             value={selectedAgent.first_message || ""} 
                             onChange={e => updateAgentMeta({ first_message: e.target.value })} 
                             className="w-full p-8 brutal-border border-4 font-black text-ink uppercase tracking-tighter text-2xl md:text-4xl outline-none focus:bg-brand bg-paper font-display italic shadow-[12px_12px_0px_0px_rgba(10,10,10,1)]"
                           />
                         </div>
                     </div>
                    )}

                    {/* Email Config */}
                    {(selectedAgent.channel === 'email' || selectedAgent.channel === 'omnichannel' || !selectedAgent.channel) && (
                     <div className="md:col-span-2 space-y-12 bg-white p-10 md:p-14 brutal-border border-4">
                         <header className="flex items-center gap-6 border-b-4 border-ink pb-8">
                           <Mail className="w-10 h-10 text-emerald-500 fill-zinc-950 animate-pulse" />
                           <h3 className="font-black text-ink text-3xl uppercase tracking-tighter font-display italic">EMAIL RELAY HEURISTICS</h3>
                         </header>

                         <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                            <div className="space-y-8">
                                <div className="p-8 bg-paper brutal-border border-4 shadow-none flex items-center justify-between group hover:bg-emerald-50 transition-all">
                                  <div className="space-y-2">
                                     <h4 className="font-black text-ink text-sm uppercase tracking-widest italic">AUTO-RESPONSE MATRIX</h4>
                                     <p className="text-[10px] text-muted font-bold uppercase tracking-widest">AUTONOMOUS ENGAGEMENT ON INCOMING SIGNALS.</p>
                                  </div>
                                  <button 
                                    onClick={() => updateAgentMeta({ email_auto_respond: !selectedAgent.email_auto_respond })}
                                    className={cn(
                                      "w-16 h-10 brutal-border border-4 transition-all flex items-center p-1 cursor-pointer",
                                      selectedAgent.email_auto_respond ? "bg-emerald-500 border-emerald-900" : "bg-zinc-200 border-zinc-400"
                                    )}
                                  >
                                     <motion.div 
                                       animate={{ x: selectedAgent.email_auto_respond ? 24 : 0 }}
                                       className="w-6 h-6 bg-white brutal-border border-2 shadow-none"
                                     />
                                  </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                  <label className="text-[10px] font-black text-muted uppercase tracking-[0.3em] block italic">RELAY TONE</label>
                                  <select 
                                    value={selectedAgent.email_agent_tone || "Professional"} 
                                    onChange={e => updateAgentMeta({ email_agent_tone: e.target.value })}
                                    className="w-full p-5 brutal-border border-4 font-black uppercase tracking-widest text-xs outline-none focus:bg-emerald-50 bg-paper h-16 appearance-none cursor-pointer"
                                  >
                                    <option value="Professional">AUTHORITATIVE</option>
                                    <option value="Friendly">DIPLOMATIC</option>
                                    <option value="Direct">CONCISE</option>
                                  </select>
                                </div>

                                <div className="space-y-4">
                                  <label className="text-[10px] font-black text-muted uppercase tracking-[0.3em] block italic">RELAY SIGNATURE</label>
                                  <input 
                                    type="text" 
                                    value={selectedAgent.email_signature || ""} 
                                    onChange={e => updateAgentMeta({ email_signature: e.target.value })} 
                                    placeholder="NODE_SIG_01"
                                    className="w-full p-5 brutal-border border-4 font-black uppercase tracking-widest text-xs outline-none focus:bg-emerald-50 bg-paper h-16"
                                  />
                                </div>
                            </div>
                         </div>
                     </div>
                    )}
                 </div>
              </header>

              {isConfigLoading ? (
                 <div className="flex flex-col items-center justify-center py-40 space-y-8">
                   <Loader2 className="w-20 h-20 animate-spin text-brand" />
                   <span className="text-xl font-black uppercase tracking-[0.5em] italic">EXTRACTING NEURAL MAP...</span>
                 </div>
              ) : (
                 <div className="space-y-24">
                   {/* Personality Matrix */}
                   <section className="bg-zinc-950 p-12 md:p-16 brutal-border border-8 shadow-[24px_24px_0px_0px_rgba(212,255,77,1)] relative overflow-hidden group">
                     <div className="absolute top-0 right-0 p-16 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
                        <Terminal className="w-96 h-96 text-brand" />
                     </div>
                     <div className="flex flex-col md:flex-row items-center justify-between gap-10 mb-12 relative z-10">
                        <div className="flex items-center gap-6">
                          <Settings2 className="w-10 h-10 text-brand" />
                          <div>
                            <h3 className="text-4xl font-black text-white uppercase tracking-tighter font-display italic leading-none">BEHAVIORAL ENGINE</h3>
                            <p className="text-[11px] font-black text-zinc-500 uppercase tracking-[0.4em] mt-3 italic">Base heuristic instruction set</p>
                          </div>
                        </div>
                        <button 
                          onClick={() => updatePersonality(agentConfig.personality)} 
                          className="brutal-btn !bg-brand !text-ink !py-4 !px-12 text-sm font-black flex items-center gap-4 group shadow-none border-4"
                        >
                           <Save className="w-6 h-6 group-hover:scale-110 transition-transform" />
                           COMMIT HEURISTICS
                        </button>
                     </div>
                     <textarea 
                       value={agentConfig.personality} 
                       onChange={e => setAgentConfig({ ...agentConfig, personality: e.target.value })}
                       className="w-full h-64 p-10 brutal-border border-4 bg-zinc-900 text-brand outline-none focus:bg-black transition-all resize-none font-black uppercase tracking-tight text-xl md:text-3xl placeholder:text-white/5 font-display italic leading-tight relative z-10"
                       placeholder="DEFINE THE CORE NEURAL IDENTITY PARAMETERS..."
                     />
                   </section>

                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24">
                     {/* Directives Lists (Manual Override) */}
                     <section className="bg-white p-10 md:p-14 brutal-border border-8 shadow-[16px_16px_0px_0px_rgba(10,10,10,1)] flex flex-col h-[700px]">
                       <header className="border-b-8 border-ink pb-8 mb-10 flex justify-between items-end">
                          <div>
                            <h3 className="text-3xl font-black text-ink uppercase tracking-tighter font-display italic leading-none mb-4">TACTICAL LOGIC</h3>
                            <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em] italic">Hardened Nodal Constraints</p>
                          </div>
                          <div className="bg-rose-500 text-white px-3 py-1 font-black text-[9px] uppercase tracking-widest brutal-border border-4 shadow-none italic mb-1">INVIOLABLE</div>
                       </header>
                       <div className="flex-1 overflow-y-auto space-y-6 pr-4 scrollbar-hide">
                         <AnimatePresence mode="popLayout">
                           {agentConfig.directives?.length === 0 ? (
                              <div className="py-32 text-center text-zinc-100 font-black uppercase text-xs tracking-[1em] italic">AWAITING_INPUT</div>
                           ) : agentConfig.directives?.map((d: any) => (
                             <motion.div 
                                layout
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                key={d.id} 
                                className="p-8 bg-rose-50 brutal-border border-4 border-rose-200 text-rose-950 font-black uppercase text-sm tracking-tight flex flex-col gap-6 group shadow-none hover:bg-rose-100 transition-all"
                             >
                                {editingDirective?.id === d.id ? (
                                   <div className="space-y-4">
                                      <textarea 
                                        value={editingDirective.content} 
                                        onChange={e => setEditingDirective({ ...editingDirective, content: e.target.value })}
                                        className="w-full p-4 brutal-border border-2 bg-white outline-none focus:bg-rose-200 min-h-[120px] font-black uppercase text-xs italic"
                                      />
                                      <div className="flex justify-end gap-3">
                                         <button onClick={() => setEditingDirective(null)} className="brutal-btn !bg-white !py-2 !px-4 text-[10px] font-black">CANCEL</button>
                                         <button 
                                           onClick={() => saveManualEntry('directive', editingDirective.content, d.id)} 
                                           disabled={isSavingEntry}
                                           className="brutal-btn !bg-ink !text-white !py-2 !px-4 text-[10px] font-black"
                                         >
                                            {isSavingEntry ? 'SYNCING...' : 'COMMIT'}
                                         </button>
                                      </div>
                                   </div>
                                ) : (
                                   <div className="flex gap-8 items-start justify-between">
                                      <div className="flex-1 leading-tight font-display italic text-lg md:text-xl">{d.content}</div>
                                       <div className="opacity-0 group-hover:opacity-100 transition-all flex flex-col gap-3">
                                        <button onClick={() => setEditingDirective({ id: d.id, content: d.content })} className="w-10 h-10 brutal-border border-2 bg-white hover:bg-rose-200 flex items-center justify-center text-rose-300 hover:text-rose-600"><Pencil className="w-5 h-5" /></button>
                                        <button onClick={() => deleteRule("directive", d.id)} className="w-10 h-10 brutal-border border-2 bg-white hover:bg-rose-500 hover:text-white flex items-center justify-center text-rose-300"><Trash2 className="w-5 h-5" /></button>
                                      </div>
                                   </div>
                                )}
                             </motion.div>
                           ))}
                         </AnimatePresence>
                       </div>
                       <div className="mt-10 pt-10 border-t-4 border-ink space-y-4">
                          <label className="text-[10px] font-black text-muted uppercase tracking-[0.4em] italic ml-1">INJECT NEW CONSTRAINT</label>
                          <div className="flex gap-4">
                             <input 
                               type="text" 
                               value={newDirective} 
                               onChange={e => setNewDirective(e.target.value)}
                               onKeyDown={e => e.key === 'Enter' && saveManualEntry('directive', newDirective)}
                               placeholder="E.G. ALWAYS VERIFY DOB..." 
                               className="flex-1 p-5 brutal-border border-4 outline-none focus:bg-rose-50 text-xs font-black uppercase tracking-widest placeholder:text-zinc-100"
                             />
                             <button 
                               onClick={() => saveManualEntry('directive', newDirective)} 
                               disabled={!newDirective || isSavingEntry}
                               className="w-16 h-16 brutal-btn !bg-rose-500 !text-white flex items-center justify-center shadow-none border-4 disabled:opacity-50"
                             >
                               <Plus className="w-8 h-8" />
                             </button>
                          </div>
                       </div>
                     </section>

                     <section className="bg-white p-10 md:p-14 brutal-border border-8 shadow-[16px_16px_0px_0px_rgba(10,10,10,1)] flex flex-col h-[700px]">
                       <header className="border-b-8 border-ink pb-8 mb-10 flex justify-between items-end">
                          <div>
                            <h3 className="text-3xl font-black text-ink uppercase tracking-tighter font-display italic leading-none mb-4">NEURAL GROUNDING</h3>
                            <p className="text-[10px] font-black text-muted uppercase tracking-[0.3em] italic">Knowledge Vault Archive</p>
                          </div>
                          <div className="bg-blue-500 text-white px-3 py-1 font-black text-[9px] uppercase tracking-widest brutal-border border-4 shadow-none italic mb-1">FACTUAL</div>
                       </header>
                       <div className="flex-1 overflow-y-auto space-y-6 pr-4 scrollbar-hide">
                         <AnimatePresence mode="popLayout">
                           {agentConfig.knowledge?.length === 0 ? (
                              <div className="py-32 text-center text-zinc-100 font-black uppercase text-xs tracking-[1em] italic">VAULT_EMPTY</div>
                           ) : agentConfig.knowledge?.map((k: any) => (
                             <motion.div 
                                layout
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                key={k.id} 
                                className="p-8 bg-blue-50 brutal-border border-4 border-blue-200 text-blue-950 font-black uppercase text-sm tracking-tight flex flex-col gap-6 group shadow-none hover:bg-blue-100 transition-all"
                             >
                                {editingKnowledge?.id === k.id ? (
                                   <div className="space-y-4">
                                      <textarea 
                                        value={editingKnowledge.content} 
                                        onChange={e => setEditingKnowledge({ ...editingKnowledge, content: e.target.value })}
                                        className="w-full p-4 brutal-border border-2 bg-white outline-none focus:bg-blue-200 min-h-[120px] font-black uppercase text-xs italic"
                                      />
                                      <div className="flex justify-end gap-3">
                                         <button onClick={() => setEditingKnowledge(null)} className="brutal-btn !bg-white !py-2 !px-4 text-[10px] font-black">CANCEL</button>
                                         <button 
                                           onClick={() => saveManualEntry('knowledge', editingKnowledge.content, k.id)} 
                                           disabled={isSavingEntry}
                                           className="brutal-btn !bg-ink !text-white !py-2 !px-4 text-[10px] font-black"
                                         >
                                            {isSavingEntry ? 'SYNCING...' : 'COMMIT'}
                                         </button>
                                      </div>
                                   </div>
                                ) : (
                                   <div className="flex gap-8 items-start justify-between">
                                      <div className="flex-1 leading-tight font-display italic text-lg md:text-xl">{k.content}</div>
                                      <div className="opacity-0 group-hover:opacity-100 transition-all flex flex-col gap-3">
                                        <button onClick={() => setEditingKnowledge({ id: k.id, content: k.content })} className="w-10 h-10 brutal-border border-2 bg-white hover:bg-blue-200 flex items-center justify-center text-blue-300 hover:text-blue-600"><Pencil className="w-5 h-5" /></button>
                                        <button onClick={() => deleteRule("knowledge", k.id)} className="w-10 h-10 brutal-border border-2 bg-white hover:bg-blue-500 hover:text-white flex items-center justify-center text-blue-300"><Trash2 className="w-5 h-5" /></button>
                                      </div>
                                   </div>
                                )}
                             </motion.div>
                           ))}
                         </AnimatePresence>
                       </div>
                       <div className="mt-10 pt-10 border-t-4 border-ink space-y-4">
                          <label className="text-[10px] font-black text-muted uppercase tracking-[0.4em] italic ml-1">INJECT NEW GROUNDING FACT</label>
                          <div className="flex gap-4">
                             <input 
                               type="text" 
                               value={newKnowledge} 
                               onChange={e => setNewKnowledge(e.target.value)}
                               onKeyDown={e => e.key === 'Enter' && saveManualEntry('knowledge', newKnowledge)}
                               placeholder="E.G. OFFICE CLOSES AT 5PM..." 
                               className="flex-1 p-5 brutal-border border-4 outline-none focus:bg-blue-50 text-xs font-black uppercase tracking-widest placeholder:text-zinc-100"
                             />
                             <button 
                               onClick={() => saveManualEntry('knowledge', newKnowledge)} 
                               disabled={!newKnowledge || isSavingEntry}
                               className="w-16 h-16 brutal-btn !bg-blue-500 !text-white flex items-center justify-center shadow-none border-4 disabled:opacity-50"
                             >
                               <Plus className="w-8 h-8" />
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
  );
}
