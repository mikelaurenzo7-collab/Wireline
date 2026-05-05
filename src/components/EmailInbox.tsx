import { useState, useEffect } from "react";
import { Mail, Send, Loader2, User, ChevronRight, Inbox, RotateCw, Bot, Phone, Terminal } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import PageShell, { Panel } from "./PageShell";
import { useToast } from "../contexts/ToastContext";

export default function EmailInbox() {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedThread, setSelectedThread] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState("");
  const [isDrafting, setIsDrafting] = useState(false);

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
      toastSuccess("Inbox synced", `${threads.length} thread${threads.length === 1 ? '' : 's'} loaded`);
    } catch (e: any) {
      toastError("Sync failed", e.message);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { fetchThreads(); }, []);

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
    toastInfo("Drafting reply", "Claude is composing your response…");
    try {
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
        if (data.draft) { setReplyText(data.draft); toastSuccess("Draft ready", "Review and send when ready."); return; }
      } else if (claudeRes.status !== 503) {
        const err = await claudeRes.json().catch(() => ({}));
        console.warn("Claude draft failed; falling back to Gemini:", err);
      }
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
      if (data.draft) { setReplyText(data.draft); toastSuccess("Draft ready", "Review and send when ready."); }
    } catch (e: any) {
      toastError("Draft failed", e.message);
    } finally {
      setIsDrafting(false);
    }
  };

  useEffect(() => {
    if (selectedThread) fetchMessages(selectedThread.id);
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
      toastSuccess("Reply sent");
    } catch (e: any) {
      toastError("Reply failed", e.message);
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
      toastSuccess("Callback queued", `Handoff task created for ${thread.customer_email}`);
    } catch (e: any) {
      toastError("Handoff failed", e.message);
    }
  };

  const syncAction = (
    <button
      onClick={syncInbox}
      disabled={syncing}
      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full glass border border-white/10 text-ink text-[11px] uppercase tracking-[0.22em] hover:border-brand/40 transition-colors disabled:opacity-60"
    >
      {syncing ? <Loader2 className="w-3 h-3 animate-spin text-brand" /> : <RotateCw className="w-3 h-3 text-brand" />}
      Sync inbox
    </button>
  );

  return (
    <PageShell
      title="Inbound Email"
      eyebrow="Signal · Inbox"
      subtitle={`${threads.length} thread${threads.length === 1 ? '' : 's'} routed to the relay.`}
      actions={syncAction}
    >
      <div className="h-full flex flex-col lg:flex-row gap-3 min-h-0">
        {/* Thread list */}
        <Panel
          title="threads"
          hint="ALL CONVERSATIONS"
          icon={Inbox}
          scroll
          flush
          className="lg:w-[420px] shrink-0"
          actions={
            <span className="text-[9px] uppercase tracking-[0.3em] text-muted/70 tabular-nums">
              {threads.length}
            </span>
          }
        >
          <AnimatePresence mode="popLayout">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 py-16">
                <Loader2 className="w-5 h-5 animate-spin text-brand" />
                <span className="text-[10px] uppercase tracking-[0.4em] text-muted/70">Loading threads</span>
              </div>
            ) : threads.length === 0 ? (
              <div className="h-full flex items-center justify-center px-8 text-center">
                <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70">No threads yet</p>
              </div>
            ) : (
              <div className="divide-y divide-white/6">
                {threads.map(thread => {
                  const score = thread.lead_score || 0;
                  const active = selectedThread?.id === thread.id;
                  const scoreTone =
                    score >= 80 ? "bg-rose-500/15 text-rose-500 border-rose-500/30" :
                    score >= 50 ? "bg-brand/15 text-brand border-brand/30" :
                    "bg-white/5 text-muted border-white/10";
                  return (
                    <motion.button
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={thread.id}
                      onClick={() => setSelectedThread(thread)}
                      className={cn(
                        "w-full px-4 py-3 text-left transition-colors flex gap-3 items-start",
                        active ? "bg-white/5" : "hover:bg-white/3"
                      )}
                    >
                      <div className={cn(
                        "w-9 h-9 rounded-lg glass border flex items-center justify-center font-display italic text-base shrink-0",
                        active ? "border-brand/40 text-brand" : "border-white/10 text-ink/70"
                      )}>
                        {thread.customer_email?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[9px] uppercase tracking-[0.25em] text-muted/70 truncate">{thread.customer_email}</span>
                          <span className="text-[9px] tabular-nums text-muted/60 shrink-0">
                            {new Date(thread.last_message_at).toLocaleDateString()}
                          </span>
                        </div>
                        <h4 className="font-display italic text-base text-ink leading-tight truncate mb-1">
                          {thread.subject || "(no subject)"}
                        </h4>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-muted/80 truncate flex-1">
                            {thread.summary || "Pending analysis"}
                          </p>
                          <span className={cn(
                            "shrink-0 px-1.5 py-0.5 rounded-full border text-[9px] uppercase tracking-[0.2em] tabular-nums",
                            scoreTone
                          )}>
                            {score}%
                          </span>
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </AnimatePresence>
        </Panel>

        {/* Detail */}
        <Panel
          title={selectedThread ? "thread" : "select a thread"}
          hint={selectedThread ? "DETAIL" : "INBOX"}
          icon={Mail}
          flush
          className={cn("flex-1 min-w-0", !selectedThread && "hidden lg:flex")}
        >
          <AnimatePresence mode="wait">
            {selectedThread ? (
              <motion.div
                key={selectedThread.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="h-full flex flex-col min-h-0"
              >
                {/* Subject header */}
                <div className="shrink-0 px-4 py-3 border-b border-white/8 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      className="lg:hidden w-8 h-8 rounded-lg glass border border-white/10 flex items-center justify-center text-ink shrink-0"
                      onClick={() => setSelectedThread(null)}
                    >
                      <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                    </button>
                    <div className={cn(
                      "shrink-0 w-12 h-12 rounded-xl glass border flex flex-col items-center justify-center",
                      (selectedThread.lead_score || 0) >= 80 ? "border-rose-500/40 text-rose-500" :
                      (selectedThread.lead_score || 0) >= 50 ? "border-brand/40 text-brand" :
                      "border-white/10 text-muted"
                    )}>
                      <span className="text-[7px] uppercase tracking-[0.3em] leading-none mb-0.5">Intent</span>
                      <span className="font-display italic text-xl leading-none tabular-nums">{selectedThread.lead_score || 0}</span>
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-display italic text-xl md:text-2xl text-ink leading-tight truncate">
                        {selectedThread.subject || "(no subject)"}
                      </h2>
                      <div className="text-[10px] uppercase tracking-[0.3em] text-muted/80 mt-1 flex items-center gap-1.5 truncate">
                        <User className="w-3 h-3 text-brand shrink-0" />
                        <span className="truncate">{selectedThread.customer_email}</span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <ClaudeRecipeButton
                      recipe="summarize-thread"
                      threadId={selectedThread.id}
                      label="Summarize"
                    />
                    <button
                      onClick={() => handlePhoneHandoff(selectedThread)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass border border-white/10 text-ink text-[10px] uppercase tracking-[0.25em] hover:border-brand/40 transition-colors"
                      title="Route this thread to a voice fleet agent"
                    >
                      <Phone className="w-3 h-3 text-brand" />
                      Voice handoff
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-3">
                  <AnimatePresence>
                    {messages.map((msg, idx) => (
                      <motion.div
                        initial={{ opacity: 0, x: msg.role === 'ai' ? 8 : -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        key={msg.id || idx}
                        className={cn(
                          "flex flex-col max-w-[88%]",
                          msg.role === 'ai' ? "ml-auto items-end" : "items-start"
                        )}
                      >
                        <div className={cn(
                          "rounded-2xl border p-4 leading-relaxed",
                          msg.role === 'ai'
                            ? "glass border-brand/30 text-ink"
                            : "bg-white/5 border-white/10 text-ink"
                        )}>
                          <div className={cn(
                            "text-[9px] uppercase tracking-[0.3em] mb-2 flex items-center gap-1.5",
                            msg.role === 'ai' ? "text-brand" : "text-muted/70"
                          )}>
                            {msg.role === 'ai' ? (
                              <><span className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" /> Agent reply</>
                            ) : (
                              <><User className="w-2.5 h-2.5" /> Inbound</>
                            )}
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                        </div>
                        <span className="text-[9px] uppercase tracking-[0.3em] text-muted/50 mt-1.5 tabular-nums">
                          {new Date(msg.created_at).toLocaleTimeString()}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Reply composer */}
                <div className="shrink-0 px-4 py-3 border-t border-white/8 space-y-3">
                  <div className="rounded-xl glass border border-white/10 focus-within:border-brand/40 transition-colors overflow-hidden">
                    <div className="px-3 pt-2.5 pb-1 flex items-center gap-2 text-muted/70">
                      <Terminal className="w-3 h-3" />
                      <span className="text-[9px] uppercase tracking-[0.35em]">Compose reply</span>
                    </div>
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      placeholder="Type a reply or ask the agent to draft one…"
                      className="w-full px-3 pb-3 min-h-[100px] outline-none text-ink text-sm leading-relaxed resize-none bg-transparent placeholder:text-muted/50"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] text-muted/70 flex-1 leading-relaxed hidden md:block">
                      Drafts use trained heuristics from this agent's persona and prior thread context.
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleDraftAI}
                        disabled={isDrafting}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass border border-white/10 text-ink text-[10px] uppercase tracking-[0.25em] hover:border-brand/40 transition-colors disabled:opacity-50"
                      >
                        {isDrafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3 text-brand" />}
                        AI draft
                      </button>
                      <button
                        onClick={sendReply}
                        className="brutal-btn !py-2 !px-4 !text-[10px] !tracking-[0.25em]"
                      >
                        <Send className="w-3 h-3" /> Send
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="h-full flex flex-col items-center justify-center gap-4 px-6 text-center"
              >
                <div className="w-16 h-16 rounded-2xl glass border border-white/10 flex items-center justify-center text-muted">
                  <Mail className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-display italic lowercase text-2xl text-ink">select a thread</h3>
                  <p className="text-[10px] uppercase tracking-[0.4em] text-muted/70 max-w-sm">
                    Pick a conversation from the list to monitor or reply.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>
      </div>
    </PageShell>
  );
}
