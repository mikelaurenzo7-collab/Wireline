import { useState, useEffect } from "react";
import { Send, Bot, User, CheckCircle2, Loader2, Users, Database, PlayCircle, MessageSquare, Trash2, Mail, Phone, Search, Activity, Plus, Pencil, Save, X, Sparkles } from "lucide-react";
import { cn } from "../lib/utils";

type Message = { role: "user" | "assistant"; content: string };

export default function AgentTraining() {
  const [activeTab, setActiveTab] = useState<'admin' | 'simulator' | 'database'>('admin');
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("default-agent");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello. I am the Wireline Admin AI. Tell me how you want your live agents to handle calls and emails, and I'll update their knowledge base instantly."
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [directives, setDirectives] = useState<any[]>([]);
  const [personality, setPersonality] = useState("");

  const [editingDirective, setEditingDirective] = useState<{ id: string; content: string } | null>(null);
  const [editingKnowledge, setEditingKnowledge] = useState<{ id: string; content: string } | null>(null);
  const [editingPersonality, setEditingPersonality] = useState(false);
  const [personalityDraft, setPersonalityDraft] = useState("");
  const [newDirective, setNewDirective] = useState("");
  const [newKnowledge, setNewKnowledge] = useState("");
  const [isSavingEntry, setIsSavingEntry] = useState(false);

  useEffect(() => {
    fetch("/api/agents").then(res => res.json()).then(data => {
      setAgents(data.agents || []);
    });
    fetchKnowledge();
  }, [selectedAgentId]);

  const fetchKnowledge = async () => {
    try {
      const [kRes, dRes] = await Promise.all([
        fetch(`/api/knowledge/${selectedAgentId}`),
        fetch(`/api/directives/${selectedAgentId}`)
      ]);
      const kData = await kRes.json();
      const dData = await dRes.json();
      setKnowledge(kData.knowledge || []);
      setDirectives(dData.directives || []);
      setPersonality(kData.personality || "");
      setPersonalityDraft(kData.personality || "");
    } catch(e) {}
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const currentInput = input;
    setInput("");
    
    setMessages(prev => [...prev, { role: "user", content: currentInput }]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userMessage: currentInput, agentId: selectedAgentId })
      });
      
      const data = await res.json();
      
      if (data.success) {
        const { directives: newDirs, knowledge: newKn, personality } = data.extracted;
        
        let responseContent = "I've successfully updated the agent's knowledge base!\n\n";
        if (newDirs?.length) responseContent += `**Added ${newDirs.length} Directive(s):**\n${newDirs.map((d:any) => `- [Priority ${d.priority}] ${d.content}`).join("\n")}\n\n`;
        if (newKn?.length) responseContent += `**Added ${newKn.length} Knowledge Fact(s):**\n${newKn.map((k:any) => `- ${k.content}`).join("\n")}\n\n`;
        if (personality) responseContent += `**Updated Personality Directive:**\n${personality}`;
        
        if (!newDirs?.length && !newKn?.length && !personality) {
           responseContent = "I analyzed that but couldn't extract any specific hard rules or new knowledge. Could you be more specific about what the agent should do?";
        }

        setMessages(prev => [...prev, { role: "assistant", content: responseContent }]);
        fetchKnowledge();
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error extracting directives. Please try again." }]);
      }
    } catch(err) {
      setMessages(prev => [...prev, { role: "assistant", content: "Error communicating with training server." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteItem = async (id: string, type: 'knowledge' | 'directive') => {
     try {
       await fetch(`/api/agent-config/${selectedAgentId}/${type}/${id}`, { method: 'DELETE' });
       fetchKnowledge();
     } catch(e) {}
  };

  const saveManualEntry = async (type: 'directive' | 'knowledge' | 'personality', content: string, overrideId?: string) => {
    if (!content.trim()) return;
    setIsSavingEntry(true);
    try {
        const resp = await fetch(`/api/agent-config/${selectedAgentId}/manual`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, content, overrideId })
        });
        if (resp.ok) {
            if (type === 'personality') {
                setPersonality(content);
                setEditingPersonality(false);
            } else {
                await fetchKnowledge();
                if (type === 'directive') { setEditingDirective(null); setNewDirective(""); }
                if (type === 'knowledge') { setEditingKnowledge(null); setNewKnowledge(""); }
            }
        }
    } catch (e) {
        console.error(e);
    }
    setIsSavingEntry(false);
  };

  return (
    <div className="flex flex-col min-h-full bg-[#FBFBFB]">
      <header className="p-4 md:p-6 lg:p-8 border-b-8 border-ink bg-white sticky top-0 z-30">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 max-w-7xl mx-auto w-full">
          <div>
            <div className="flex items-center gap-3 mb-2">
               <span className="bg-brand text-ink text-[10px] font-black px-2 py-0.5 uppercase tracking-widest brutal-border shadow-none italic font-display animate-pulse">Relay: Active</span>
               <div className="flex items-center gap-1.5 px-2 py-0.5 bg-ink text-brand brutal-border shadow-none">
                  <Activity className="w-3 h-3" />
                  <span className="text-[9px] font-black uppercase tracking-tighter italic">98.4% Accuracy</span>
               </div>
            </div>
            <h1 className="text-3xl md:text-5xl lg:text-7xl font-black text-ink uppercase tracking-tight font-display italic leading-none block">
              Fleet Intelligence
            </h1>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-2 w-full lg:w-auto">
            <span className="text-[10px] uppercase font-black text-slate-400 tracking-[0.3em] font-sans">Deployment Archive</span>
            <div className="relative w-full lg:min-w-[320px]">
              <select 
                value={selectedAgentId} 
                onChange={e => setSelectedAgentId(e.target.value)}
                className="w-full pl-4 pr-10 h-12 bg-brand border-4 border-ink font-black text-ink cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] outline-none appearance-none uppercase tracking-widest text-xs italic transition-transform active:translate-x-0.5 active:translate-y-0.5"
              >
                <option value="default-agent">GLOBAL FLEET DIRECTIVES</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name.toUpperCase()}</option>
                ))}
              </select>
              <Users className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink pointer-events-none" />
            </div>
          </div>
        </div>

      <nav className="flex flex-wrap gap-4 max-w-7xl mx-auto w-full mt-8">
           <button 
             onClick={() => setActiveTab('admin')}
             className={cn(
               "brutal-btn uppercase italic tracking-widest !py-3 !px-8 text-[10px] font-black flex items-center gap-3 transition-transform active:translate-x-1 active:translate-y-1",
               activeTab === 'admin' ? "bg-brand" : "bg-white"
             )}
           >
             <MessageSquare className="w-5 h-5" /> Operational Relay
           </button>
           <button 
             onClick={() => setActiveTab('database')}
             className={cn(
               "brutal-btn uppercase italic tracking-widest !py-3 !px-8 text-[10px] font-black flex items-center gap-3 transition-transform active:translate-x-1 active:translate-y-1",
               activeTab === 'database' ? "bg-brand" : "bg-white"
             )}
           >
             <Database className="w-5 h-5" /> Knowledge Base
           </button>
           <button 
             onClick={() => setActiveTab('simulator')}
             className={cn(
               "brutal-btn uppercase italic tracking-widest !py-3 !px-8 text-[10px] font-black flex items-center gap-3 transition-transform active:translate-x-1 active:translate-y-1",
               activeTab === 'simulator' ? "bg-brand" : "bg-white"
             )}
           >
             <PlayCircle className="w-5 h-5" /> Carrier Simulator
           </button>
        </nav>
      </header>

      <main className="flex-1 min-h-0 relative z-10">
        {activeTab === 'admin' && (
          <div className="flex flex-col h-full bg-white">
             <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 max-w-5xl mx-auto w-full pb-32">
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-3 md:gap-6 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-10 h-10 md:w-14 md:h-14 brutal-border flex items-center justify-center shrink-0 ${msg.role === "user" ? "bg-ink" : "bg-brand"}`}>
                    {msg.role === "user" ? <User className="w-5 h-5 md:w-7 md:h-7 text-white" /> : <Bot className="w-5 h-5 md:w-7 md:h-7 text-ink" />}
                  </div>
                  <div className={`flex max-w-[85%] md:max-w-[70%] ${msg.role === "user" ? "justify-end text-right" : "justify-start text-left"}`}>
                    <div className={cn(
                      "p-4 md:p-8 font-bold leading-relaxed brutal-border shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-xs md:text-base",
                      msg.role === "user" ? "bg-white text-ink" : "bg-white text-ink italic"
                    )}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-6">
                  <div className="w-14 h-14 brutal-border bg-brand flex items-center justify-center shrink-0">
                    <Bot className="w-7 h-7 text-ink" />
                  </div>
                  <div className="p-8 brutal-card bg-white flex items-center gap-4 text-ink italic">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="font-black uppercase tracking-widest text-xs">Extracting Directives & Patterns...</span>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 md:p-12 border-t-4 border-ink bg-white">
              <div className="flex items-center gap-4 md:gap-6 bg-slate-50 border-4 border-ink p-2 md:p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] focus-within:bg-brand/5 transition-colors group">
                <input 
                  type="text" 
                  className="flex-1 bg-transparent px-2 md:px-4 py-3 md:py-4 outline-none text-ink font-black placeholder:text-slate-400 text-sm md:text-lg uppercase tracking-tight"
                  placeholder="AGENT CONFIGURATION INSTRUCTIONS..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSend()}
                  disabled={isLoading}
                />
                <button 
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="w-12 h-12 md:w-16 md:h-16 bg-ink hover:bg-black disabled:bg-slate-200 disabled:shadow-none text-brand flex items-center justify-center transition-all group-active:translate-x-1 group-active:translate-y-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] md:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                >
                   <Send className="w-5 h-5 md:w-6 md:h-6" />
                </button>
              </div>
              <p className="mt-6 text-center text-[10px] text-slate-400 uppercase font-black tracking-[0.3em]">
                System Configuration Ready
              </p>
            </div>
          </div>
        )}

        {activeTab === 'database' && (
          <div className="p-4 md:p-12 lg:p-16 bg-[#FBFBFB] max-w-7xl mx-auto w-full pb-32 space-y-16">
             {/* Core Identity Section */}
             <section className="space-y-8">
                <header className="border-b-4 border-ink pb-6 flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-ink brutal-border flex items-center justify-center shadow-none">
                         <Sparkles className="w-5 h-5 text-brand" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-ink uppercase tracking-tight font-display italic">Core Identity</h3>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">The agent's primary personality and background</p>
                      </div>
                   </div>
                   {editingPersonality ? (
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingPersonality(false); setPersonalityDraft(personality); }} className="brutal-btn !bg-white !py-1 !px-3 text-[8px] font-black uppercase">Cancel</button>
                        <button onClick={() => { saveManualEntry('personality', personalityDraft); setPersonality(personalityDraft); setEditingPersonality(false); }} className="brutal-btn !bg-brand !py-1 !px-4 text-[8px] font-black uppercase">Save Identity</button>
                      </div>
                   ) : (
                      <button onClick={() => setEditingPersonality(true)} className="brutal-btn !bg-white !py-1.5 !px-4 text-[9px] font-black uppercase flex items-center gap-2">
                         <Pencil className="w-3 h-3" /> Edit Profile
                      </button>
                   )}
                </header>
                <div className="brutal-card bg-white !p-8 md:!p-12">
                   {editingPersonality ? (
                      <textarea 
                        value={personalityDraft} 
                        onChange={e => setPersonalityDraft(e.target.value)}
                        className="w-full min-h-[150px] p-6 brutal-border bg-slate-50 font-bold text-ink text-sm md:text-lg focus:bg-brand/5 outline-none transition-colors"
                        placeholder="Describe the agent's background, tone, and specific mannerisms..."
                      />
                   ) : (
                      <p className="text-sm md:text-xl font-bold text-ink leading-relaxed italic uppercase tracking-tight">
                        "{personality || 'No core identity defined for this agent fleet node.'}"
                      </p>
                   )}
                </div>
             </section>

             <div className="grid grid-cols-1 xl:grid-cols-2 gap-12 lg:gap-20">
                <div className="space-y-10">
                   <header className="border-b-4 border-emerald-500 pb-6 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-500 brutal-border flex items-center justify-center shadow-none">
                           <CheckCircle2 className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-xl font-black text-ink uppercase tracking-tight font-display italic">Operational Logic</h3>
                      </div>
                      <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">Rules Registry</span>
                   </header>
                   <div className="space-y-6">
                      <div className="flex gap-4">
                          <input 
                            type="text" 
                            value={newDirective} 
                            onChange={e => setNewDirective(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveManualEntry('directive', newDirective)}
                            placeholder="DEPLOY NEW DIRECTIVE..." 
                            className="flex-1 p-4 brutal-border outline-none focus:bg-emerald-50 text-[10px] font-black uppercase tracking-widest border-2 border-ink shadow-none"
                          />
                          <button 
                            onClick={() => saveManualEntry('directive', newDirective)} 
                            disabled={!newDirective || isSavingEntry}
                            className="bg-emerald-500 text-white p-4 brutal-border hover:translate-x-1 hover:translate-y-1 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1.5 active:translate-y-1.5 disabled:opacity-50"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                      </div>
                      {directives.length === 0 ? (
                        <div className="brutal-card bg-white p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs italic border-dashed">No behavior patterns stored.</div>
                      ) : (
                        directives.map(d => (
                          <div key={d.id} className="brutal-card group hover:bg-brand/5 transition-colors !p-8 flex flex-col gap-6 bg-white border-2">
                             {editingDirective?.id === d.id ? (
                               <div className="space-y-3">
                                  <textarea 
                                    value={editingDirective.content} 
                                    onChange={e => setEditingDirective({ ...editingDirective, content: e.target.value })}
                                    className="w-full p-3 brutal-border bg-white outline-none focus:bg-emerald-100 min-h-[100px] font-bold uppercase"
                                  />
                                  <div className="flex justify-end gap-2">
                                     <button onClick={() => setEditingDirective(null)} className="brutal-btn !bg-white !py-1 !px-3 text-[10px]">CANCEL</button>
                                     <button 
                                       onClick={() => saveManualEntry('directive', editingDirective.content, d.id)} 
                                       disabled={isSavingEntry}
                                       className="brutal-btn !bg-ink !text-white !py-1 !px-3 text-[10px]"
                                     >
                                        {isSavingEntry ? 'SAVING...' : 'SAVE'}
                                     </button>
                                  </div>
                               </div>
                             ) : (
                               <div className="flex gap-6">
                                  <div className="flex-1">
                                     <div className="text-[10px] font-black text-slate-400 group-hover:text-ink/60 uppercase tracking-widest mb-2 flex items-center gap-2">
                                       <div className="w-2 h-2 bg-brand group-hover:bg-ink rounded-full" /> Priority {d.priority}
                                     </div>
                                     <div className="text-ink font-bold text-lg leading-snug uppercase tracking-tight">{d.content}</div>
                                  </div>
                                  <div className="flex flex-col gap-2">
                                     <button onClick={() => setEditingDirective({ id: d.id, content: d.content })} className="h-8 w-8 border-2 border-ink bg-white hover:bg-emerald-50 flex items-center justify-center text-slate-300 hover:text-emerald-600 transition-all opacity-0 group-hover:opacity-100">
                                        <Pencil className="w-3.5 h-3.5" />
                                     </button>
                                     <button onClick={() => deleteItem(d.id, 'directive')} className="h-8 w-8 border-2 border-ink bg-white hover:bg-rose-50 flex items-center justify-center text-slate-300 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100">
                                        <Trash2 className="w-3.5 h-3.5" />
                                     </button>
                                  </div>
                               </div>
                             )}
                          </div>
                        ))
                      )}
                   </div>
                </div>

                <div className="space-y-10">
                   <header className="border-b-4 border-blue-500 pb-6 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-500 brutal-border flex items-center justify-center shadow-none">
                           <Database className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-xl font-black text-ink uppercase tracking-tight font-display italic">Grounding Facts</h3>
                      </div>
                      <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">Intelligence Vault</span>
                   </header>
                   <div className="space-y-6">
                      <div className="flex gap-4">
                          <input 
                            type="text" 
                            value={newKnowledge} 
                            onChange={e => setNewKnowledge(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveManualEntry('knowledge', newKnowledge)}
                            placeholder="DEPLOY NEW GROUNDING FACT..." 
                            className="flex-1 p-4 brutal-border outline-none focus:bg-blue-50 text-[10px] font-black uppercase tracking-widest border-2 border-ink shadow-none"
                          />
                          <button 
                            onClick={() => saveManualEntry('knowledge', newKnowledge)} 
                            disabled={!newKnowledge || isSavingEntry}
                            className="bg-blue-500 text-white p-4 brutal-border hover:translate-x-1 hover:translate-y-1 transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1.5 active:translate-y-1.5 disabled:opacity-50"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                      </div>
                      {knowledge.length === 0 ? (
                        <div className="brutal-card bg-white p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs italic border-dashed">Grounding vault is currently empty.</div>
                      ) : (
                        knowledge.map(k => (
                          <div key={k.id} className="brutal-card group hover:bg-brand/5 transition-colors !p-8 flex flex-col gap-6 bg-white border-2">
                             {editingKnowledge?.id === k.id ? (
                               <div className="space-y-3">
                                  <textarea 
                                    value={editingKnowledge.content} 
                                    onChange={e => setEditingKnowledge({ ...editingKnowledge, content: e.target.value })}
                                    className="w-full p-3 brutal-border bg-white outline-none focus:bg-blue-100 min-h-[100px]"
                                  />
                                  <div className="flex justify-end gap-2">
                                     <button onClick={() => setEditingKnowledge(null)} className="brutal-btn !bg-white !py-1 !px-3 text-[10px]">CANCEL</button>
                                     <button 
                                       onClick={() => saveManualEntry('knowledge', editingKnowledge.content, k.id)} 
                                       disabled={isSavingEntry}
                                       className="brutal-btn !bg-ink !text-white !py-1 !px-3 text-[10px]"
                                     >
                                        {isSavingEntry ? 'SAVING...' : 'SAVE'}
                                     </button>
                                  </div>
                               </div>
                             ) : (
                               <div className="flex gap-6">
                                  <div className="flex-1">
                                     <div className="text-ink font-bold text-lg leading-snug uppercase tracking-tight">{k.content}</div>
                                  </div>
                                  <div className="flex flex-col gap-2">
                                     <button onClick={() => setEditingKnowledge({ id: k.id, content: k.content })} className="h-8 w-8 border-2 border-ink bg-white hover:bg-blue-50 flex items-center justify-center text-slate-300 hover:text-blue-600 transition-all opacity-0 group-hover:opacity-100">
                                        <Pencil className="w-3.5 h-3.5" />
                                     </button>
                                     <button onClick={() => deleteItem(k.id, 'knowledge')} className="h-8 w-8 border-2 border-ink bg-white hover:bg-rose-50 flex items-center justify-center text-slate-300 hover:text-rose-600 transition-all opacity-0 group-hover:opacity-100">
                                        <Trash2 className="w-3.5 h-3.5" />
                                     </button>
                                  </div>
                               </div>
                             )}
                          </div>
                        ))
                      )}
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'simulator' && (
           <div className="h-full bg-[#FBFBFB] p-4 md:p-12 flex flex-col items-center justify-center">
              <div className="w-full max-w-4xl bg-white brutal-card !p-8 md:!p-16 text-center border-brand">
                 <div className="w-24 h-24 bg-brand border-4 border-ink flex items-center justify-center mx-auto mb-10 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                    <PlayCircle className="w-12 h-12 text-ink" />
                 </div>
                 <h2 className="text-3xl md:text-6xl font-black text-ink mb-6 tracking-tight font-display uppercase italic">Test Mode</h2>
                 <p className="text-slate-500 text-sm md:text-lg mb-8 md:mb-12 font-bold uppercase tracking-widest leading-loose max-w-2xl mx-auto">
                   Test your agent's knowledge and behavior in a safe sandbox environment.
                 </p>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="brutal-card !p-6 md:!p-10 bg-slate-50 text-left border-dashed opacity-50">
                       <Phone className="w-8 h-8 md:w-10 md:h-10 text-ink mb-6" />
                       <h4 className="font-black text-ink uppercase italic text-lg md:text-xl">Voice Call Test</h4>
                       <p className="text-[10px] text-slate-500 mt-4 font-bold uppercase tracking-widest leading-relaxed">Simulate voice interactions safely.</p>
                    </div>
                    <div className="brutal-card !p-6 md:!p-10 bg-slate-50 text-left border-dashed opacity-50">
                       <Mail className="w-8 h-8 md:w-10 md:h-10 text-ink mb-6" />
                       <h4 className="font-black text-ink uppercase italic text-lg md:text-xl">Email Draft Test</h4>
                       <p className="text-[10px] text-slate-500 mt-4 font-bold uppercase tracking-widest leading-relaxed">Preview automated follow-up emails.</p>
                    </div>
                 </div>
              </div>
           </div>
        )}
      </main>
    </div>
  );
}
