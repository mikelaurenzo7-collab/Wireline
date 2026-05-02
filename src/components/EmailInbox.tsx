import React, { useState, useEffect } from "react";
import { Mail, Send, Loader2, User, Search, Filter, History, ChevronRight, Inbox, CheckCircle2, RotateCw, Trash2, Bot, Phone, Terminal, Shield, Target, Zap, Activity, Signal, AtSign } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { ClaudeRecipeButton } from "./ClaudeRecipes";

export default function EmailInbox() {
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedThread, setSelectedThread] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");

  const fetchThreads = async () => {
    try {
      const res = await authFetch("/api/emails/threads");
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (e) {
      console.error("Failed to fetch threads:", e);
    } finally {
      setLoading(false);
    }
  };

  const syncInbox = async () => {
    setSyncing(true);
    try {
      await authFetch("/api/emails/sync", { method: "POST" });
      await fetchThreads();
    } catch (e) {
      console.error("Sync failed:", e);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchThreads();
  }, []);

  const [isDrafting, setIsDrafting] = useState(false);

  const fetchMessages = async (threadId: string) => {
    try {
       const res = await authFetch(`/api/emails/threads/${threadId}/messages`);
       const data = await res.json();
       setMessages(data.messages || []);
    } catch (e) {
       console.error("Failed to fetch messages:", e);
    }
  };

  const handleDraftAI = async () => {
     if (!selectedThread) return;
     setIsDrafting(true);
     try {
       // Prefer Claude (cached agent prefix + smarter persona handling).
       const claudeRes = await authFetch(`/api/claude/email-draft`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
            threadId: selectedThread.id,
            userInstructions: replyText || undefined,
         })
       });
       if (claudeRes.ok) {
         const data = await claudeRes.json();
         if (data.draft) { setReplyText(data.draft); return; }
       } else if (claudeRes.status !== 503) {
         const err = await claudeRes.json().catch(() => ({}));
         console.warn("Claude draft failed; falling back to Gemini:", err);
       }
       // Fallback: legacy Gemini draft.
       const res = await authFetch(`/api/emails/draft`, {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
             subject: selectedThread.subject,
             messages: messages,
             context: replyText
         })
       });
       const data = await res.json();
       if (data.draft) {
          setReplyText(data.draft);
       }
     } catch (e) {
       console.error("Draft fail:", e);
     } finally {
       setIsDrafting(false);
     }
  };

  useEffect(() => {
    if (selectedThread) {
      fetchMessages(selectedThread.id);
    }
  }, [selectedThread?.id]);

  const sendReply = async () => {
    if (!replyText.trim() || !selectedThread) return;
    try {
      await authFetch(`/api/emails/threads/${selectedThread.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyText })
      });
      setReplyText("");
      fetchMessages(selectedThread.id);
    } catch (e) {
      console.error("Reply failed:", e);
    }
  };

  const handlePhoneHandoff = async (thread: any) => {
    try {
      await authFetch('/api/fleet/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'email_thread',
          source_id: thread.thread_id || thread.id,
          target_channel: 'phone',
          customer_info: { email: thread.customer_email, subject: thread.subject },
          task_type: 'callback_required',
          description: `Manual handoff requested from inbox. Subject: ${thread.subject}`
        })
      });
      alert('SIGNAL_ROUTED_TO_VOICE_FLEET. UNIT_DEPLOYED.');
    } catch(e) {
      console.error(e);
      alert('ROUTING_FAILURE.');
    }
  };

  return (
    <div className="h-full flex flex-col space-y-12 md:space-y-16 pb-40 max-w-[1700px] mx-auto w-full p-8 md:p-12 lg:p-16">
      <header className="flex flex-col lg:flex-row lg:justify-between lg:items-end gap-10 border-b-8 border-ink pb-12">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
             <div className="bg-brand text-ink text-[10px] font-black px-3 py-1 uppercase tracking-widest brutal-border shadow-none italic font-display animate-pulse flex items-center gap-2">
               <AtSign className="w-3 h-3" /> RELAY_STATUS: SYNCED
             </div>
             <div className="flex items-center gap-2 px-3 py-1 bg-ink text-brand brutal-border shadow-none">
                <Inbox className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase tracking-tighter italic">BUFFER_LOAD: {threads.length} DATA_THREATS</span>
             </div>
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-black text-ink uppercase tracking-tighter font-display italic leading-[0.8]">
            SIGNAL<br />INBOX
          </h1>
          <p className="text-muted font-bold uppercase tracking-[0.4em] text-xs md:text-sm max-w-xl leading-relaxed italic underline decoration-brand decoration-4 underline-offset-[-2px]">
            Master intelligence relay for individual digital signal threads. Monitor or autonomous reply protocols.
          </p>
        </div>
        
        <div className="flex items-center gap-6 w-full lg:w-auto">
          <button 
            onClick={syncInbox} 
            disabled={syncing}
            className="brutal-btn flex items-center justify-center gap-4 !h-20 !px-12 bg-brand w-full lg:w-auto uppercase tracking-[0.3em] font-black italic hover:shadow-none translate-x-[-4px] translate-y-[-4px] hover:translate-x-0 hover:translate-y-0 active:translate-x-1 active:translate-y-1 transition-all"
          >
            {syncing ? <Loader2 className="w-6 h-6 animate-spin" /> : <RotateCw className="w-6 h-6 text-ink" />}
            <span className="text-sm">INITIATE_SYNC</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-12 min-h-0">
        {/* Thread List */}
        <aside className="w-full lg:w-[500px] flex flex-col bg-white brutal-border border-4 !p-0 overflow-hidden shrink-0 max-h-[850px]">
          <div className="p-8 border-b-4 border-ink flex items-center justify-between bg-zinc-950 text-white relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none group-hover:scale-110 transition-transform">
               <Signal className="w-20 h-20 text-brand" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.5em] italic flex items-center gap-4 relative z-10">
              <Inbox className="w-5 h-5 text-brand" /> DATA_THREADS_CATALOGUE
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto divide-y-4 divide-ink scrollbar-hide">
            <AnimatePresence mode="popLayout">
              {loading ? (
                <div className="p-32 text-center flex flex-col items-center gap-6">
                   <Loader2 className="w-12 h-12 animate-spin text-brand" />
                   <span className="text-[10px] font-black uppercase tracking-[0.4em] text-ink italic animate-pulse">EXTRACTING_THREADS...</span>
                </div>
              ) : threads.length === 0 ? (
                <div className="p-32 text-center text-muted font-black uppercase tracking-[0.4em] text-xs italic">ZERO_THREADS_DETECTED.</div>
              ) : threads.map(thread => (
                <motion.button 
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={thread.id}
                  onClick={() => setSelectedThread(thread)}
                  className={cn(
                    "w-full p-8 text-left hover:bg-brand transition-all flex gap-8 group items-start relative overflow-hidden text-ink",
                    selectedThread?.id === thread.id ? "bg-zinc-50 border-l-[12px] border-zinc-950" : "bg-white border-l-[12px] border-transparent"
                  )}
                >
                  <div className={cn(
                    "w-16 h-16 brutal-border border-2 bg-white flex items-center justify-center text-ink shrink-0 font-black font-display text-2xl group-hover:bg-zinc-950 group-hover:text-brand transition-all shadow-none",
                    selectedThread?.id === thread.id && "bg-zinc-950 text-brand"
                  )}>
                    {thread.customer_email[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0 relative z-10">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[9px] font-black text-muted uppercase tracking-[0.2em] truncate max-w-[200px] italic">{thread.customer_email}</span>
                      <span className="text-[9px] text-muted font-black uppercase tracking-tighter opacity-40 italic">{new Date(thread.last_message_at).toLocaleDateString()}</span>
                    </div>
                    <h4 className="font-black text-ink text-xl font-display uppercase tracking-tighter leading-none mb-3 group-hover:drop-shadow-sm truncate">
                      {thread.subject || "(SIGNAL_WITHOUT_SUBJECT)"}
                    </h4>
                    <div className="flex items-center gap-4">
                      <p className="text-[10px] font-bold text-muted group-hover:text-ink/60 uppercase tracking-tight truncate flex-1 leading-none italic">"{thread.summary || 'PENDING_ANALYSIS'}"</p>
                      <div className={cn(
                        "shrink-0 px-3 py-1 brutal-border border-2 shadow-none text-[10px] font-black italic",
                        (thread.lead_score || 0) >= 80 ? "bg-rose-500 text-white" :
                        (thread.lead_score || 0) >= 50 ? "bg-brand text-ink" :
                        "bg-white text-muted/30"
                      )}>
                        {thread.lead_score || 0}%_INTENT
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </aside>

        {/* Message View */}
        <main className={cn("flex-1 flex flex-col bg-white brutal-border border-4 !p-0 overflow-hidden relative ", !selectedThread ? "hidden lg:flex" : "flex")}>
          <AnimatePresence mode="wait">
            {selectedThread ? (
              <motion.div 
                key={selectedThread.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full flex flex-col"
              >
                <div className="p-10 md:p-14 border-b-4 border-ink bg-white sticky top-0 z-10 group">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-10">
                     <div className="flex items-center gap-10 md:gap-12 w-full md:w-auto">
                       <button className="lg:hidden w-12 h-12 brutal-border border-2 bg-brand text-ink flex items-center justify-center shadow-none" onClick={() => setSelectedThread(null)}>
                          <ChevronRight className="w-6 h-6 rotate-180" />
                       </button>
                       <div className={cn(
                          "w-20 h-20 md:w-24 md:h-24 brutal-border border-4 flex flex-col items-center justify-center font-black  shrink-0 transition-all group-hover:shadow-none",
                          (selectedThread.lead_score || 0) >= 80 ? "bg-rose-500 text-white" :
                          (selectedThread.lead_score || 0) >= 50 ? "bg-brand text-ink" :
                          "bg-paper text-muted"
                        )}>
                          <span className="text-[9px] uppercase tracking-widest leading-none mb-1 font-mono italic">INTENT</span>
                          <span className="text-4xl leading-none font-display italic font-black">{selectedThread.lead_score || 0}</span>
                       </div>
                       <div className="min-w-0">
                         <h2 className="text-3xl md:text-5xl font-black text-ink uppercase tracking-tighter font-display leading-[0.9] italic truncate">{selectedThread.subject}</h2>
                         <div className="text-[10px] md:text-xs font-black text-muted uppercase tracking-[0.4em] mt-4 flex items-center gap-4 truncate italic">
                           <User className="w-5 h-5 shrink-0 text-brand fill-ink" /> <span className="truncate">{selectedThread.customer_email}</span>
                         </div>
                       </div>
                     </div>
                     <div className="w-full md:w-auto flex flex-col items-stretch gap-3">
                       <ClaudeRecipeButton
                         recipe="summarize-thread"
                         threadId={selectedThread.id}
                         label="Summarize · Action Items"
                       />
                       <button
                         onClick={() => handlePhoneHandoff(selectedThread)}
                         className="brutal-btn !py-4 !px-8 text-xs font-black uppercase tracking-[0.3em] italic flex items-center justify-center gap-4 group transition-all"
                       >
                         <Phone className="w-5 h-5 group-hover:rotate-12 transition-transform" /> Route to Voice Fleet
                       </button>
                       <div className={cn(
                         "px-6 py-2 brutal-border border-4 shadow-none text-[10px] font-black uppercase tracking-[0.3em] flex items-center justify-center italic",
                         selectedThread.status === 'open' ? "bg-brand text-ink border-ink" : "bg-white text-muted border-zinc-200"
                       )}>
                         LIFECYCLE_STATE: {selectedThread.status}
                       </div>
                     </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-10 md:p-14 space-y-12 md:space-y-16 scrollbar-hide bg-paper">
                  <AnimatePresence>
                    {messages.map((msg, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: msg.role === 'ai' ? 20 : -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={msg.id || idx} 
                        className={cn("flex flex-col max-w-[95%] md:max-w-[85%]", msg.role === 'ai' ? "ml-auto items-end" : "items-start")}
                      >
                        <div className={cn(
                          "p-8 md:p-12 brutal-border border-4 font-bold leading-relaxed  relative overflow-hidden group",
                          msg.role === 'ai' 
                            ? "bg-zinc-950 text-white italic border-brand " 
                            : "bg-white text-ink"
                        )}>
                          {msg.role === 'ai' && (
                            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:rotate-6 transition-transform">
                               <Bot className="w-32 h-32 text-brand" />
                            </div>
                          )}
                          <div className={cn(
                            "text-[10px] uppercase font-black mb-6 flex items-center gap-3 italic tracking-[0.3em]",
                            msg.role === 'ai' ? "text-brand" : "text-muted"
                          )}>
                            {msg.role === 'ai' ? (
                               <><div className="w-2 h-2 bg-brand rounded-full animate-ping" /> NEURAL_RELAY_RESPONSE</>
                            ) : (
                               <><User className="w-3.5 h-3.5 fill-ink" /> SUBJECT_INPUT_FEED</>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap uppercase tracking-tight text-xl md:text-2xl font-display leading-[1.1] relative z-10">{msg.content}</p>
                        </div>
                        <span className={cn(
                          "text-[9px] font-black mt-6 uppercase tracking-[0.4em] italic opacity-40",
                          msg.role === 'ai' ? "text-right" : "text-left"
                        )}>
                          TEMPORAL_FIX: {new Date(msg.created_at).toLocaleTimeString().toUpperCase()}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                <div className="p-10 md:p-14 bg-white border-t-8 border-ink">
                  <div className="bg-paper brutal-border border-4 !p-6 flex flex-col group-focus-within:shadow-none transition-all">
                    <div className="flex items-center gap-4 mb-4 opacity-30 group-focus-within:opacity-100 transition-opacity">
                       <Terminal className="w-5 h-5 text-ink" />
                       <span className="text-[10px] font-black uppercase tracking-[0.5em] italic">RESPONSE_INTERFACE_v2.0</span>
                    </div>
                    <textarea 
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder="INSTRUCT_AGENT_OR_TYPE_DIRECT_RELAY..."
                      className="flex-1 p-6 md:p-10 min-h-[200px] outline-none font-black text-ink uppercase tracking-tighter text-2xl md:text-4xl resize-none bg-transparent placeholder:text-zinc-100 font-display italic leading-none"
                    />
                    <div className="flex flex-col xl:flex-row justify-between items-center gap-10 p-10 border-t-4 border-ink/5 pt-12">
                      <p className="text-[11px] font-black text-muted uppercase tracking-[0.3em] italic flex-1 max-w-xl leading-relaxed">
                        DIRECTIVES ARE ANALYZED IN REAL-TIME. AGENT WILL APPLY TRAINED HEURISTICS TO SYNTHESIZE OPTIMAL RESPONSE PATTERNS.
                      </p>
                      <div className="flex gap-6 w-full xl:w-auto">
                        <button 
                          onClick={handleDraftAI}
                          disabled={isDrafting}
                          className="brutal-btn !bg-zinc-100 !text-ink !py-4 !px-10 flex items-center justify-center gap-4 shadow-none border-4 disabled:opacity-50 group grow xl:grow-0"
                        >
                          {isDrafting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Bot className="w-6 h-6 group-hover:rotate-12 transition-transform" />} 
                          <span className="text-xs font-black uppercase tracking-[0.2em] italic">AI_SYNTHESIZE</span>
                        </button>
                        <button 
                          onClick={sendReply}
                          className="brutal-btn !bg-ink !text-brand !py-4 !px-12 flex items-center justify-center gap-6 group hover:shadow-none active:translate-x-1 active:translate-y-1 transition-all border-4 grow xl:grow-0"
                        >
                          <Send className="w-6 h-6 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" /> 
                          <span className="text-xs font-black uppercase tracking-[0.2em] italic">INITIATE_RELAY</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex-1 flex flex-col items-center justify-center p-24 text-center space-y-12"
              >
                <div className="w-32 h-32 md:w-48 md:h-48 bg-brand brutal-border border-8 flex items-center justify-center group hover:-rotate-6 transition-transform">
                  <Mail className="w-16 h-16 md:w-24 md:h-24 text-ink group-hover:scale-110 transition-transform" />
                </div>
                <div className="space-y-6">
                  <h3 className="text-4xl md:text-7xl font-black text-ink font-display uppercase italic tracking-tighter leading-none">SIGNAL<br />SELECTION</h3>
                  <p className="max-w-md font-bold text-muted uppercase tracking-[0.4em] text-xs md:text-sm leading-loose italic mx-auto underline decoration-brand decoration-4 underline-offset-[-2px]">
                    SELECT_AN_INCOMING_SIGNAL_THREAD_TO_MONITOR_OR_DEPLOY_AUTONOMOUS_REPLY_PROTOCOLS.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
