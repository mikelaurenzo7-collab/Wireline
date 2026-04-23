import React, { useState, useEffect } from "react";
import { Mail, Send, Loader2, User, Search, Filter, History, ChevronRight, Inbox, CheckCircle2, RotateCw, Trash2, Bot } from "lucide-react";
import { cn } from "../lib/utils";

export default function EmailInbox() {
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedThread, setSelectedThread] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");

  const fetchThreads = async () => {
    try {
      const res = await fetch("/api/emails/threads");
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
      await fetch("/api/emails/sync", { method: "POST" });
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

  const fetchMessages = async (threadId: string) => {
    try {
       const res = await fetch(`/api/emails/threads/${threadId}/messages`);
       const data = await res.json();
       setMessages(data.messages || []);
    } catch (e) {
       console.error("Failed to fetch messages:", e);
    }
  };

  useEffect(() => {
    if (selectedThread) {
      fetchMessages(selectedThread.id);
    }
  }, [selectedThread]);

  const sendReply = async () => {
    if (!replyText.trim() || !selectedThread) return;
    try {
      await fetch(`/api/emails/threads/${selectedThread.id}/reply`, {
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

  return (
    <div className="h-full flex flex-col space-y-8 md:space-y-12 pb-24 p-4 md:p-0">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 border-b-4 border-ink pb-8 md:pb-12">
        <div>
          <div className="flex items-center gap-2 mb-4">
             <span className="bg-brand text-ink text-[10px] font-black px-2 py-0.5 uppercase tracking-widest brutal-border shadow-none italic font-sans italic">Inbox Status</span>
          </div>
          <h1 className="text-4xl md:text-7xl font-black text-ink uppercase tracking-tight font-display italic leading-none">
            Email Inbox
          </h1>
          <p className="text-slate-500 font-bold uppercase tracking-[0.2em] text-[8px] md:text-xs mt-3 leading-relaxed">Manage your emails and AI-generated responses.</p>
        </div>
        
        <div className="flex items-center gap-4 w-full lg:w-auto">
          <button 
            onClick={syncInbox} 
            disabled={syncing}
            className="brutal-btn flex items-center justify-center gap-3 !py-3 !px-6 bg-brand w-full lg:w-auto"
          >
            {syncing ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCw className="w-5 h-5 text-ink" />}
            <span className="text-xs md:text-sm">SYNC INBOX</span>
          </button>
        </div>
      </div>

      <div className="flex-1 flex gap-10 min-h-0">
        {/* Thread List */}
        <div className="w-[440px] flex flex-col bg-white brutal-border !p-0 overflow-hidden shrink-0">
          <div className="p-6 border-b-2 border-ink flex items-center justify-between bg-zinc-950 text-white">
            <span className="text-xs font-black uppercase tracking-widest flex items-center gap-3">
              <Inbox className="w-5 h-5 text-brand" /> Email Threads
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto divide-y-2 divide-ink">
            {loading ? (
              <div className="p-24 text-center"><Loader2 className="w-12 h-12 animate-spin text-brand mx-auto" /></div>
            ) : threads.length === 0 ? (
              <div className="p-24 text-center text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] italic">No active signals detected.</div>
            ) : threads.map(thread => (
              <button 
                key={thread.id}
                onClick={() => setSelectedThread(thread)}
                className={cn(
                  "w-full p-6 text-left hover:bg-brand/5 transition-all flex gap-5 group items-start relative overflow-hidden",
                  selectedThread?.id === thread.id && "bg-brand/10"
                )}
              >
                <div className="w-14 h-14 brutal-border bg-white flex items-center justify-center text-ink shrink-0 font-black font-display text-xl group-hover:bg-brand transition-colors">
                  {thread.customer_email[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 relative z-10">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate max-w-[200px]">{thread.customer_email}</span>
                    <span className="text-[9px] text-slate-500 font-black uppercase">{new Date(thread.last_message_at).toLocaleDateString()}</span>
                  </div>
                  <h4 className="font-black text-ink text-lg font-display uppercase tracking-tight leading-none mb-2">
                    {thread.subject || "(NO SUBJECT)"}
                  </h4>
                  <div className="flex items-center gap-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate flex-1">{thread.summary || "ANALYSIS IN PROGRESS..."}</p>
                    <span className={cn(
                      "shrink-0 px-2 py-0.5 brutal-border shadow-none text-[8px] font-black",
                      (thread.lead_score || 0) >= 80 ? "bg-rose-500 text-white" :
                      (thread.lead_score || 0) >= 50 ? "bg-brand text-ink" :
                      "bg-white text-slate-400"
                    )}>
                      {thread.lead_score || 0}%
                    </span>
                  </div>
                </div>
                {selectedThread?.id === thread.id && (
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-ink" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Message View */}
        <div className="flex-1 flex flex-col bg-white brutal-border !p-0 overflow-hidden relative">
          {selectedThread ? (
            <>
              <div className="p-10 border-b-2 border-ink bg-white sticky top-0 z-10">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-8">
                     <div className={cn(
                        "w-20 h-20 brutal-border flex flex-col items-center justify-center font-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
                        (selectedThread.lead_score || 0) >= 80 ? "bg-rose-500 text-white" :
                        (selectedThread.lead_score || 0) >= 50 ? "bg-brand text-ink" :
                        "bg-white text-slate-400"
                      )}>
                        <span className="text-[9px] uppercase tracking-tighter leading-none mb-1">INTENT</span>
                        <span className="text-3xl leading-none font-display italic">{selectedThread.lead_score || 0}</span>
                     </div>
                     <div>
                       <h2 className="text-3xl font-black text-ink uppercase tracking-tight font-display leading-tight italic">{selectedThread.subject}</h2>
                       <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2 flex items-center gap-3">
                         <User className="w-4 h-4" /> {selectedThread.customer_email}
                       </p>
                     </div>
                   </div>
                   <div>
                     <span className={cn(
                       "px-4 py-2 brutal-border shadow-none text-xs font-black uppercase tracking-widest",
                       selectedThread.status === 'open' ? "bg-emerald-500 text-white border-ink" : "bg-white text-slate-400 border-ink"
                     )}>
                       STATUS: {selectedThread.status}
                     </span>
                   </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-12 space-y-12">
                {messages.map(msg => (
                  <div key={msg.id} className={cn("flex flex-col max-w-[80%]", msg.role === 'ai' ? "ml-auto items-end" : "items-start")}>
                    <div className={cn(
                      "p-8 brutal-border font-bold leading-relaxed shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
                      msg.role === 'ai' 
                        ? "bg-ink text-white" 
                        : "bg-white text-ink"
                    )}>
                      {msg.role === 'ai' && (
                        <div className="text-[10px] uppercase font-black text-brand mb-4 flex items-center gap-2">
                          <div className="w-2 h-2 bg-brand animate-pulse" /> AI SPECIALIST RESPONDING
                        </div>
                      )}
                      <p className="whitespace-pre-wrap uppercase tracking-tight text-sm font-display">{msg.content}</p>
                    </div>
                    <span className="text-[9px] font-black text-slate-400 mt-4 uppercase tracking-[0.2em]">
                      Interception: {new Date(msg.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-10 bg-slate-50 border-t-2 border-ink">
                <div className="bg-white brutal-border !p-4 flex flex-col shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] group">
                  <textarea 
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="TYPE RESPONSE OVERRIDE OR INSTRUCT AI..."
                    className="flex-1 p-6 min-h-[120px] outline-none font-black text-ink uppercase tracking-tight text-lg resize-none bg-transparent placeholder:text-slate-200"
                  />
                  <div className="flex justify-between items-center p-4 border-t-2 border-ink/5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Signal will be grounded in current training dataset.</p>
                      <button 
                        onClick={sendReply}
                        className="brutal-btn !bg-ink text-brand !py-2 !px-6 md:!px-8 flex items-center gap-3 active:translate-x-1 active:translate-y-1 active:shadow-none text-xs"
                      >
                        <Send className="w-4 h-4 md:w-5 h-5" /> SEND REPLY
                      </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-24 text-center">
              <div className="w-24 h-24 bg-brand brutal-border flex items-center justify-center mb-10 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                <Mail className="w-12 h-12 text-ink" />
              </div>
                      <h3 className="text-2xl md:text-4xl font-black text-ink font-display uppercase italic mb-4">Select an Email</h3>
                      <p className="max-w-md font-bold text-slate-400 uppercase tracking-[0.2em] text-[10px] md:text-xs leading-loose">
                        Review and manage emails handled by your AI agents.
                      </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
