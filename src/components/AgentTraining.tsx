import { useState, useEffect } from "react";
import { Send, Bot, User, CheckCircle2, Loader2, Users, Database, PlayCircle, MessageSquare, Trash2, Mail, Phone, Search } from "lucide-react";
import { cn } from "../lib/utils";

type Message = { role: "user" | "assistant"; content: string };

export default function AgentTraining() {
  const [activeTab, setActiveTab] = useState<'admin' | 'simulator' | 'database'>('admin');
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("default-agent");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hello. I am the Wireline Admin AI. Tell me how you want your live agents to handle calls and emails, and I'll update their memory banks instantly."
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [directives, setDirectives] = useState<any[]>([]);

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
        
        let responseContent = "I've successfully updated the agent's memory bank!\n\n";
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

  return (
    <div className="flex flex-col h-full bg-[#FBFBFB]">
      <header className="p-6 md:p-12 border-b-4 border-ink bg-white">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 mb-8 md:mb-12">
          <div>
            <div className="flex items-center gap-2 mb-4">
               <span className="bg-brand text-ink text-[8px] md:text-[10px] font-black px-2 py-0.5 uppercase tracking-widest brutal-border shadow-none italic">AI Management</span>
            </div>
            <h1 className="text-3xl md:text-7xl font-black text-ink uppercase tracking-tight font-display italic leading-none">
              Agent Training
            </h1>
            <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[8px] md:text-xs mt-3 leading-relaxed">Customize agent behavior and manage their knowledge base.</p>
          </div>
          <div className="flex flex-col items-end gap-2 w-full lg:w-auto">
            <span className="text-[10px] uppercase font-black text-slate-400 tracking-[0.2em]">Select Agent</span>
            <div className="relative w-full lg:min-w-[400px]">
              <select 
                value={selectedAgentId} 
                onChange={e => setSelectedAgentId(e.target.value)}
                className="w-full pl-6 pr-12 py-4 bg-brand border-4 border-ink font-black text-ink cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] outline-none appearance-none uppercase tracking-widest text-sm italic"
              >
                <option value="default-agent">General Knowledge</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <Users className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-ink pointer-events-none" />
            </div>
          </div>
        </div>

        <nav className="flex flex-wrap gap-4">
           <button 
             onClick={() => setActiveTab('admin')}
             className={cn(
               "brutal-btn uppercase italic tracking-widest !py-3 !px-8 text-xs flex items-center gap-3",
               activeTab === 'admin' ? "bg-brand" : "bg-white"
             )}
           >
             <MessageSquare className="w-5 h-5" /> Intelligence Loop
           </button>
           <button 
             onClick={() => setActiveTab('database')}
             className={cn(
               "brutal-btn uppercase italic tracking-widest !py-3 !px-8 text-xs flex items-center gap-3",
               activeTab === 'database' ? "bg-brand" : "bg-white"
             )}
           >
             <Database className="w-5 h-5" /> Memory Vault
           </button>
           <button 
             onClick={() => setActiveTab('simulator')}
             className={cn(
               "brutal-btn uppercase italic tracking-widest !py-3 !px-8 text-xs flex items-center gap-3",
               activeTab === 'simulator' ? "bg-brand" : "bg-white"
             )}
           >
             <PlayCircle className="w-5 h-5" /> Signal Simulation
           </button>
        </nav>
      </header>

      <main className="flex-1 overflow-hidden relative">
        {activeTab === 'admin' && (
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-4 md:p-12 space-y-8 md:space-y-10">
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
                  placeholder="DIRECTIONS..."
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
                Neural Training Interface Synchronized
              </p>
            </div>
          </div>
        )}

        {activeTab === 'database' && (
          <div className="h-full p-12 overflow-y-auto bg-[#FBFBFB]">
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                <div className="space-y-6">
                   <h3 className="text-xl font-black text-ink uppercase tracking-tight font-display italic flex items-center gap-3">
                     <CheckCircle2 className="w-6 h-6 text-emerald-500" /> Operational Logic
                   </h3>
                   <div className="space-y-4">
                      {directives.length === 0 ? (
                        <div className="brutal-card bg-white p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs italic">No logic patterns extracted yet.</div>
                      ) : (
                        directives.map(d => (
                          <div key={d.id} className="brutal-card group hover:bg-brand transition-colors !p-6 flex gap-6 bg-white">
                             <div className="flex-1">
                                <div className="text-[10px] font-black text-slate-400 group-hover:text-ink/60 uppercase tracking-widest mb-2 flex items-center gap-2">
                                  <div className="w-2 h-2 bg-brand group-hover:bg-ink rounded-full" /> Priority {d.priority}
                                </div>
                                <div className="text-ink font-bold text-lg leading-snug uppercase tracking-tight">{d.content}</div>
                             </div>
                             <button onClick={() => deleteItem(d.id, 'directive')} className="h-10 w-10 border-2 border-ink bg-white hover:bg-rose-50 flex items-center justify-center text-slate-300 hover:text-rose-600 transition-all">
                                <Trash2 className="w-5 h-5" />
                             </button>
                          </div>
                        ))
                      )}
                   </div>
                </div>

                <div className="space-y-6">
                   <h3 className="text-xl font-black text-ink uppercase tracking-tight font-display italic flex items-center gap-3">
                     <Database className="w-6 h-6 text-blue-500" /> Grounding Facts
                   </h3>
                   <div className="space-y-4">
                      {knowledge.length === 0 ? (
                        <div className="brutal-card bg-white p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-xs italic">Memory vault is currently empty.</div>
                      ) : (
                        knowledge.map(k => (
                          <div key={k.id} className="brutal-card group hover:bg-brand transition-colors !p-6 flex gap-6 bg-white">
                             <div className="flex-1">
                                <div className="text-ink font-bold text-lg leading-snug uppercase tracking-tight">{k.content}</div>
                             </div>
                             <button onClick={() => deleteItem(k.id, 'knowledge')} className="h-10 w-10 border-2 border-ink bg-white hover:bg-rose-50 flex items-center justify-center text-slate-300 hover:text-rose-600 transition-all">
                                <Trash2 className="w-5 h-5" />
                             </button>
                          </div>
                        ))
                      )}
                   </div>
                </div>
             </div>
          </div>
        )}

        {activeTab === 'simulator' && (
           <div className="h-full bg-[#FBFBFB] p-12 flex flex-col items-center justify-center">
              <div className="w-full max-w-4xl bg-white brutal-card !p-16 text-center border-brand">
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
