import { useState, useEffect } from "react";
import { Users, Plus, Phone, Bot, Save, Loader2, Link as LinkIcon, Copy, Trash2, Megaphone, Mail, Pencil, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";

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
        fetch("/api/agents").then(r => r.json()),
        fetch("/api/settings").then(r => r.json())
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
  }, [selectedAgent]);

  const fetchAgentConfig = async (id: string) => {
    setIsConfigLoading(true);
    try {
       const res = await fetch(`/api/agent-config/${id}`);
       const data = await res.json();
       setAgentConfig(data);
    } catch (e) {
      console.error(e);
    }
    setIsConfigLoading(false);
  };

  const handleCreateAgent = async () => {
    if (!newAgentName || !newAgentId) return;
    
    // GATING CHECK
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
      const resp = await fetch("/api/agents", {
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
    await fetch(`/api/agents/${selectedAgent.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setSelectedAgent(body);
    setAgents(agents.map(a => a.id === selectedAgent.id ? body : a));
  };

  const updatePersonality = async (val: string) => {
    setAgentConfig({ ...agentConfig, personality: val });
    await fetch(`/api/agent-config/${selectedAgent.id}/manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "personality", content: val })
    });
  };

  const saveManualEntry = async (type: 'directive' | 'knowledge', content: string, overrideId?: string) => {
    if (!content.trim()) return;
    setIsSavingEntry(true);
    try {
        const resp = await fetch(`/api/agent-config/${selectedAgent.id}/manual`, {
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
    await fetch(`/api/agent-config/${selectedAgent.id}/${type}/${rowId}`, { method: "DELETE" });
    fetchAgentConfig(selectedAgent.id);
  };

  const copyWebhook = () => {
    const url = `${window.location.protocol}//${window.location.host}/api/vapi-webhook?agentId=${selectedAgent?.id}`;
    navigator.clipboard.writeText(url);
    alert("Webhook URL copied to clipboard!");
  };

  return (
    <div className="h-full flex flex-col md:flex-row bg-white">
      
      {/* Sidebar: Agents List */}
      <div className="w-full md:w-96 border-b-4 md:border-b-0 md:border-r-4 border-ink bg-white h-auto md:h-full flex flex-col shrink-0">
        <div className="p-6 md:p-8 border-b-4 border-ink bg-brand">
           <div className="flex items-center gap-2 mb-2">
              <span className="bg-ink text-brand text-[8px] font-black px-1.5 py-0.5 uppercase tracking-widest italic tracking-[0.2em]">Service bay</span>
           </div>
           <h2 className="text-xl md:text-3xl font-black text-ink uppercase tracking-tight font-display italic leading-none flex items-center gap-3">
             <Users className="w-5 h-5 md:w-8 md:h-8" />
             Fleet Inventory
           </h2>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
           {isLoading ? (
             <div className="flex justify-center p-12"><Loader2 className="w-10 h-10 animate-spin text-brand" /></div>
           ) : agents.length === 0 ? (
             <p className="text-[10px] font-black text-slate-400 text-center py-12 uppercase tracking-widest">No assets deployed.</p>
           ) : (
             agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(agent)}
                  className={cn(
                    "w-full text-left p-6 flex items-center gap-5 transition-all brutal-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none relative overflow-hidden group", 
                    selectedAgent?.id === agent.id ? "bg-brand [&_.agent-icon]:bg-ink [&_.agent-icon]:text-brand shadow-none translate-x-0.5 translate-y-0.5" : "bg-white"
                  )}
                >
                   <div className={cn("w-14 h-14 brutal-border flex items-center justify-center shrink-0 shadow-none agent-icon transition-colors", selectedAgent?.id === agent.id ? "bg-ink text-brand" : "bg-white text-ink group-hover:bg-brand")}>
                     {agent.channel === 'email' ? <Mail className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
                   </div>
                   <div className="overflow-hidden">
                     <div className="flex items-center gap-2 mb-1">
                       <div className="font-black text-ink uppercase tracking-tight font-display text-lg italic leading-none truncate">{agent.name}</div>
                     </div>
                     <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">AGENT ID: {agent.id}</div>
                   </div>
                   {agent.channel === 'email' && (
                     <span className="absolute top-2 right-2 text-[7px] bg-ink text-white px-1.5 py-0.5 font-black uppercase tracking-tighter italic">EMAIL</span>
                   )}
                </button>
              ))
            )}

              <div className="pt-8 mt-8 border-t-4 border-ink space-y-6">
              <h3 className="text-[10px] font-black text-ink uppercase tracking-[0.3em] font-sans italic">CREATE NEW AGENT</h3>
              <div className="flex bg-ink p-1 brutal-border shadow-none">
                 <button onClick={() => setNewAgentChannel('voice')} className={cn("flex-1 text-[10px] font-black py-3 uppercase tracking-widest transition-all italic", newAgentChannel === 'voice' ? "bg-brand text-ink" : "text-white/40 hover:text-white")}>VOICE</button>
                 <button onClick={() => setNewAgentChannel('email')} className={cn("flex-1 text-[10px] font-black py-3 uppercase tracking-widest transition-all italic", newAgentChannel === 'email' ? "bg-brand text-ink" : "text-white/40 hover:text-white")}>EMAIL</button>
              </div>
              <div className="space-y-4">
                <input type="text" placeholder="AGENT ID" value={newAgentId} onChange={e => setNewAgentId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="w-full text-xs font-black p-4 brutal-border outline-none focus:bg-brand uppercase tracking-widest placeholder:text-slate-300 shadow-none border-2" />
                <input type="text" placeholder="AGENT NAME" value={newAgentName} onChange={e => setNewAgentName(e.target.value)} className="w-full text-xs font-black p-4 brutal-border outline-none focus:bg-brand uppercase tracking-widest placeholder:text-slate-300 shadow-none border-2" />
              </div>
              <button onClick={handleCreateAgent} disabled={isCreating || !newAgentId || !newAgentName} className="brutal-btn w-full !bg-ink text-brand !py-4 flex justify-center items-center gap-3 active:translate-x-1 active:translate-y-1 active:shadow-none shadow-[4px_4px_0px_0px_rgba(250,204,21,1)]">
                {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />} CREATE AGENT
              </button>
            </div>
        </div>
      </div>

      {/* Main Panel: Agent Configuration */}
      <div className="flex-1 h-full overflow-y-auto bg-white p-4 md:p-12">
        {!selectedAgent ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-300 p-8 md:p-24 text-center">
            <div className="w-24 h-24 md:w-32 md:h-32 bg-white brutal-border flex items-center justify-center mb-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
              <Bot className="w-12 h-12 md:w-16 md:h-16 text-slate-200" />
            </div>
            <h3 className="text-xl md:text-4xl font-black text-ink uppercase font-display italic mb-4 text-slate-400">Select an Agent</h3>
            <p className="max-w-xs font-bold uppercase tracking-widest text-[8px] md:text-[10px] leading-loose">Choose an agent from the list to view and edit settings.</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto p-4 md:p-12 space-y-8 md:space-y-12">
            <header className="bg-white brutal-border p-6 md:!p-10 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] md:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)]">
               <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-8">
                 <div className="flex-1 w-full mr-0 md:mr-8">
                    <div className="flex items-center gap-4 mb-4">
                      <input type="text" value={selectedAgent.name} onChange={e => updateAgentMeta({ name: e.target.value })} className="text-3xl md:text-6xl font-black bg-transparent outline-none border-b-4 border-transparent focus:border-brand text-ink uppercase tracking-tight font-display italic w-full" />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 md:gap-4">
                      <span className={cn(
                        "px-3 py-1 brutal-border shadow-none text-[8px] md:text-[10px] font-black uppercase tracking-widest italic",
                        selectedAgent.channel === 'email' ? "bg-zinc-950 text-white" : "bg-brand text-ink"
                      )}>
                        {selectedAgent.channel?.toUpperCase() || 'VOICE'}
                      </span>
                      <div className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        ID: <span className="bg-zinc-100 text-ink px-2 py-0.5 brutal-border shadow-none">{selectedAgent.id}</span>
                      </div>
                    </div>
                 </div>
                 <div className={cn(
                   "w-16 h-16 md:w-24 md:h-24 brutal-border flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] shrink-0",
                   selectedAgent.channel === 'email' ? "bg-zinc-950 text-white" : "bg-brand text-ink"
                 )}>
                   {selectedAgent.channel === 'email' ? <Mail className="w-8 h-8 md:w-12 md:h-12" /> : <Bot className="w-8 h-8 md:w-12 md:h-12" />}
                 </div>
               </div>

               <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 pt-10 border-t-2 border-ink/5">
                 <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8 p-6 md:p-10 bg-slate-50 brutal-border shadow-none">
                   <div>
                     <label className="text-[10px] font-black text-ink uppercase tracking-[0.3em] block mb-4 italic">COMPANY WEBSITE URL</label>
                     <div className="flex gap-4">
                        <div className="w-12 h-12 brutal-border bg-white flex items-center justify-center shrink-0">
                          <LinkIcon className="w-5 h-5 text-ink" />
                        </div>
                        <input 
                          type="url" 
                          value={selectedAgent.website_url || ""} 
                          onChange={e => updateAgentMeta({ website_url: e.target.value })} 
                          placeholder="HTTPS://COMPANY.COM"
                          className="w-full p-4 brutal-border outline-none focus:bg-brand bg-white text-xs font-black uppercase tracking-widest placeholder:text-slate-300 shadow-none border-2"
                        />
                     </div>
                   </div>
                   <div>
                     <label className="text-[10px] font-black text-ink uppercase tracking-[0.3em] block mb-4 italic">TRANSFER PHONE NUMBER</label>
                     <div className="flex gap-4">
                        <div className="w-12 h-12 brutal-border bg-white flex items-center justify-center shrink-0">
                          <Phone className="w-5 h-5 text-ink" />
                        </div>
                        <input 
                          type="text" 
                          value={selectedAgent.transfer_phone || ""} 
                          onChange={e => updateAgentMeta({ transfer_phone: e.target.value })} 
                          placeholder="+10000000000"
                          className="w-full p-4 brutal-border outline-none focus:bg-brand bg-white text-xs font-black uppercase tracking-widest placeholder:text-slate-300 shadow-none border-2"
                         />
                     </div>
                   </div>
                 </div>

                  {/* Voice Fleet Settings (Hidden if Email Specialist) */}
                  {selectedAgent.channel !== 'email' && (
                   <div className="md:col-span-2 bg-brand/5 p-6 md:p-10 brutal-border shadow-none space-y-10 border-brand/20">
                       <div className="flex items-center gap-4 mb-2">
                         <Phone className="w-6 h-6 text-brand fill-ink" />
                         <h3 className="font-black text-ink text-xl uppercase tracking-tight font-display italic">Carrier Core Configuration</h3>
                       </div>
                       
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 border-b-2 border-brand/10 pb-10">
                            <div className="space-y-3">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block italic">INBOUND FREQUENCY</label>
                              <select 
                                value={PREMIUM_VOICES.find(v => v.id === (selectedAgent.voice_id_inbound || selectedAgent.voice_id)) ? (selectedAgent.voice_id_inbound || selectedAgent.voice_id) : "custom"} 
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val !== "custom") {
                                      const voiceData = PREMIUM_VOICES.find(v => v.id === val);
                                      updateAgentMeta({ voice_id_inbound: val, voice_id: val, voice_provider: voiceData?.provider || '11labs' });
                                  }
                                }}
                                className="w-full p-4 brutal-border font-black uppercase tracking-widest text-[10px] outline-none focus:bg-brand bg-white h-12 cursor-pointer shadow-none appearance-none border-2"
                              >
                                <optgroup label="PREMIUM_SIGNATURES">
                                  {PREMIUM_VOICES.map(v => <option key={v.id} value={v.id}>{v.name.toUpperCase()}</option>)}
                                </optgroup>
                                <option value="custom">CUSTOM_ID_OVERRIDE</option>
                              </select>
                            </div>

                            <div className="space-y-3">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block italic">OUTBOUND DISPATCH</label>
                              <select 
                                value={PREMIUM_VOICES.find(v => v.id === (selectedAgent.voice_id_outbound || selectedAgent.voice_id)) ? (selectedAgent.voice_id_outbound || selectedAgent.voice_id) : "custom"} 
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val !== "custom") {
                                      const voiceData = PREMIUM_VOICES.find(v => v.id === val);
                                      updateAgentMeta({ voice_id_outbound: val });
                                  }
                                }}
                                className="w-full p-4 brutal-border font-black uppercase tracking-widest text-[10px] outline-none focus:bg-brand bg-white h-12 cursor-pointer shadow-none appearance-none border-2"
                              >
                                <optgroup label="PREMIUM_SIGNATURES">
                                  {PREMIUM_VOICES.map(v => <option key={v.id} value={v.id}>{v.name.toUpperCase()}</option>)}
                                </optgroup>
                                <option value="custom">CUSTOM_ID_OVERRIDE</option>
                              </select>
                            </div>
                            
                            <div className="space-y-3 lg:col-span-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block italic">TACTICAL ARCHETYPE</label>
                             <select 
                               value={selectedAgent.archetype || "Receptionist"} 
                               onChange={(e) => updateAgentMeta({ archetype: e.target.value })}
                               className="w-full p-4 brutal-border font-black uppercase tracking-widest text-[10px] outline-none focus:bg-brand bg-white h-12 cursor-pointer shadow-none appearance-none border-2"
                             >
                               <option value="Receptionist">THE RECEPTIONIST</option>
                               <option value="The Closer">THE CLOSER</option>
                               <option value="Support Tech">SUPPORT MAVEN</option>
                               <option value="The Empath">THE EMPATH</option>
                               <option value="The Collector">THE COLLECTOR</option>
                               <option value="Lead Qualifier">LEAD QUALIFIER</option>
                             </select>
                           </div>

                           <div className="space-y-3">
                             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block italic">ENVIRONMENT NOISE</label>
                             <select 
                               value={selectedAgent.ambient_noise || "off"} 
                               onChange={(e) => updateAgentMeta({ ambient_noise: e.target.value })}
                               className="w-full p-4 brutal-border font-black uppercase tracking-widest text-[10px] outline-none focus:bg-brand bg-white h-12 cursor-pointer shadow-none appearance-none border-2"
                             >
                               <option value="off">OFF - STUDIO QUALITY</option>
                               <option value="office">ACTIVE - OFFICE NOISE</option>
                             </select>
                           </div>
                       </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block italic">FIRST MESSAGE (GREETING)</label>
                        <input 
                          type="text" 
                          value={selectedAgent.first_message || ""} 
                          onChange={e => updateAgentMeta({ first_message: e.target.value })} 
                          className="w-full p-5 brutal-border font-black text-ink uppercase tracking-tight text-lg outline-none focus:bg-brand bg-white font-display italic shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] border-2"
                        />
                      </div>
                  </div>
                 )}

                 {/* Email Configuration Section */}
                 {(selectedAgent.channel === 'email' || selectedAgent.channel === 'omnichannel' || !selectedAgent.channel) && (
                  <div className="md:col-span-2 bg-emerald-50/20 p-6 md:p-10 brutal-border shadow-none space-y-10 border-emerald-200/40">
                      <div className="flex items-center gap-4 mb-2">
                        <Mail className="w-6 h-6 text-emerald-600 fill-emerald-100" />
                        <h3 className="font-black text-ink text-xl uppercase tracking-tight font-display italic text-emerald-950">Email Configuration</h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        <div className="space-y-6">
                            <div className="flex items-center justify-between p-6 bg-white brutal-border shadow-none border-emerald-100">
                              <div>
                                  <div className="font-black text-emerald-950 text-xs uppercase tracking-tight italic mb-1">EMAIL AUTO-RESPONSE</div>
                                  <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest leading-relaxed">Enable autonomous agent replies to incoming emails.</p>
                              </div>
                              <button 
                                onClick={() => updateAgentMeta({ email_auto_respond: !selectedAgent.email_auto_respond })}
                                className={cn(
                                  "relative inline-flex h-8 w-16 shrink-0 cursor-pointer brutal-border shadow-none transition-colors duration-200 ease-in-out p-1",
                                  selectedAgent.email_auto_respond ? "bg-emerald-500 border-emerald-600" : "bg-slate-200 border-slate-300"
                                )}
                              >
                                <span className={cn(
                                  "inline-block h-5 w-5 brutal-border shadow-none bg-white transition duration-200",
                                  selectedAgent.email_auto_respond ? "translate-x-7" : "translate-x-0"
                                )} />
                              </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-3">
                              <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block italic">EMAIL TONE</label>
                              <select 
                                value={selectedAgent.email_agent_tone || "Professional"} 
                                onChange={e => updateAgentMeta({ email_agent_tone: e.target.value })}
                                className="w-full p-4 brutal-border font-black uppercase tracking-widest text-xs outline-none focus:bg-emerald-100 bg-white h-14 border-emerald-100 shadow-none appearance-none border-2"
                              >
                                <option value="Professional">PROFESSIONAL</option>
                                <option value="Friendly">FRIENDLY & WARM</option>
                                <option value="Direct">DIRECT & BLUNT</option>
                              </select>
                            </div>

                            <div className="space-y-3">
                              <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block italic">EMAIL SIGNATURE</label>
                              <input 
                                type="text" 
                                value={selectedAgent.email_signature || ""} 
                                onChange={e => updateAgentMeta({ email_signature: e.target.value })} 
                                placeholder="E.G. THE WIRELINE TEAM"
                                className="w-full p-4 brutal-border font-black uppercase tracking-widest text-xs outline-none focus:bg-emerald-100 bg-white h-14 border-emerald-100 placeholder:text-emerald-100 shadow-none border-2"
                              />
                            </div>
                        </div>
                      </div>
                  </div>
                 )}
               </div>
            </header>

            {isConfigLoading ? (
               <div className="flex justify-center py-24 text-center">
                 <Loader2 className="w-16 h-16 animate-spin text-brand" />
               </div>
            ) : (
               <div className="space-y-16">
                 {/* Personality Matrix */}
                 <section className="bg-zinc-950 p-6 md:p-10 brutal-border shadow-[8px_8px_0px_0px_rgba(250,204,21,1)]">
                   <div className="flex items-center justify-between gap-3 mb-6">
                      <div className="flex items-center gap-3">
                        <span className="w-2.5 h-2.5 bg-brand animate-pulse" />
                        <h3 className="text-xl font-black text-white uppercase tracking-tight font-display italic">Behavioral Engine</h3>
                      </div>
                      <button 
                        onClick={() => updatePersonality(agentConfig.personality)} 
                        className="brutal-btn !bg-brand !text-ink !py-2 !px-4 text-[9px] flex items-center gap-2 group shadow-none"
                      >
                         <Save className="w-4 h-4" />
                         DEPLOY CHANGES
                      </button>
                   </div>
                   <textarea 
                     value={agentConfig.personality} 
                     onChange={e => setAgentConfig({ ...agentConfig, personality: e.target.value })}
                     className="w-full h-40 p-6 brutal-border bg-zinc-900 text-brand outline-none focus:bg-black transition-all resize-none font-bold uppercase tracking-tight text-base placeholder:text-white/10"
                     placeholder="CONFIGURE CORE AGENT ATTRIBUTES..."
                   />
                 </section>

                 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10">
                   {/* Directives Lists (Manual Override) */}
                   <section className="bg-white p-6 md:p-10 brutal-border shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col h-[450px]">
                     <h3 className="text-lg font-black text-ink uppercase tracking-tight font-display italic mb-6 border-b-2 border-ink pb-3 flex justify-between items-center">
                        Tactical Rules
                        <span className="text-[8px] font-sans bg-rose-500 text-white px-2 py-0.5 shadow-none brutal-border">IMMUTABLE</span>
                     </h3>
                     <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                       {agentConfig.directives?.length === 0 ? (
                          <div className="text-slate-200 font-bold uppercase text-[8px] tracking-[0.3em] italic text-center py-20">Awaiting tactical rules...</div>
                       ) : agentConfig.directives?.map((d: any) => (
                         <div key={d.id} className="p-4 bg-rose-50 brutal-border border-rose-200 text-rose-900 font-bold uppercase text-[10px] tracking-tight flex flex-col gap-2 group shadow-none">
                            {editingDirective?.id === d.id ? (
                               <div className="space-y-2">
                                  <textarea 
                                    value={editingDirective.content} 
                                    onChange={e => setEditingDirective({ ...editingDirective, content: e.target.value })}
                                    className="w-full p-2 brutal-border bg-white outline-none focus:bg-rose-100 min-h-[80px] font-bold uppercase text-[10px]"
                                  />
                                  <div className="flex justify-end gap-2">
                                     <button onClick={() => setEditingDirective(null)} className="brutal-btn !bg-white !py-1 !px-2 text-[8px]">CANCEL</button>
                                     <button 
                                       onClick={() => saveManualEntry('directive', editingDirective.content, d.id)} 
                                       disabled={isSavingEntry}
                                       className="brutal-btn !bg-ink !text-white !py-1 !px-2 text-[8px]"
                                     >
                                        {isSavingEntry ? 'SAVING...' : 'SAVE'}
                                     </button>
                                  </div>
                               </div>
                            ) : (
                               <div className="flex gap-4">
                                  <div className="flex-1 leading-relaxed underline decoration-rose-200/50">{d.content}</div>
                                   <div className="opacity-0 group-hover:opacity-100 transition-all flex gap-1">
                                    <button onClick={() => setEditingDirective({ id: d.id, content: d.content })} className="text-rose-400 hover:text-rose-600 shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => deleteRule("directive", d.id)} className="text-rose-300 hover:text-rose-600 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                               </div>
                            )}
                         </div>
                       ))}
                     </div>
                     <div className="mt-4 pt-4 border-t border-ink/5">
                        <div className="flex gap-2">
                           <input 
                             type="text" 
                             value={newDirective} 
                             onChange={e => setNewDirective(e.target.value)}
                             onKeyDown={e => e.key === 'Enter' && saveManualEntry('directive', newDirective)}
                             placeholder="NEW RULE..." 
                             className="flex-1 p-2.5 brutal-border outline-none focus:bg-rose-50 text-[9px] font-bold uppercase border-rose-200"
                           />
                           <button 
                             onClick={() => saveManualEntry('directive', newDirective)} 
                             disabled={!newDirective || isSavingEntry}
                             className="brutal-btn !bg-rose-500 !text-white !p-2.5 shadow-none border-rose-600 disabled:opacity-50"
                           >
                             <Plus className="w-4 h-4" />
                           </button>
                        </div>
                     </div>
                   </section>

                   <section className="bg-white p-6 md:p-10 brutal-border shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] flex flex-col h-[450px]">
                     <h3 className="text-lg font-black text-ink uppercase tracking-tight font-display italic mb-6 border-b-2 border-ink pb-3 flex justify-between items-center">
                        Knowledge Base
                        <span className="text-[8px] font-sans bg-indigo-500 text-white px-2 py-0.5 shadow-none brutal-border">GROUNDING</span>
                     </h3>
                     <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                       {agentConfig.knowledge?.length === 0 ? (
                          <div className="text-slate-200 font-bold uppercase text-[8px] tracking-[0.3em] italic text-center py-20">Grounding archive empty.</div>
                       ) : agentConfig.knowledge?.map((k: any) => (
                         <div key={k.id} className="p-4 bg-indigo-50 brutal-border border-indigo-200 text-indigo-900 font-bold uppercase text-[10px] tracking-tight flex flex-col gap-2 group shadow-none">
                            {editingKnowledge?.id === k.id ? (
                               <div className="space-y-2">
                                  <textarea 
                                    value={editingKnowledge.content} 
                                    onChange={e => setEditingKnowledge({ ...editingKnowledge, content: e.target.value })}
                                    className="w-full p-2 brutal-border bg-white outline-none focus:bg-indigo-100 min-h-[80px] text-[10px]"
                                  />
                                  <div className="flex justify-end gap-2">
                                     <button onClick={() => setEditingKnowledge(null)} className="brutal-btn !bg-white !py-1 !px-2 text-[8px]">CANCEL</button>
                                     <button 
                                       onClick={() => saveManualEntry('knowledge', editingKnowledge.content, k.id)} 
                                       disabled={isSavingEntry}
                                       className="brutal-btn !bg-ink !text-white !py-1 !px-2 text-[8px]"
                                     >
                                        {isSavingEntry ? 'SAVING...' : 'SAVE'}
                                     </button>
                                  </div>
                               </div>
                            ) : (
                               <div className="flex gap-4">
                                  <div className="flex-1 leading-relaxed">{k.content}</div>
                                  <div className="opacity-0 group-hover:opacity-100 transition-all flex gap-1">
                                    <button onClick={() => setEditingKnowledge({ id: k.id, content: k.content })} className="text-indigo-400 hover:text-indigo-600 shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => deleteRule("knowledge", k.id)} className="text-indigo-300 hover:text-indigo-600 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                                  </div>
                               </div>
                            )}
                         </div>
                       ))}
                     </div>
                     <div className="mt-4 pt-4 border-t border-ink/5">
                        <div className="flex gap-2">
                           <input 
                             type="text" 
                             value={newKnowledge} 
                             onChange={e => setNewKnowledge(e.target.value)}
                             onKeyDown={e => e.key === 'Enter' && saveManualEntry('knowledge', newKnowledge)}
                             placeholder="NEW FACT..." 
                             className="flex-1 p-2.5 brutal-border outline-none focus:bg-indigo-50 text-[9px] font-bold uppercase border-indigo-200"
                           />
                           <button 
                             onClick={() => saveManualEntry('knowledge', newKnowledge)} 
                             disabled={!newKnowledge || isSavingEntry}
                             className="brutal-btn !bg-indigo-500 !text-white !p-2.5 shadow-none border-indigo-600 disabled:opacity-50"
                           >
                             <Plus className="w-4 h-4" />
                           </button>
                        </div>
                     </div>
                   </section>
                 </div>
               </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
