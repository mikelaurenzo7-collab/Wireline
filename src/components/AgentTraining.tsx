import { useState, useEffect } from "react";
import { Send, Bot, User, CheckCircle2, Loader2, Users, Database, PlayCircle, MessageSquare, Trash2, Mail, Phone, Search, Activity, Plus, Pencil, Save, X, Sparkles, Terminal, ChevronRight, Zap, Target, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import SupervisedAgentTuner from "./SupervisedAgentTuner";
import { ClaudeRecipeButton } from "./ClaudeRecipes";

type Message = { role: "user" | "assistant"; content: string };

export default function AgentTraining() {
  const [activeTab, setActiveTab] = useState<'admin' | 'simulator' | 'database'>('admin');
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("default-agent");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "HUB CONNECTION ESTABLISHED. I am the Wireline Neural Liaison. Provide tactical directives or background intelligence to calibrate your fleet."
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [directives, setDirectives] = useState<any[]>([]);
  const [personality, setPersonality] = useState("");
  const [lessons, setLessons] = useState<any[]>([]);

  const [editingDirective, setEditingDirective] = useState<{ id: string; content: string } | null>(null);
  const [editingKnowledge, setEditingKnowledge] = useState<{ id: string; content: string } | null>(null);
  const [editingPersonality, setEditingPersonality] = useState(false);
  const [personalityDraft, setPersonalityDraft] = useState("");
  const [newDirective, setNewDirective] = useState("");
  const [newKnowledge, setNewKnowledge] = useState("");
  const [isSavingEntry, setIsSavingEntry] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optSuggestions, setOptSuggestions] = useState<any>(null);

  useEffect(() => {
    authFetch("/api/agents").then(res => res.json()).then(data => {
      setAgents(data.agents || []);
    });
    fetchKnowledge();
  }, [selectedAgentId]);

  const fetchKnowledge = async () => {
    try {
      const res = await authFetch(`/api/agent-config/${selectedAgentId}`);
      const data = await res.json();
      setKnowledge(data.knowledge || []);
      setDirectives(data.directives || []);
      setPersonality(data.personality || "");
      setPersonalityDraft(data.personality || "");
      setLessons(data.lessons || []);
    } catch(e) {}
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const currentInput = input;
    setInput("");
    
    setMessages(prev => [...prev, { role: "user", content: currentInput }]);
    setIsLoading(true);

    try {
      const res = await authFetch("/api/train/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: currentInput, agentId: selectedAgentId })
      });
      
      const data = await res.json();
      
      if (data.success) {
        setMessages(prev => [...prev, { role: "assistant", content: data.responseContent }]);
        fetchKnowledge();
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.error || "ERROR: PARSING FAILURE. RELAY INTERRUPTED." }]);
      }
    } catch(err) {
      setMessages(prev => [...prev, { role: "assistant", content: "CRITICAL ERROR: NEURAL LINK TIMEOUT." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteItem = async (id: string, type: 'knowledge' | 'directive') => {
     try {
       await authFetch(`/api/agent-config/${selectedAgentId}/${type}/${id}`, { method: 'DELETE' });
       fetchKnowledge();
     } catch(e) {}
  };

  const saveManualEntry = async (type: 'directive' | 'knowledge' | 'personality', content: string, overrideId?: string) => {
    if (!content.trim()) return;
    setIsSavingEntry(true);
    try {
        const resp = await authFetch(`/api/agent-config/${selectedAgentId}/manual`, {
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

  const handleOptimize = async () => {
    setIsOptimizing(true);
    setOptSuggestions(null);
    try {
      const res = await authFetch(`/api/agents/${selectedAgentId}/optimize`, { method: "POST" });
      const data = await res.json();
      setOptSuggestions(data);
    } catch (e) {
      console.error(e);
    }
    setIsOptimizing(false);
  };

  const applySuggestion = async (suggestion: string) => {
    await saveManualEntry('directive', suggestion);
    setOptSuggestions((prev: any) => ({
      ...prev,
      suggestions: prev.suggestions.filter((s: string) => s !== suggestion)
    }));
  };

  return (
    <div className="flex flex-col min-h-full bg-paper pb-40">
      <header className="p-8 md:p-12 border-b-8 border-ink bg-white sticky top-0 z-30 shadow-sm">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-10 max-w-[1400px] mx-auto w-full">
          <div className="space-y-6">
            <div className="flex items-center gap-4">
               <div className="bg-brand text-ink text-[10px] font-black px-3 py-1 uppercase tracking-widest brutal-border shadow-none italic font-display animate-pulse flex items-center gap-2">
                 <Terminal className="w-3 h-3" /> NEURAL LINK: ACTIVE
               </div>
               <div className="flex items-center gap-2 px-3 py-1 bg-ink text-brand brutal-border shadow-none">
                  <Activity className="w-3 h-3" />
                  <span className="text-[9px] font-black uppercase tracking-tighter italic">98.4% SYNC ACCURACY</span>
               </div>
            </div>
            <h1 className="text-4xl md:text-[6rem] font-black text-ink uppercase tracking-tighter font-display italic leading-[0.8]">
              TACTICAL<br />TRAINING
            </h1>
          </div>
          <div className="flex flex-col items-start lg:items-end gap-4 w-full lg:w-auto">
            <span className="text-[10px] uppercase font-black text-muted tracking-[0.4em] font-sans italic">NODE SELECTION</span>
            <div className="relative w-full lg:min-w-[400px]">
              <select 
                value={selectedAgentId} 
                onChange={e => setSelectedAgentId(e.target.value)}
                className="w-full pl-6 pr-12 h-16 bg-white border-4 border-ink font-black text-ink cursor-pointer hover:shadow-none translate-x-[-4px] translate-y-[-4px] hover:translate-x-0 hover:translate-y-0 transition-all outline-none appearance-none uppercase tracking-widest text-xs italic"
              >
                <option value="default-agent">GLOBAL FLEET DIRECTIVES</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name.toUpperCase()}</option>
                ))}
              </select>
              <Users className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-ink pointer-events-none" />
            </div>
          </div>
        </div>

      {/* Claude Brain rail — recipes scoped to the selected agent */}
      <div className="max-w-[1400px] mx-auto w-full mt-10">
        <div className="relative aurora-ring rounded-2xl">
          <div className="relative rounded-2xl glass p-5 flex flex-wrap items-center gap-3 overflow-hidden">
            <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-25 blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #C58BFF, transparent)" }} />
            <div className="relative z-10 flex items-center gap-3 mr-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7DF9FF, #C58BFF)" }}>
                <Sparkles className="w-4 h-4 text-paper" strokeWidth={2.5} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.4em] text-brand">Claude Brain</div>
                <div className="text-[11px] text-ink/60">Wire intelligent recipes into this agent.</div>
              </div>
            </div>
            <div className="relative z-10 flex flex-wrap items-center gap-2 ml-auto">
              <ClaudeRecipeButton recipe="agent-review" agentId={selectedAgentId !== 'default-agent' ? selectedAgentId : undefined} label="Performance Review" />
              <ClaudeRecipeButton recipe="persona-clone" agentId={selectedAgentId !== 'default-agent' ? selectedAgentId : undefined} label="Clone Persona" />
              <ClaudeRecipeButton recipe="knowledge-from-url" agentId={selectedAgentId !== 'default-agent' ? selectedAgentId : undefined} label="Ingest from URL" />
              <ClaudeRecipeButton recipe="knowledge-from-document" agentId={selectedAgentId !== 'default-agent' ? selectedAgentId : undefined} label="Ingest from PDF" />
              <ClaudeRecipeButton recipe="objection-drill" agentId={selectedAgentId !== 'default-agent' ? selectedAgentId : undefined} label="Objection Drills" />
              <ClaudeRecipeButton recipe="brief" agentId={selectedAgentId !== 'default-agent' ? selectedAgentId : undefined} label="Pre-Call Brief" />
            </div>
          </div>
        </div>
      </div>

      <nav className="flex flex-wrap gap-6 max-w-[1400px] mx-auto w-full mt-12 pt-8 border-t-2 border-ink/5">
           {[ 
             { id: 'admin', label: 'NEURAL RELAY', icon: MessageSquare },
             { id: 'database', label: 'DIRECTIVE REGISTRY', icon: Database },
             { id: 'simulator', label: 'MISSION SANDBOX', icon: PlayCircle }
           ].map((tab) => (
             <button 
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={cn(
                 "brutal-btn uppercase italic tracking-[0.2em] !py-4 !px-10 text-[11px] font-black flex items-center gap-4 transition-all",
                 activeTab === tab.id ? "bg-brand text-ink " : "bg-white text-muted border-zinc-200 shadow-none hover:border-ink hover:text-ink"
               )}
             >
               <tab.icon className="w-5 h-5" /> {tab.label}
             </button>
           ))}
        </nav>
      </header>

      <main className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          {activeTab === 'admin' && (
            <motion.div 
              key="admin"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-full bg-white max-w-[1200px] mx-auto w-full border-x-4 border-ink"
            >
               <div className="flex-1 overflow-y-auto p-10 md:p-14 space-y-12 pb-40 scrollbar-hide">
                {messages.map((msg, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    key={i} 
                    className={`flex gap-8 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                  >
                    <div className={`w-14 h-14 md:w-16 md:h-16 brutal-border flex items-center justify-center shrink-0 ${msg.role === "user" ? "bg-ink" : "bg-brand"}`}>
                      {msg.role === "user" ? <User className="w-7 h-7 text-white" /> : <Bot className="w-7 h-7 text-ink" />}
                    </div>
                    <div className={`flex max-w-[90%] md:max-w-[75%] ${msg.role === "user" ? "justify-end text-right" : "justify-start text-left"}`}>
                      <div className={cn(
                        "p-6 md:p-10 font-bold leading-relaxed  text-sm md:text-xl border-4 border-ink",
                        msg.role === "user" ? "bg-white text-ink" : "bg-zinc-50 text-ink italic font-display tracking-tight"
                      )}>
                        {msg.content.split('\n').map((line, lIdx) => (
                          <p key={lIdx} className={line.startsWith('>') || line.startsWith('**') ? 'mt-4 text-brand bg-ink px-4 py-2 border-l-4 border-brand' : ''}>
                             {line.replace('**', '').replace('>', '')}
                          </p>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-8">
                    <div className="w-16 h-16 brutal-border bg-brand flex items-center justify-center shrink-0">
                      <Bot className="w-8 h-8 text-ink" />
                    </div>
                    <div className="p-10 brutal-border bg-white flex items-center gap-6 text-ink italic border-4">
                      <Loader2 className="w-8 h-8 animate-spin text-brand" />
                      <span className="font-black uppercase tracking-[0.3em] text-sm italic">SYNAPSE EXTRACTION IN PROGRESS...</span>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="p-10 md:p-16 border-t-4 border-ink bg-white sticky bottom-0">
                <div className="flex items-center gap-6 bg-paper border-4 border-ink p-4 focus-within:bg-brand/5 transition-all group">
                  <Terminal className="w-8 h-8 text-muted ml-4" />
                  <input 
                    type="text" 
                    className="flex-1 bg-transparent px-4 py-6 outline-none text-ink font-black placeholder:text-muted/40 text-xl md:text-2xl uppercase tracking-tighter"
                    placeholder="ENTER TRAINING PROTOCOLS..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSend()}
                    disabled={isLoading}
                  />
                  <button 
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    className="w-20 h-20 bg-ink hover:bg-brand hover:text-ink disabled:bg-zinc-100 disabled:shadow-none text-brand flex items-center justify-center transition-all active:translate-x-1 active:translate-y-1 active:shadow-none"
                  >
                     <Send className="w-8 h-8" />
                  </button>
                </div>
                <p className="mt-8 text-center text-[10px] text-muted uppercase font-black tracking-[0.5em] italic">
                  ENCRYPTED UPLINK SECURE
                </p>
              </div>
            </motion.div>
          )}

          {activeTab === 'database' && (
            <motion.div 
              key="database"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="p-8 md:p-16 lg:p-24 bg-paper max-w-[1400px] mx-auto w-full pb-40 space-y-24"
            >
               {selectedAgentId !== 'default-agent' && (
                 <SupervisedAgentTuner agentId={selectedAgentId} />
               )}

               {/* Tactical Optimization Section */}
               <section className="space-y-12">
                  <header className="border-b-8 border-ink pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
                     <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-zinc-950 brutal-border flex items-center justify-center shadow-none border-4">
                           <Zap className="w-8 h-8 text-brand fill-current" />
                        </div>
                        <div>
                          <h3 className="text-4xl font-black text-ink uppercase tracking-tighter font-display italic leading-none">ANALYSIS ENGINE</h3>
                          <p className="text-[11px] font-black text-muted uppercase tracking-[0.4em] mt-3 italic">Autonomous mission pattern optimization</p>
                        </div>
                     </div>
                     <button 
                      onClick={handleOptimize}
                      disabled={isOptimizing}
                      className="brutal-btn !bg-ink !text-brand !py-4 !px-10 text-xs font-black uppercase flex items-center gap-4 group hover:!bg-brand hover:!text-ink"
                     >
                       {isOptimizing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Activity className="w-5 h-5" />}
                       {isOptimizing ? 'EXTRACTING LOGS...' : 'INITIATE ANALYSIS'}
                     </button>
                  </header>
                  
                  {optSuggestions && (
                    <motion.div 
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-brand/10 p-12 brutal-border border-zinc-950 border-4 relative"
                    >
                      <div className="absolute top-4 right-6 text-[10px] font-black text-zinc-950/20 uppercase tracking-[0.5em] italic">AI FEEDBACK LAYER</div>
                      <div className="md:col-span-3 mb-8">
                        <h4 className="text-[11px] font-black uppercase tracking-[0.4em] text-zinc-950 mb-4 opacity-40">Intelligence Narrative</h4>
                        <p className="text-2xl font-black text-ink italic leading-tight font-display bg-white/20 p-6 border-l-8 border-ink tracking-tight">"{optSuggestions.analysis}"</p>
                      </div>
                      <AnimatePresence>
                        {optSuggestions.suggestions?.length > 0 ? optSuggestions.suggestions.map((s: string, idx: number) => (
                          <motion.div 
                            key={idx} 
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="brutal-card bg-white !p-8 space-y-6 flex flex-col justify-between border-4 transition-all"
                          >
                            <p className="text-sm font-bold text-ink leading-relaxed uppercase tracking-tight italic">"{s}"</p>
                            <button 
                              onClick={() => applySuggestion(s)}
                              className="w-full brutal-btn !py-3 !bg-brand text-[10px] font-black uppercase tracking-widest"
                            >
                              DEPLOY DIRECTIVE
                            </button>
                          </motion.div>
                        )) : (
                          <div className="md:col-span-3 p-16 text-center text-muted font-black uppercase tracking-[0.4em] text-sm italic bg-white/10 brutal-border border-dashed border-4">
                             {optSuggestions.reason || "STRATEGY OPTIMAL. NO DRIFT DETECTED."}
                          </div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
               </section>

               {/* Core Identity Section */}
               <section className="space-y-12">
                  <header className="border-b-8 border-ink pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
                     <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-brand brutal-border flex items-center justify-center shadow-none border-4">
                           <Target className="w-8 h-8 text-ink fill-current" />
                        </div>
                        <div>
                          <h3 className="text-4xl font-black text-ink uppercase tracking-tighter font-display italic leading-none">NEURAL IDENTITY</h3>
                          <p className="text-[11px] font-black text-muted uppercase tracking-[0.4em] mt-3 italic">Base behavioral heuristics and tone</p>
                        </div>
                     </div>
                     {editingPersonality ? (
                        <div className="flex gap-4">
                          <button onClick={() => { setEditingPersonality(false); setPersonalityDraft(personality); }} className="brutal-btn !bg-white !py-3 !px-8 text-[10px] font-black uppercase">ABORT</button>
                          <button onClick={() => { saveManualEntry('personality', personalityDraft); setPersonality(personalityDraft); setEditingPersonality(false); }} className="brutal-btn !bg-ink !text-brand !py-3 !px-10 text-[10px] font-black uppercase">SYNC PROFILE</button>
                        </div>
                     ) : (
                        <button onClick={() => setEditingPersonality(true)} className="brutal-btn !bg-white !py-3 !px-8 text-[11px] font-black uppercase flex items-center gap-4 italic group">
                           <Pencil className="w-4 h-4 group-hover:rotate-12 transition-transform" /> RECONFIGURE PROFILE
                        </button>
                     )}
                  </header>
                  <div className="brutal-card bg-white !p-12 md:!p-20 relative overflow-hidden group">
                     <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:rotate-6 transition-transform">
                        <Zap className="w-64 h-64 text-brand" />
                     </div>
                     {editingPersonality ? (
                        <textarea 
                          value={personalityDraft} 
                          onChange={e => setPersonalityDraft(e.target.value)}
                          className="w-full min-h-[250px] p-8 brutal-border bg-paper font-black text-ink text-xl md:text-3xl focus:bg-brand/5 outline-none transition-all tracking-tighter italic border-4 uppercase"
                          placeholder="DEFIE THE CORE IDENTITY HEURISTICS..."
                        />
                     ) : (
                        <p className="text-2xl md:text-[3.5rem] font-black text-ink leading-[1.1] italic uppercase tracking-tighter relative z-10 font-display">
                          {personality ? `"${personality}"` : 'NO CORE IDENTITY DEFINED. NODE UNINITIALIZED.'}
                        </p>
                     )}
                  </div>
               </section>

               <div className="grid grid-cols-1 xl:grid-cols-2 gap-16 lg:gap-24">
                  <div className="space-y-12">
                     <header className="border-b-8 border-emerald-500 pb-8 flex items-center justify-between">
                        <div className="flex items-center gap-6">
                          <div className="w-14 h-14 bg-emerald-500 brutal-border flex items-center justify-center shadow-none border-4">
                             <CheckCircle2 className="w-8 h-8 text-white" />
                          </div>
                          <h3 className="text-3xl font-black text-ink uppercase tracking-tighter font-display italic">LOGIC REGISTRY</h3>
                        </div>
                        <div className="w-20 h-1 bg-emerald-100" />
                     </header>
                     <div className="space-y-10">
                        <div className="flex gap-6">
                            <input 
                              type="text" 
                              value={newDirective} 
                              onChange={e => setNewDirective(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && saveManualEntry('directive', newDirective)}
                              placeholder="INJECT NEW OPERATIONAL DIRECTIVE..." 
                              className="flex-1 p-6 brutal-border outline-none focus:bg-emerald-50 text-xs font-black uppercase tracking-widest border-4 border-ink shadow-none"
                            />
                            <button 
                              onClick={() => saveManualEntry('directive', newDirective)} 
                              disabled={!newDirective || isSavingEntry}
                              className="w-20 bg-emerald-500 text-white p-4 brutal-border active:translate-x-1 active:translate-y-1 transition-all shadow-none border-4 flex items-center justify-center disabled:opacity-50"
                            >
                              <Plus className="w-8 h-8" />
                            </button>
                        </div>
                        <AnimatePresence>
                          {directives.length === 0 ? (
                            <div className="brutal-card bg-white p-20 text-center text-muted font-black uppercase tracking-[0.4em] text-xs italic border-dashed border-4 opacity-50">REGISTRY DORMANT.</div>
                          ) : (
                            directives.map(d => (
                              <motion.div 
                                layout
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                key={d.id} 
                                className="brutal-card group hover:bg-brand transition-all !p-10 flex flex-col gap-8 bg-white border-4 relative overflow-hidden"
                              >
                                 {editingDirective?.id === d.id ? (
                                   <div className="space-y-4">
                                      <textarea 
                                        value={editingDirective.content} 
                                        onChange={e => setEditingDirective({ ...editingDirective, content: e.target.value })}
                                        className="w-full p-6 brutal-border bg-white outline-none focus:bg-zinc-50 min-h-[150px] font-black uppercase italic tracking-tighter border-4 text-lg"
                                      />
                                      <div className="flex justify-end gap-3">
                                         <button onClick={() => setEditingDirective(null)} className="brutal-btn !bg-white !py-2 !px-6 text-[10px] font-black">ABORT</button>
                                         <button 
                                           onClick={() => saveManualEntry('directive', editingDirective.content, d.id)} 
                                           disabled={isSavingEntry}
                                           className="brutal-btn !bg-ink !text-white !py-2 !px-6 text-[10px] font-black"
                                         >
                                            {isSavingEntry ? 'SYNCING...' : 'COMMIT'}
                                         </button>
                                      </div>
                                   </div>
                                 ) : (
                                   <div className="flex gap-8 items-start">
                                      <div className="flex-1">
                                         <div className="text-[10px] font-black text-muted group-hover:text-ink/60 uppercase tracking-[0.4em] mb-4 flex items-center gap-3 italic">
                                           <div className="w-2.5 h-2.5 bg-brand group-hover:bg-ink rounded-full animate-pulse" /> PRIORITY_{d.priority}
                                         </div>
                                         <div className="text-ink font-black text-xl md:text-2xl leading-none uppercase tracking-tighter font-display italic group-hover:drop-shadow-sm transition-all">{d.content}</div>
                                      </div>
                                      <div className="flex flex-col gap-3 group-hover:translate-x-0 translate-x-20 transition-transform duration-300">
                                         <button onClick={() => setEditingDirective({ id: d.id, content: d.content })} className="h-10 w-10 border-4 border-ink bg-white hover:bg-zinc-950 hover:text-brand flex items-center justify-center transition-all">
                                            <Pencil className="w-5 h-5" />
                                         </button>
                                         <button onClick={() => deleteItem(d.id, 'directive')} className="h-10 w-10 border-4 border-ink bg-white hover:bg-rose-500 hover:text-white transition-all">
                                            <Trash2 className="w-5 h-5" />
                                         </button>
                                      </div>
                                   </div>
                                 )}
                              </motion.div>
                            ))
                          )}
                        </AnimatePresence>
                     </div>
                  </div>

                  <div className="space-y-12">
                     <header className="border-b-8 border-azure pb-8 flex items-center justify-between" style={{ borderColor: '#3B82F6' }}>
                        <div className="flex items-center gap-6">
                          <div className="w-14 h-14 bg-blue-500 brutal-border flex items-center justify-center shadow-none border-4">
                             <Database className="w-8 h-8 text-white" />
                          </div>
                          <h3 className="text-3xl font-black text-ink uppercase tracking-tighter font-display italic">FACT ARCHIVE</h3>
                        </div>
                        <div className="w-20 h-1 bg-blue-100" />
                     </header>
                     <div className="space-y-10">
                        <div className="flex gap-6">
                            <input 
                              type="text" 
                              value={newKnowledge} 
                              onChange={e => setNewKnowledge(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && saveManualEntry('knowledge', newKnowledge)}
                              placeholder="SYNC NEW INTELLIGENCE DATA..." 
                              className="flex-1 p-6 brutal-border outline-none focus:bg-blue-50 text-xs font-black uppercase tracking-widest border-4 border-ink shadow-none"
                            />
                            <button 
                              onClick={() => saveManualEntry('knowledge', newKnowledge)} 
                              disabled={!newKnowledge || isSavingEntry}
                              className="w-20 bg-blue-500 text-white p-4 brutal-border active:translate-x-1 active:translate-y-1 transition-all shadow-none border-4 flex items-center justify-center disabled:opacity-50"
                            >
                              <Plus className="w-8 h-8" />
                            </button>
                        </div>
                        <AnimatePresence>
                          {knowledge.length === 0 ? (
                            <div className="brutal-card bg-white p-20 text-center text-muted font-black uppercase tracking-[0.4em] text-xs italic border-dashed border-4 opacity-50">ARCHIVE EMPTY.</div>
                          ) : (
                            knowledge.map(k => (
                              <motion.div 
                                layout
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                key={k.id} 
                                className="brutal-card group hover:bg-brand transition-all !p-10 flex flex-col gap-8 bg-white border-4 relative overflow-hidden"
                              >
                                 {editingKnowledge?.id === k.id ? (
                                   <div className="space-y-4">
                                      <textarea 
                                        value={editingKnowledge.content} 
                                        onChange={e => setEditingKnowledge({ ...editingKnowledge, content: e.target.value })}
                                        className="w-full p-6 brutal-border bg-white outline-none focus:bg-zinc-50 min-h-[150px] font-black uppercase italic tracking-tighter border-4 text-lg"
                                      />
                                      <div className="flex justify-end gap-3">
                                         <button onClick={() => setEditingKnowledge(null)} className="brutal-btn !bg-white !py-2 !px-6 text-[10px] font-black">ABORT</button>
                                         <button 
                                           onClick={() => saveManualEntry('knowledge', editingKnowledge.content, k.id)} 
                                           disabled={isSavingEntry}
                                           className="brutal-btn !bg-ink !text-white !py-2 !px-6 text-[10px] font-black"
                                         >
                                            {isSavingEntry ? 'SYNCING...' : 'COMMIT'}
                                         </button>
                                      </div>
                                   </div>
                                 ) : (
                                   <div className="flex gap-8 items-start">
                                      <div className="flex-1">
                                         <div className="text-ink font-black text-xl md:text-2xl leading-[1.1] uppercase tracking-tighter italic group-hover:drop-shadow-sm transition-all">{k.content}</div>
                                      </div>
                                      <div className="flex flex-col gap-3 group-hover:translate-x-0 translate-x-20 transition-transform duration-300">
                                         <button onClick={() => setEditingKnowledge({ id: k.id, content: k.content })} className="h-10 w-10 border-4 border-ink bg-white hover:bg-zinc-950 hover:text-brand flex items-center justify-center transition-all">
                                            <Pencil className="w-5 h-5" />
                                         </button>
                                         <button onClick={() => deleteItem(k.id, 'knowledge')} className="h-10 w-10 border-4 border-ink bg-white hover:bg-rose-500 hover:text-white transition-all">
                                            <Trash2 className="w-5 h-5" />
                                         </button>
                                      </div>
                                   </div>
                                 )}
                              </motion.div>
                            ))
                          )}
                        </AnimatePresence>
                     </div>
                  </div>
               </div>

                {/* Autonomous Learnings */}
                {lessons.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    className="space-y-16 mt-32 pt-32 border-t-8 border-ink border-dashed"
                  >
                     <header className="pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
                        <div className="flex items-center gap-8">
                          <div className="w-20 h-20 bg-brand brutal-border flex items-center justify-center shadow-none border-4">
                             <Sparkles className="w-10 h-10 text-ink fill-current" />
                          </div>
                          <div>
                            <h3 className="text-4xl font-black text-ink uppercase tracking-tighter font-display italic leading-none">AI AUTO-CALIBRATION</h3>
                            <p className="text-xs font-black text-muted uppercase tracking-[0.4em] mt-3 italic underline decoration-brand decoration-4 underline-offset-8">Skills synthesized from operational outcomes</p>
                          </div>
                        </div>
                        <div className="bg-emerald-500 text-white px-6 py-3 font-black text-[10px] uppercase tracking-[0.4em] brutal-border shadow-none border-4 italic">SYNTHETIC LEARNING ENGINE ACTIVE</div>
                     </header>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        {lessons.map(lesson => (
                           <div key={lesson.id} className="brutal-card bg-emerald-50 !border-emerald-500 !p-12 flex items-start gap-8 hover:translate-x-2 hover:translate-y-2 hover:shadow-none transition-all cursor-crosshair group relative overflow-hidden">
                              <div className="absolute -top-4 -right-4 italic font-black text-emerald-500/10 text-[8rem] select-none group-hover:rotate-12 transition-transform leading-none font-display uppercase tracking-tighter">SKILL</div>
                              <div className="mt-1 flex-shrink-0 relative z-10">
                                 <div className="w-12 h-12 brutal-border bg-white border-emerald-500 border-4 flex items-center justify-center shadow-none">
                                    <Sparkles className="w-6 h-6 text-emerald-600 fill-current" />
                                 </div>
                              </div>
                              <div className="relative z-10">
                                 <p className="text-[11px] text-emerald-700 font-black uppercase tracking-[0.4em] mb-4 italic">Heuristic Update Detected</p>
                                 <p className="text-emerald-950 font-black text-2xl leading-tight uppercase tracking-tighter italic font-display">{lesson.lesson}</p>
                                 <div className="flex items-center gap-4 mt-8 pt-6 border-t-2 border-emerald-200">
                                    <Clock className="w-4 h-4 text-emerald-500" />
                                    <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest opacity-80 italic">{new Date(lesson.created_at).toLocaleString().toUpperCase()}</p>
                                 </div>
                              </div>
                           </div>
                        ))}
                     </div>
                  </motion.div>
                )}
            </motion.div>
          )}

          {activeTab === 'simulator' && (
            <motion.div 
              key="simulator"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="min-h-screen bg-paper p-10 md:p-24 flex flex-col items-center justify-center"
            >
               <div className="w-full max-w-[1000px] bg-white brutal-card !p-16 md:!p-24 text-center border-ink border-8 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-8 bg-zinc-950 flex items-center px-6 gap-3">
                     <div className="w-3 h-3 rounded-full bg-rose-500" />
                     <div className="w-3 h-3 rounded-full bg-amber-500" />
                     <div className="w-3 h-3 rounded-full bg-emerald-500" />
                     <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.5em] ml-4 italic">SIMULATION_ENVIRONMENT_v4.0</span>
                  </div>
                  
                  <div className="w-32 h-32 bg-brand border-8 border-ink flex items-center justify-center mx-auto mb-14 group hover:rotate-90 transition-transform cursor-pointer">
                     <PlayCircle className="w-16 h-16 text-ink" />
                  </div>
                  <h2 className="text-5xl md:text-[6rem] font-black text-ink mb-10 tracking-tighter font-display uppercase italic leading-none">MISSION<br />SANDBOX</h2>
                  <p className="text-muted text-sm md:text-xl mb-12 md:mb-20 font-bold uppercase tracking-[0.4em] leading-relaxed max-w-3xl mx-auto italic underline decoration-brand decoration-8 underline-offset-[-2px]">
                    Validate neural directives and engagement patterns in a zero-risk air-gapped environment.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                     {[
                       { label: 'Voice Protocol', icon: Phone, desc: 'Simulate high-latency voice relays.' },
                       { label: 'Neural Relay', icon: Mail, desc: 'Pre-calculate automated signal replies.' }
                     ].map((sim) => (
                       <div key={sim.label} className="brutal-card !p-10 md:!p-14 bg-zinc-50 text-left border-dashed border-4 opacity-40 hover:opacity-100 transition-all cursor-not-allowed group">
                          <sim.icon className="w-12 h-12 md:w-16 md:h-16 text-ink mb-10 group-hover:text-brand transition-colors" />
                          <h4 className="font-black text-ink uppercase italic text-2xl md:text-3xl tracking-tighter mb-4">{sim.label}</h4>
                          <p className="text-[10px] text-muted font-black uppercase tracking-[0.3em] leading-relaxed italic">{sim.desc}</p>
                          <div className="mt-8 pt-8 border-t-2 border-ink/5">
                             <span className="text-[8px] font-black text-zinc-300 uppercase tracking-widest italic">STATUS: DORMANT / OFFLINE</span>
                          </div>
                       </div>
                     ))}
                  </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
