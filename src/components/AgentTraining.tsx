import { useState, useEffect } from "react";
import { Send, Bot, User, CheckCircle2, Loader2, Users, Database, PlayCircle, MessageSquare, Trash2, Mail, Phone, Search, Activity, Plus, Pencil, Save, X, Sparkles, Terminal, ChevronRight, ChevronDown, Zap, Target, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import SupervisedAgentTuner from "./SupervisedAgentTuner";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import { HelpTooltip } from "./HelpTooltip";

type Message = { role: "user" | "assistant"; content: string };

export default function AgentTraining() {
  const [activeTab, setActiveTab] = useState<'admin' | 'simulator' | 'database'>('admin');
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("default-agent");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Connected. Send instructions or background information to train your agent."
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
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 px-4 md:px-6 pt-4 pb-3 sticky top-0 z-30 backdrop-blur-xl bg-paper/70 border-b border-white/8">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 max-w-[1400px] mx-auto w-full">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <div className="text-[10px] uppercase tracking-[0.45em] text-brand/80 mb-1">Studio · Training</div>
              <h1 className="font-display italic lowercase text-3xl md:text-4xl text-ink leading-none">
                <span className="text-aurora">agent training</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <Users className="w-3.5 h-3.5 text-brand shrink-0" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted/70 hidden sm:inline">Agent</span>
            <div className="relative flex-1 lg:flex-none lg:min-w-[260px]">
              <select
                value={selectedAgentId}
                onChange={e => setSelectedAgentId(e.target.value)}
                className="w-full text-sm bg-black/30 border border-white/10 rounded-lg pl-3 pr-8 py-2 outline-none focus:border-brand/50 appearance-none cursor-pointer text-ink"
              >
                <option value="default-agent">Global fleet directives</option>
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Claude Brain rail — recipes scoped to the selected agent */}
        <div className="max-w-[1400px] mx-auto w-full mt-3">
          <div className="relative aurora-ring rounded-2xl">
            <div className="relative rounded-2xl glass p-3 flex flex-wrap items-center gap-2 overflow-hidden">
              <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-25 blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #C58BFF, transparent)" }} />
              <div className="relative z-10 flex items-center gap-2 mr-1">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #7DF9FF, #C58BFF)" }}>
                  <Sparkles className="w-3.5 h-3.5 text-paper" strokeWidth={2.5} />
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-[0.35em] text-brand">Wireline AI</div>
                  <div className="text-[10px] text-ink/60">Wire intelligent recipes into this agent.</div>
                </div>
              </div>
              <div className="relative z-10 flex flex-wrap items-center gap-1.5 ml-auto">
                <ClaudeRecipeButton variant="ghost" recipe="agent-review" agentId={selectedAgentId !== 'default-agent' ? selectedAgentId : undefined} label="Performance Review" />
                <ClaudeRecipeButton variant="ghost" recipe="persona-clone" agentId={selectedAgentId !== 'default-agent' ? selectedAgentId : undefined} label="Clone Persona" />
                <ClaudeRecipeButton variant="ghost" recipe="knowledge-from-url" agentId={selectedAgentId !== 'default-agent' ? selectedAgentId : undefined} label="Ingest URL" />
                <ClaudeRecipeButton variant="ghost" recipe="knowledge-from-document" agentId={selectedAgentId !== 'default-agent' ? selectedAgentId : undefined} label="Ingest PDF" />
                <ClaudeRecipeButton variant="ghost" recipe="objection-drill" agentId={selectedAgentId !== 'default-agent' ? selectedAgentId : undefined} label="Objection Drills" />
                <ClaudeRecipeButton variant="ghost" recipe="brief" agentId={selectedAgentId !== 'default-agent' ? selectedAgentId : undefined} label="Pre-Call Brief" />
              </div>
            </div>
          </div>
        </div>

        <nav className="flex flex-wrap gap-1.5 max-w-[1400px] mx-auto w-full mt-3">
          {[
            {
              id: 'admin',
              label: 'Neural relay',
              icon: MessageSquare,
              help: "Configure directives and knowledge that shape your agent's behavior",
            },
            {
              id: 'database',
              label: 'Directive registry',
              icon: Database,
              help: 'View and edit all training data stored for this agent',
            },
            {
              id: 'simulator',
              label: 'Mission sandbox',
              icon: PlayCircle,
              help: 'Test your agent with simulated conversations',
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "px-3 py-1.5 rounded-full border text-[10px] uppercase tracking-[0.25em] flex items-center gap-1.5 transition-colors",
                activeTab === tab.id
                  ? "bg-brand/15 border-brand/40 text-brand"
                  : "glass border-white/10 text-muted hover:border-white/20 hover:text-ink"
              )}
            >
              <tab.icon className="w-3 h-3" />
              <span>{tab.label}</span>
              <HelpTooltip content={tab.help} placement="top">
                <span className="w-4 h-4 rounded-full border border-current/30 text-[8px] flex items-center justify-center opacity-70 hover:opacity-100">
                  ?
                </span>
              </HelpTooltip>
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 min-h-0 relative">
        <AnimatePresence mode="wait">
          {activeTab === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col h-full"
            >
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                {messages.map((msg, i) => (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={i}
                    className={cn("flex gap-3", msg.role === "user" ? "flex-row-reverse" : "")}
                  >
                    <div className={cn(
                      "w-9 h-9 rounded-xl border flex items-center justify-center shrink-0",
                      msg.role === "user" ? "glass border-white/10 text-ink/70" : "glass border-brand/30 text-brand"
                    )}>
                      {msg.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                    </div>
                    <div className={cn(
                      "max-w-[80%] p-3 rounded-xl border text-[13px] leading-relaxed",
                      msg.role === "user"
                        ? "glass border-white/8 text-ink"
                        : "bg-brand/8 border-brand/20 text-ink font-display italic"
                    )}>
                      {msg.content.split('\n').map((line, lIdx) => (
                        <p key={lIdx} className={cn(lIdx > 0 && "mt-1.5", (line.startsWith('>') || line.startsWith('**')) && "text-brand")}>
                          {line.replace(/^\*\*/g, '').replace(/^>\s?/, '')}
                        </p>
                      ))}
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                    <div className="w-9 h-9 rounded-xl glass border border-brand/30 text-brand flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="p-3 bg-brand/8 border border-brand/20 rounded-xl flex items-center gap-2.5">
                      <Loader2 className="w-4 h-4 animate-spin text-brand" />
                      <span className="text-[10px] uppercase tracking-[0.4em] text-brand">Extracting…</span>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Input */}
              <div className="shrink-0 p-3 border-t border-white/8">
                <div className="flex items-center gap-2 glass border border-white/10 rounded-2xl px-3 py-1 focus-within:border-brand/30 transition-all">
                  <Terminal className="w-3.5 h-3.5 text-muted/60 shrink-0" />
                  <input
                    type="text"
                    className="flex-1 bg-transparent py-2.5 outline-none text-sm text-ink placeholder:text-muted/50"
                    placeholder="Enter training protocols…"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSend()}
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    className="w-8 h-8 rounded-full bg-brand/15 border border-brand/40 text-brand flex items-center justify-center hover:bg-brand/25 disabled:opacity-40 transition-all shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="mt-2 text-center text-[9px] uppercase tracking-[0.4em] text-muted/40">
                  Encrypted uplink secure
                </p>
              </div>
            </motion.div>
          )}

          {activeTab === 'database' && (
            <motion.div
              key="database"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="h-full overflow-y-auto scrollbar-hide p-4 space-y-4"
            >
              {selectedAgentId !== 'default-agent' && (
                <SupervisedAgentTuner agentId={selectedAgentId} />
              )}

              {/* Analysis Engine */}
              <section className="rounded-2xl glass border border-white/10 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl glass border border-brand/30 text-brand flex items-center justify-center shrink-0">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-display italic lowercase text-xl text-ink">analysis engine</h3>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70">Autonomous pattern optimization</p>
                    </div>
                  </div>
                  <button
                    onClick={handleOptimize}
                    disabled={isOptimizing}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand/40 bg-brand/8 text-brand text-[10px] uppercase tracking-[0.28em] hover:bg-brand/15 transition-all disabled:opacity-50"
                  >
                    {isOptimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
                    {isOptimizing ? 'Analyzing…' : 'Initiate analysis'}
                  </button>
                </div>
                {optSuggestions && (
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="space-y-3"
                  >
                    <div className="rounded-xl bg-black/20 border border-white/8 p-4">
                      <h4 className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mb-2">Intelligence narrative</h4>
                      <p className="font-display italic text-lg text-ink leading-snug">"{optSuggestions.analysis}"</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <AnimatePresence>
                        {optSuggestions.suggestions?.length > 0 ? optSuggestions.suggestions.map((s: string, idx: number) => (
                          <motion.div
                            key={idx}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="rounded-xl glass border border-white/10 p-3 flex flex-col justify-between gap-3"
                          >
                            <p className="text-sm text-ink/90 leading-relaxed">"{s}"</p>
                            <button
                              onClick={() => applySuggestion(s)}
                              className="w-full h-8 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-all"
                            >
                              Deploy directive
                            </button>
                          </motion.div>
                        )) : (
                          <div className="sm:col-span-3 py-8 text-center text-[10px] uppercase tracking-[0.4em] text-muted/60">
                            {optSuggestions.reason || "Strategy optimal. No drift detected."}
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
              </section>

              {/* Neural Identity */}
              <section className="rounded-2xl glass border border-white/10 p-4 relative overflow-hidden">
                <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, #C58BFF, transparent)" }} />
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl glass border border-brand-3/30 text-brand-3 flex items-center justify-center shrink-0">
                      <Target className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-display italic lowercase text-xl text-ink">neural identity</h3>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70">Base behavioral heuristics and tone</p>
                    </div>
                  </div>
                  {editingPersonality ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setEditingPersonality(false); setPersonalityDraft(personality); }}
                        className="h-8 px-3 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-muted hover:text-ink transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => saveManualEntry('personality', personalityDraft)}
                        className="h-8 px-3 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 transition-all"
                      >
                        Sync profile
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingPersonality(true)}
                      className="h-8 px-3 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-muted/80 hover:text-ink flex items-center gap-1.5 transition-all"
                    >
                      <Pencil className="w-3 h-3" /> Reconfigure
                    </button>
                  )}
                </div>
                <div className="relative z-10">
                  {editingPersonality ? (
                    <textarea
                      value={personalityDraft}
                      onChange={e => setPersonalityDraft(e.target.value)}
                      className="w-full min-h-[180px] p-3 rounded-xl bg-black/30 border border-white/10 text-sm text-ink outline-none focus:border-brand/50 resize-none leading-relaxed placeholder:text-muted/50"
                      placeholder="Define the core identity heuristics…"
                    />
                  ) : (
                    <div className="p-4 rounded-xl bg-black/20 border border-white/8">
                      <p className="font-display italic text-xl md:text-2xl text-ink leading-snug">
                        {personality
                          ? `"${personality}"`
                          : <span className="text-muted/60 not-italic text-base">No core identity defined. Node uninitialized.</span>
                        }
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* Directives + Knowledge */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Logic Registry */}
                <section className="rounded-2xl glass border border-white/10 p-3 flex flex-col">
                  <header className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/8">
                    <div>
                      <h3 className="font-display italic lowercase text-lg text-ink leading-none">logic registry</h3>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-0.5">Hard constraints</p>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-500 text-[9px] uppercase tracking-[0.25em] leading-none">Inviolable</span>
                  </header>
                  <div className="space-y-2 mb-3">
                    <AnimatePresence mode="popLayout">
                      {directives.length === 0 ? (
                        <div className="py-8 text-center text-[10px] uppercase tracking-[0.4em] text-muted/60">Registry dormant</div>
                      ) : directives.map(d => (
                        <motion.div
                          layout
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={d.id}
                          className="rounded-xl bg-rose-500/8 border border-rose-500/20 p-3 group"
                        >
                          {editingDirective?.id === d.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingDirective.content}
                                onChange={e => setEditingDirective({ ...editingDirective, content: e.target.value })}
                                className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-rose-400/50 text-ink min-h-[80px] resize-none"
                              />
                              <div className="flex justify-end gap-1.5">
                                <button onClick={() => setEditingDirective(null)} className="px-2.5 py-1 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-muted hover:text-ink">Cancel</button>
                                <button
                                  onClick={() => saveManualEntry('directive', editingDirective.content, d.id)}
                                  disabled={isSavingEntry}
                                  className="px-2.5 py-1 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 disabled:opacity-50"
                                >
                                  {isSavingEntry ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="text-[9px] uppercase tracking-[0.3em] text-muted/60 mb-1">Priority {d.priority}</div>
                                <div className="text-sm text-ink/90 leading-relaxed">{d.content}</div>
                              </div>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
                                <button onClick={() => setEditingDirective({ id: d.id, content: d.content })} className="w-6 h-6 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-ink hover:border-white/30"><Pencil className="w-3 h-3" /></button>
                                <button onClick={() => deleteItem(d.id, 'directive')} className="w-6 h-6 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-rose-500 hover:border-rose-500/30"><Trash2 className="w-3 h-3" /></button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                  <div className="mt-auto pt-3 border-t border-white/8 space-y-1.5">
                    <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Add directive</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newDirective}
                        onChange={e => setNewDirective(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveManualEntry('directive', newDirective)}
                        placeholder="Inject new operational directive…"
                        className="flex-1 text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-rose-400/50 text-ink placeholder:text-muted/50"
                      />
                      <button
                        onClick={() => saveManualEntry('directive', newDirective)}
                        disabled={!newDirective || isSavingEntry}
                        className="w-9 h-9 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-500 flex items-center justify-center hover:bg-rose-500/25 disabled:opacity-50 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </section>

                {/* Fact Archive */}
                <section className="rounded-2xl glass border border-white/10 p-3 flex flex-col">
                  <header className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-white/8">
                    <div>
                      <h3 className="font-display italic lowercase text-lg text-ink leading-none">fact archive</h3>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-0.5">Knowledge base</p>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[9px] uppercase tracking-[0.25em] leading-none">Factual</span>
                  </header>
                  <div className="space-y-2 mb-3">
                    <AnimatePresence mode="popLayout">
                      {knowledge.length === 0 ? (
                        <div className="py-8 text-center text-[10px] uppercase tracking-[0.4em] text-muted/60">Archive empty</div>
                      ) : knowledge.map(k => (
                        <motion.div
                          layout
                          initial={{ opacity: 0, x: 6 }}
                          animate={{ opacity: 1, x: 0 }}
                          key={k.id}
                          className="rounded-xl bg-blue-500/8 border border-blue-500/20 p-3 group"
                        >
                          {editingKnowledge?.id === k.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingKnowledge.content}
                                onChange={e => setEditingKnowledge({ ...editingKnowledge, content: e.target.value })}
                                className="w-full text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-blue-400/50 text-ink min-h-[80px] resize-none"
                              />
                              <div className="flex justify-end gap-1.5">
                                <button onClick={() => setEditingKnowledge(null)} className="px-2.5 py-1 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.25em] text-muted hover:text-ink">Cancel</button>
                                <button
                                  onClick={() => saveManualEntry('knowledge', editingKnowledge.content, k.id)}
                                  disabled={isSavingEntry}
                                  className="px-2.5 py-1 rounded-full bg-brand/15 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.25em] hover:bg-brand/25 disabled:opacity-50"
                                >
                                  {isSavingEntry ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2 items-start justify-between">
                              <div className="flex-1 text-sm text-ink/90 leading-relaxed">{k.content}</div>
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
                                <button onClick={() => setEditingKnowledge({ id: k.id, content: k.content })} className="w-6 h-6 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-ink hover:border-white/30"><Pencil className="w-3 h-3" /></button>
                                <button onClick={() => deleteItem(k.id, 'knowledge')} className="w-6 h-6 rounded-full glass border border-white/10 flex items-center justify-center text-muted hover:text-blue-400 hover:border-blue-500/30"><Trash2 className="w-3 h-3" /></button>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                  <div className="mt-auto pt-3 border-t border-white/8 space-y-1.5">
                    <label className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Add fact</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newKnowledge}
                        onChange={e => setNewKnowledge(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveManualEntry('knowledge', newKnowledge)}
                        placeholder="Sync new intelligence data…"
                        className="flex-1 text-sm bg-black/30 border border-white/10 rounded-lg px-3 py-2 outline-none focus:border-blue-400/50 text-ink placeholder:text-muted/50"
                      />
                      <button
                        onClick={() => saveManualEntry('knowledge', newKnowledge)}
                        disabled={!newKnowledge || isSavingEntry}
                        className="w-9 h-9 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center hover:bg-blue-500/25 disabled:opacity-50 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </section>
              </div>

              {/* AI Auto-Calibration */}
              {lessons.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-2xl glass border border-white/10 p-4"
                >
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, #7DF9FF, #C58BFF)" }}>
                      <Sparkles className="w-3.5 h-3.5 text-paper" strokeWidth={2.5} />
                    </div>
                    <div>
                      <h3 className="font-display italic lowercase text-lg text-ink leading-none">ai auto-calibration</h3>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-emerald-500">Synthetic learning engine active</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {lessons.map(lesson => (
                      <div key={lesson.id} className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-3">
                        <div className="text-[9px] uppercase tracking-[0.3em] text-emerald-500 mb-2 flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3" /> Heuristic update detected
                        </div>
                        <p className="text-sm text-ink/90 leading-relaxed">{lesson.lesson}</p>
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/8">
                          <Clock className="w-3 h-3 text-muted/60" />
                          <span className="text-[9px] uppercase tracking-[0.3em] text-muted/60">{new Date(lesson.created_at).toLocaleDateString()}</span>
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
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="h-full flex items-center justify-center p-6"
            >
              <div className="max-w-[560px] w-full text-center space-y-6">
                <div className="relative w-24 h-24 rounded-3xl glass border border-white/10 flex items-center justify-center mx-auto">
                  <div className="absolute inset-0 rounded-3xl opacity-20 blur-xl" style={{ background: "radial-gradient(circle, #7DF9FF, transparent)" }} />
                  <PlayCircle className="w-12 h-12 text-brand relative z-10" strokeWidth={1.25} />
                </div>
                <div>
                  <h2 className="font-display italic lowercase text-4xl text-ink mb-2">mission sandbox</h2>
                  <p className="text-muted/70 text-sm leading-relaxed max-w-md mx-auto">
                    Validate neural directives and engagement patterns in a zero-risk isolated environment.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: 'Voice Protocol', icon: Phone, desc: 'Simulate high-latency voice relay exchanges' },
                    { label: 'Neural Relay',   icon: Mail, desc: 'Pre-calculate automated signal replies' }
                  ].map((sim) => (
                    <div key={sim.label} className="rounded-xl glass border border-white/8 border-dashed p-4 text-left opacity-50 cursor-not-allowed">
                      <sim.icon className="w-5 h-5 text-muted mb-2" />
                      <h4 className="font-display italic lowercase text-base text-ink mb-1">{sim.label.toLowerCase()}</h4>
                      <p className="text-[11px] text-muted/70 leading-relaxed">{sim.desc}</p>
                      <div className="mt-3 text-[9px] uppercase tracking-[0.3em] text-muted/50">Dormant · Offline</div>
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
