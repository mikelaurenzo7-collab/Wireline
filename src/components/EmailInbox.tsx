/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useState, useEffect, useRef } from "react";
import {
  Mail,
  Send,
  Loader2,
  User,
  ChevronRight,
  Inbox,
  RotateCw,
  Bot,
  Phone,
  Terminal,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import { authFetch } from "../lib/api";
import { formatDate, formatTime } from "../lib/safe-date";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import PageShell, { Panel } from "./PageShell";
import ClientToolbar from "./layout/ClientToolbar";
import ClientRouteLoading from "./layout/ClientRouteLoading";
import {
  ChannelInboxGrid,
  ChannelInboxListPane,
  ChannelInboxDetailPane,
} from "./layout/ChannelInbox";
import { PanelSkeleton } from "./Skeleton";
import { EmptyState } from "./ui/EmptyState";
import { OPS_CHANNEL_EMPTY, OPS_CHANNEL_TOOLBAR, WL_OPS_CLASSES } from "../lib/wireline-ops-design";
import { useToast } from "../contexts/ToastContext";
import { apiField, apiNum, apiStr } from "../lib/api-row";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { clientLog, getClientErrorMessage } from "../lib/client-log";

export default function EmailInbox({ embedded = false }: { embedded?: boolean }) {
  const { success: toastSuccess, error: toastError, info: toastInfo } = useToast();
  const [threads, setThreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
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
  const autoSelectedDesktopRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    selectedThreadIdRef.current = selectedThread?.id ?? null;
  }, [selectedThread?.id]);

  const fetchThreads = async () => {
    setLoading(true);
    setFetchErr(null);
    try {
      const res = await authFetch("/api/emails/threads");
      const data = (await res.json().catch(() => ({}))) as {
        threads?: Record<string, unknown>[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      if (mountedRef.current) {
        const rows = (data.threads || []) as Record<string, unknown>[];
        setThreads(
          rows.map((row) => ({
            id: String(apiField(row, "id") ?? ""),
            customer_email: apiStr(row, "customer_email"),
            subject: apiStr(row, "subject"),
            summary: apiStr(row, "summary"),
            lead_score: apiNum(row, "lead_score"),
            intent_label: apiStr(row, "intent_label", "none"),
            read: Boolean(apiField(row, "read")),
            last_message_at: String(apiField(row, "last_message_at") ?? ""),
            created_at: String(apiField(row, "created_at") ?? ""),
          })),
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not load email threads";
      if (mountedRef.current) {
        setFetchErr(message);
        toastError("Inbox unavailable", message);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const syncInbox = async () => {
    setSyncing(true);
    try {
      const res = await authFetch("/api/emails/sync", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        accounts?: number;
        message?: string;
        error?: string;
        code?: string;
      };

      if (!res.ok || body.ok === false) {
        if (body.code === "EMAIL_ACCOUNT_NOT_CONNECTED") {
          toastInfo(
            "Connect an account first",
            body.error ?? "Connect Gmail or Outlook in Integrations before syncing your inbox.",
          );
        } else {
          toastError("Sync failed", body.error ?? `HTTP ${res.status}`);
        }
        return;
      }

      await fetchThreads();
      toastSuccess(
        "Inbox synced",
        body.message ?? `${threads.length} thread${threads.length === 1 ? "" : "s"} loaded`,
      );
    } catch (e: unknown) {
      toastError("Sync failed", getClientErrorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time fetch on mount
  }, []);

  /** Desktop split-pane: pre-select the newest thread so the detail pane isn't empty on arrival. */
  useEffect(() => {
    if (loading || threads.length === 0 || autoSelectedDesktopRef.current) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    autoSelectedDesktopRef.current = true;
    setSelectedThread(threads[0]);
  }, [loading, threads]);

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
        const res = await authFetch(`/api/emails/threads/${threadId}/messages`, {
          signal: controller.signal,
        });
        const data = await res.json();
        if (active) {
          const rows = (data.messages || []) as Record<string, unknown>[];
          setMessages(
            rows.map((row) => ({
              id: apiField(row, "id"),
              role: apiStr(row, "role", "user"),
              content: apiStr(row, "content"),
              created_at: String(apiField(row, "created_at") ?? ""),
            })),
          );
        }
      } catch (e: unknown) {
        if (e instanceof Error && e.name === "AbortError") return;
        if (active) clientLog.error("EmailInbox.fetchMessages", e);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-keyed on thread id only
  }, [selectedThread?.id]);

  const fetchMessages = async (threadId: string) => {
    try {
      const res = await authFetch(`/api/emails/threads/${threadId}/messages`);
      const data = await res.json();
      // Compare against the ref (live) rather than the closure-captured
      // `selectedThread`, which would always equal threadId at call time.
      if (selectedThreadIdRef.current !== threadId) return;
      const rows = (data.messages || []) as Record<string, unknown>[];
      setMessages(
        rows.map((row) => ({
          id: apiField(row, "id"),
          role: apiStr(row, "role", "user"),
          content: apiStr(row, "content"),
          created_at: String(apiField(row, "created_at") ?? ""),
        })),
      );
    } catch (e: unknown) {
      clientLog.error("EmailInbox.fetchMessages", e);
      toastError("Messages unavailable", getClientErrorMessage(e));
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
        }),
      });
      if (claudeRes.ok) {
        const data = await claudeRes.json();
        if (data.draft) {
          setReplyText(data.draft);
          toastSuccess("Draft ready", "Review and send when ready.");
          return;
        }
      } else if (claudeRes.status !== 503) {
        const err = await claudeRes.json().catch(() => ({}));
        clientLog.warn("EmailInbox.draftAI", err);
      }
      const res = await authFetch(`/api/emails/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: selectedThread.subject,
          messages: messages,
          context: replyText,
        }),
      });
      const data = await res.json();
      if (data.draft) {
        setReplyText(data.draft);
        toastSuccess("Draft ready", "Review and send when ready.");
      }
    } catch (e: unknown) {
      toastError("Draft failed", getClientErrorMessage(e));
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
        toastError("Quick replies unavailable", "AI brain isn't configured on this workspace yet.");
      }
    } catch (e: unknown) {
      toastError("Quick replies failed", getClientErrorMessage(e));
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
        body: JSON.stringify({ body: replyText }),
      });
      setReplyText("");
      fetchMessages(selectedThread.id);
      toastSuccess("Reply sent");
    } catch (e: unknown) {
      toastError("Reply failed", getClientErrorMessage(e));
    }
  };

  const handlePhoneHandoff = async (thread: any) => {
    try {
      await authFetch("/api/fleet/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_type: "email_thread",
          source_id: thread.thread_id || thread.id,
          target_channel: "phone",
          customer_info: { email: thread.customer_email, subject: thread.subject },
          task_type: "callback_required",
          description: `Manual handoff requested from inbox. Subject: ${thread.subject}`,
        }),
      });
      toastSuccess("Callback queued", `Handoff task created for ${thread.customer_email}`);
    } catch (e: unknown) {
      toastError("Handoff failed", getClientErrorMessage(e));
    }
  };

  const syncAction = (
    <ShadButton
      type="button"
      variant="outline"
      size="sm"
      disableAnimations
      onClick={syncInbox}
      disabled={syncing}
      className={cn(
        "h-9 rounded-full text-muted hover:text-brand hover:border-brand/40 touch-press",
        WL_OPS_CLASSES.filterChip,
      )}
    >
      {syncing ? (
        <Loader2 className="w-3 h-3 animate-spin text-brand" />
      ) : (
        <RotateCw className="w-3 h-3 text-brand" />
      )}
      {OPS_CHANNEL_TOOLBAR.email.sync}
    </ShadButton>
  );

  const showInitialLoad = loading && threads.length === 0;

  const inboxBody = (
    <div className="flex-1 min-h-0">
      <PageShell
        title={embedded ? "" : "Email"}
        eyebrow={embedded ? undefined : "Communications · Email"}
        subtitle={
          embedded
            ? undefined
            : `${threads.length} thread${threads.length === 1 ? "" : "s"} in your inbox.`
        }
      >
        <Panel title="Inbox" hint="THREADS & REPLIES" icon={Inbox} flush className="h-full">
          <ChannelInboxGrid>
            <ChannelInboxListPane label="All conversations" detailOpen={!!selectedThread}>
              <AnimatePresence mode="sync">
                {loading ? (
                  <PanelSkeleton rows={6} />
                ) : fetchErr ? (
                  <EmptyState
                    icon={Mail}
                    eyebrow="Inbox unavailable"
                    title="Couldn't load threads"
                    description={fetchErr}
                    actions={[{ label: "Retry", onClick: fetchThreads, primary: true }]}
                    density="compact"
                    withHalo={false}
                    fill
                    className="py-10"
                  />
                ) : threads.length === 0 ? (
                  <EmptyState
                    icon={Mail}
                    eyebrow={OPS_CHANNEL_EMPTY.email.eyebrow}
                    title={OPS_CHANNEL_EMPTY.email.title}
                    description={OPS_CHANNEL_EMPTY.email.description}
                    actions={[...OPS_CHANNEL_EMPTY.email.actions]}
                    density="compact"
                    withHalo={false}
                    fill
                    className="py-10"
                  />
                ) : (
                  <div className="divide-y divide-black/6">
                    {threads.map((thread) => {
                      const score = thread.lead_score || 0;
                      const active = selectedThread?.id === thread.id;
                      const scoreTone =
                        score >= 80
                          ? "bg-destructive/12 text-destructive border-destructive/25"
                          : score >= 50
                            ? "bg-brand/12 text-brand border-brand/25"
                            : "bg-black/4 text-ink/55 border-black/8";
                      return (
                        <motion.button
                          type="button"
                          aria-label={`Email thread: ${thread.subject || thread.customer_email}`}
                          layout
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          key={thread.id}
                          onClick={() => setSelectedThread(thread)}
                          className={cn(
                            "group w-full px-4 py-3.5 text-left transition-all flex gap-3 items-start relative touch-press",
                            active ? "bg-brand/6" : "hover:bg-black/3",
                          )}
                        >
                          {/* Active bar */}
                          {active && (
                            <div
                              className="absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full bg-brand"
                              aria-hidden="true"
                            />
                          )}

                          {/* Avatar */}
                          <div
                            className={cn(
                              "w-9 h-9 rounded-md flex items-center justify-center font-display italic text-base shrink-0 border transition-all",
                              active
                                ? "border-brand/30 bg-brand/10 text-brand"
                                : "border-black/10 bg-paper/80 text-ink/70 group-hover:text-ink",
                            )}
                          >
                            {thread.customer_email?.[0]?.toUpperCase() || "?"}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <span className="text-[10px] uppercase tracking-[0.24em] text-ink/55 truncate">
                                {thread.customer_email}
                              </span>
                              <span className="text-[10px] tabular-nums text-ink/55 shrink-0">
                                {formatDate(thread.last_message_at)}
                              </span>
                            </div>
                            <h4 className="font-display italic text-sm text-ink leading-tight truncate mb-1">
                              {thread.subject || "(no subject)"}
                            </h4>
                            <div className="flex items-center gap-2">
                              <p className="chrome-subtle truncate flex-1">
                                {thread.summary || "Pending analysis…"}
                              </p>
                              <span
                                className={cn(
                                  "shrink-0 px-1.5 py-0.5 rounded-full border text-[10px] font-mono",
                                  scoreTone,
                                )}
                              >
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
            </ChannelInboxListPane>

            <ChannelInboxDetailPane detailOpen={!!selectedThread}>
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
                    <div className="shrink-0 px-3 sm:px-4 py-3 border-b border-black/8 flex items-center justify-between gap-2 sm:gap-3">
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <ShadButton
                          type="button"
                          variant="ghost"
                          size="icon"
                          disableAnimations
                          className="lg:hidden min-h-11 w-11 rounded-md shrink-0"
                          onClick={() => setSelectedThread(null)}
                          aria-label="Back to thread list"
                        >
                          <ChevronRight className="w-4 h-4 rotate-180" />
                        </ShadButton>
                        <div
                          className={cn(
                            "shrink-0 w-12 h-12 rounded-md wl-panel border flex flex-col items-center justify-center",
                            (selectedThread.lead_score || 0) >= 80
                              ? "border-destructive/40 text-destructive"
                              : (selectedThread.lead_score || 0) >= 50
                                ? "border-brand/40 text-brand"
                                : "border-black/10 text-muted",
                          )}
                        >
                          <span className="text-[7px] uppercase tracking-[0.3em] leading-none mb-0.5">
                            Intent
                          </span>
                          <span className="font-display italic text-xl leading-none tabular-nums">
                            {selectedThread.lead_score || 0}%
                          </span>
                        </div>
                        <div className="min-w-0">
                          <h2 className="font-display italic text-xl md:text-2xl text-ink leading-tight truncate">
                            {selectedThread.subject || "(no subject)"}
                          </h2>
                          <div className="wl-label text-muted/80 mt-1 flex items-center gap-1.5 truncate">
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
                          className="border-brand/40 bg-brand/[0.06] text-brand hover:bg-brand/12"
                        />
                        <ShadButton
                          type="button"
                          variant="outline"
                          size="sm"
                          disableAnimations
                          onClick={() => handlePhoneHandoff(selectedThread)}
                          className="rounded-full border-brand/40 bg-brand/[0.06] text-brand text-[11px] uppercase tracking-[0.22em] hover:bg-brand/12 hover:border-brand/60"
                          title="Route this thread to a voice fleet agent"
                        >
                          <Phone className="w-3 h-3 text-brand" />
                          Voice handoff
                        </ShadButton>
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 scroll-viewport scrollbar-hide p-4 space-y-3">
                      <AnimatePresence>
                        {messages.map((msg, idx) => (
                          <motion.div
                            initial={{ opacity: 0, x: msg.role === "ai" ? 8 : -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={msg.id || idx}
                            className={cn(
                              "flex flex-col max-w-[88%]",
                              msg.role === "ai" ? "ml-auto items-end" : "items-start",
                            )}
                          >
                            <div
                              className={cn(
                                "rounded-md border p-4 leading-relaxed",
                                msg.role === "ai"
                                  ? "wl-panel border-brand/30 text-ink"
                                  : "bg-black/[0.03] border-black/10 text-ink",
                              )}
                            >
                              <div
                                className={cn(
                                  "text-[10px] uppercase tracking-[0.3em] mb-2 flex items-center gap-1.5",
                                  msg.role === "ai" ? "text-brand" : "text-ink/55",
                                )}
                              >
                                {msg.role === "ai" ? (
                                  <>
                                    <span className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" />{" "}
                                    Agent reply
                                  </>
                                ) : (
                                  <>
                                    <User className="w-2.5 h-2.5" /> Inbound
                                  </>
                                )}
                              </div>
                              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                                {msg.content}
                              </p>
                            </div>
                            <span className="text-[10px] uppercase tracking-[0.3em] text-ink/55 mt-1.5 tabular-nums">
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
                            <span className="text-[10px] uppercase tracking-[0.3em] text-ink/55">
                              Quick replies
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {isLoadingQuickReplies
                              ? Array.from({ length: 3 }).map((_, i) => (
                                  <div
                                    key={i}
                                    className="h-7 w-28 rounded-full bg-black/5 animate-pulse"
                                  />
                                ))
                              : quickReplies.map((r, i) => (
                                  <ShadButton
                                    key={i}
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disableAnimations
                                    onClick={() => setReplyText(r.body)}
                                    title={r.body}
                                    className="rounded-full text-[10px] tracking-wide"
                                  >
                                    <span>{r.label}</span>
                                  </ShadButton>
                                ))}
                          </div>
                        </div>
                      )}

                      <div className="rounded-md wl-panel focus-within:border-brand/35 transition-colors overflow-hidden">
                        <div className="px-3 pt-2.5 pb-1 flex items-center gap-2 text-ink/55">
                          <Terminal className="w-3 h-3" />
                          <span className="text-[10px] uppercase tracking-[0.35em]">
                            Compose reply
                          </span>
                        </div>
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Type a reply or ask the agent to draft one…"
                          className="w-full px-3 pb-3 min-h-[100px] outline-none text-ink text-sm leading-relaxed resize-none bg-transparent placeholder:text-ink/55"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="chrome-subtle flex-1 leading-relaxed hidden md:block text-pretty">
                          Drafts use trained heuristics from this agent's persona and prior thread
                          context.
                        </p>
                        <div className="flex items-center gap-2">
                          <ShadButton
                            type="button"
                            variant="outline"
                            size="sm"
                            disableAnimations
                            onClick={fetchQuickReplies}
                            disabled={isLoadingQuickReplies}
                            className="rounded-full wl-ops-chip text-muted hover:text-brand hover:border-brand/40"
                            title="Generate 3 quick-reply options"
                          >
                            {isLoadingQuickReplies ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Zap className="w-3 h-3 text-brand" />
                            )}
                            Quick
                          </ShadButton>
                          <ShadButton
                            type="button"
                            variant="outline"
                            size="sm"
                            disableAnimations
                            onClick={handleDraftAI}
                            disabled={isDrafting}
                            className="rounded-full wl-ops-chip text-muted hover:text-brand hover:border-brand/40"
                          >
                            {isDrafting ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Bot className="w-3 h-3 text-brand" />
                            )}
                            AI draft
                          </ShadButton>
                          <ShadButton
                            type="button"
                            variant="editorial"
                            size="sm"
                            disableAnimations
                            onClick={sendReply}
                            className="rounded-full text-[10px] tracking-[0.25em] touch-press"
                          >
                            <Send className="w-3 h-3" /> Send
                          </ShadButton>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <EmptyState
                    icon={Mail}
                    eyebrow={OPS_CHANNEL_EMPTY.inboxDetail.eyebrow}
                    title={OPS_CHANNEL_EMPTY.inboxDetail.title}
                    description={OPS_CHANNEL_EMPTY.inboxDetail.description}
                    density="compact"
                    withHalo={false}
                    fill
                    className="py-12"
                  />
                )}
              </AnimatePresence>
            </ChannelInboxDetailPane>
          </ChannelInboxGrid>
        </Panel>
      </PageShell>
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      <ClientToolbar
        left={
          <span className="app-toolbar-stat">
            {showInitialLoad
              ? OPS_CHANNEL_TOOLBAR.email.loading
              : OPS_CHANNEL_TOOLBAR.email.stat(threads.length)}
          </span>
        }
        actions={syncAction}
      />
      {showInitialLoad ? (
        <ClientRouteLoading
          icon={<Mail className="w-7 h-7" />}
          label={OPS_CHANNEL_TOOLBAR.email.loading}
          className="flex-1 min-h-0"
        />
      ) : (
        inboxBody
      )}
    </div>
  );
}
