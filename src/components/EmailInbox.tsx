import { useState, useEffect, useRef } from "react";
import { Mail, Send, Loader2, User, ChevronRight, Inbox, RotateCw, Bot, Phone, Terminal, Zap } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { formatDate, formatTime } from "../lib/safe-date";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import PageShell, { Panel } from "./PageShell";
import HubTabs, { CHANNELS_HUB } from "./HubTabs";
import { PanelSkeleton } from "./Skeleton";
import EmptyState from "./EmptyState";
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
  const [quickReplies, setQuickReplies] = useState<Array<{ label: string; body: string }>>([]);
  const [isLoadingQuickReplies, setIsLoadingQuickReplies] = useState(false);

  // Tracks the currently-selected thread id for use inside async callbacks
  // whose closures would otherwise capture a stale `selectedThread`. Updated
  // synchronously by the effect below so any guard that reads it sees the
  // latest selection at resolution time.
  const selectedThreadIdRef = useRef<string | null>(null);
  useEffect(() => {
    selectedThreadIdRef.current = selectedThread?.id ?? null;
  }, [selectedThread?.id]);

  const fetchThreads = async () => {
    try {
      const res = await authFetch("/api/emails/threads");
      const data = await res.json();
      setThreads(data.threads || []);
    } catch (e) {
      console.error("Failed to fetch threads:", e);
      toastError("Inbox unavailable", "Could not load email threads. Please refresh.");
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

  // Guarded against the rapid-thread-switch race: if the user clicks
  // thread A → B before A's response lands, A's late resolve must not
  // overwrite B's messages. AbortController cancels in-flight fetches
  // for switched-away threads, and the post-resolve guard ignores any
  // response whose threadId no longer matches the selection.
  useEffect(() => {
    if (!selectedThread) return;
    const threadId = selectedThread.id;
    const controller = new AbortController();
    let active = true;
    // Clear immediately so thread B's header never renders over thread A's
    // body during the fetch interval.
    setMessages([]);
    setQuickReplies([]);
    (async () => {
      try {
        const res = await authFetch(`/api/emails/threads/${threadId}/messages`, { signal: controller.signal });
        const data = await res.json();
        if (active) setMessages(data.messages || []);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        if (active) console.error("Failed to fetch messages:", e);
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [selectedThread?.id]);

  const fetchMessages = async (threadId: string) => {
    try {
      const res = await authFetch(`/api/emails/threads/${threadId}/messages`);
      const data = await res.json();
      // Compare against the ref (live) rather than the closure-captured
      // `selectedThread`, which would always equal threadId at call time.
      if (selectedThreadIdRef.current !== threadId) return;
      setMessages(data.messages || []);
    } catch (e) {
      console.error("Failed to fetch messages:", e);
      toastError("Messages unavailable", "Could not load messages for this thread.");
    }
  };

  const handleDraftAI = async () => {
    if (!selectedThread) return;
    setIsDrafting(true);
    toastInfo("Drafting reply", "Wireline AI is composing your response…");
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


  const fetchQuickReplies = async () => {
    if (!selectedThread) return;
    setIsLoadingQuickReplies(true);
    setQuickReplies([]);
    try {
      const res = await authFetch("/api/claude/email-quick-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: selectedThread.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setQuickReplies(data.suggestions || []);
      } else if (res.status === 503) {
        toastError("Quick replies unavailable", "Claude API key not configured.");
      }
    } catch (e: any) {
      toastError("Quick replies failed", e.message);
    } finally {
      setIsLoadingQuickReplies(false);
    }
  };

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
    <div className="h-full flex flex-col min-h-0">
    <HubTabs tabs={CHANNELS_HUB} label="Channels sub-navigation" />
    <div className="flex-1 min-h-0">
    <PageShell
      title="Email"
      eyebrow="Communications · Email"
      subtitle={`${threads.length} thread${threads.length === 1 ? '' : 's'} in your inbox.`}
      actions={syncAction}
    >
      <div className="h-full flex flex-col lg:flex-row gap-3 min-h-0">
        {/* Thread list — full-width on mobile; hides when a thread is
            selected so the reader gets the full viewport. */}
        <Panel
          title="Threads"
          hint="ALL CONVERSATIONS"
          icon={Inbox}
          scroll
          flush
          className={cn("lg:w-[420px] shrink-0", selectedThread && "hidden lg:flex")}
          actions={
            <span className="text-[9px] uppercase tracking-[0.3em] text-muted/70 tabular-nums">
              {threads.length}
            </span>
          }
        >
          <AnimatePresence mode="popLayout">
            {loading ? (
              <PanelSkeleton rows={6} />
            ) : threads.length === 0 ? (
              <EmptyState
                icon={Mail}
                title="No threads yet"
                description="Connect a Gmail or Outlook account in Carrier Bridge so agents can receive and reply to emails."
                accent="#0AC8D4"
                actions={[
                  { label: "Connect Email", to: "/integrations", primary: true },
                ]}
                className="h-full py-10"
              />
            ) : (
              <div className="divide-y divide-white/6">
                {threads.map(thread => {
                  const score = thread.lead_score || 0;
                  const active = selectedThread?.id === thread.id;
                  const scoreTone =
                    score >= 80 ? "bg-rose-500/12 text-rose-500 border-rose-500/25" :
                    score >= 50 ? "bg-brand/12 text-brand border-brand/25" :
                    "bg-black/4 text-muted/60 border-black/8";
                  return (
                    <motion.button
                      layout
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      key={thread.id}
                      onClick={() => setSelectedThread(thread)}
                      className={cn(
                        "group w-full px-4 py-3.5 text-left transition-all flex gap-3 items-start relative",
                        active
                          ? "bg-brand/6"
                          : "hover:bg-white/3"
                      )}
                    >
                      {/* Active bar */}
                      {active && (
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full"
                          style={{ background: "linear-gradient(to bottom, #0AC8D4, #9B59F5)" }}
                        />
                      )}

                      {/* Avatar */}
                      <div className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center font-display italic text-base shrink-0 border transition-all",
                        active
                          ? "border-brand/30 bg-brand/10 text-brand"
                          : "border-white/10 bg-white/4 text-ink/70 group-hover:text-ink"
                      )}>
                        {thread.customer_email?.[0]?.toUpperCase() || "?"}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="text-[9px] uppercase tracking-[0.24em] text-muted/60 truncate">
                            {thread.customer_email}
                          </span>
                          <span className="text-[8px] tabular-nums text-muted/50 shrink-0">
                            {formatDate(thread.last_message_at)}
                          </span>
                        </div>
                        <h4 className="font-display italic text-sm text-ink leading-tight truncate mb-1">
                          {thread.subject || "(no subject)"}
                        </h4>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-muted/70 truncate flex-1">
                            {thread.summary || "Pending analysis…"}
                          </p>
                          <span className={cn(
                            "shrink-0 px-1.5 py-0.5 rounded-full border text-[8px] font-mono",
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
          title={selectedThread ? "Thread" : "Select a thread"}
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
                <div className="shrink-0 px-3 sm:px-4 py-3 border-b border-white/8 flex items-center justify-between gap-2 sm:gap-3">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <button
                      // 44x44 hit area meets the WCAG 2.5.5 / Apple HIG touch
                      // target minimum on mobile; the visible icon stays small.
                      className="lg:hidden w-11 h-11 rounded-lg glass border border-white/10 flex items-center justify-center text-ink shrink-0 active:scale-95 transition-transform"
                      onClick={() => setSelectedThread(null)}
                      aria-label="Back to thread list"
                    >
                      <ChevronRight className="w-4 h-4 rotate-180" />
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
                          {formatTime(msg.created_at)}
                        </span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Reply composer */}
                <div className="shrink-0 px-4 py-3 border-t border-black/7 space-y-3">
                  {/* Quick reply chips */}
                  {(quickReplies.length > 0 || isLoadingQuickReplies) && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-3 h-3 text-brand" />
                        <span className="text-[9px] uppercase tracking-[0.3em] text-muted/70">Quick replies</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {isLoadingQuickReplies ? (
                          Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-7 w-28 rounded-full bg-black/5 animate-pulse" />
                          ))
                        ) : quickReplies.map((r, i) => (
                          <button
                            key={i}
                            onClick={() => setReplyText(r.body)}
                            title={r.body}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass border border-black/10 text-ink/70 text-[10px] tracking-wide hover:border-brand/40 hover:text-ink hover:bg-brand/5 transition-all"
                          >
                            <span>{r.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl glass border border-black/10 focus-within:border-brand/35 transition-colors overflow-hidden">
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
                        onClick={fetchQuickReplies}
                        disabled={isLoadingQuickReplies}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass border border-black/10 text-ink text-[10px] uppercase tracking-[0.25em] hover:border-brand/35 transition-colors disabled:opacity-50"
                        title="Generate 3 quick-reply options"
                      >
                        {isLoadingQuickReplies ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3 text-brand" />}
                        Quick
                      </button>
                      <button
                        onClick={handleDraftAI}
                        disabled={isDrafting}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full glass border border-black/10 text-ink text-[10px] uppercase tracking-[0.25em] hover:border-brand/35 transition-colors disabled:opacity-50"
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
    </div>
    </div>
  );
}
