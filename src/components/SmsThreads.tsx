/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MessageSquare,
  Send,
  Loader2,
  RefreshCw,
  Inbox,
  Phone,
  ArrowLeft,
  Search,
  Copy,
  Check,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { formatDate } from "../lib/safe-date";
import PageShell, { Panel } from "./PageShell";
import ClientToolbar from "./layout/ClientToolbar";
import ClientRouteLoading from "./layout/ClientRouteLoading";
import { PanelSkeleton } from "./Skeleton";
import {
  ChannelInboxGrid,
  ChannelInboxListPane,
  ChannelInboxDetailPane,
  resolveChannelListNavigationIndex,
} from "./layout/ChannelInbox";
import { EmptyState } from "./ui/EmptyState";
import {
  OPS_CHANNEL_EMPTY,
  OPS_CHANNEL_TOOLBAR,
  WL_CHANNEL_CLASSES,
} from "../lib/wireline-ops-design";
import { useToast } from "../contexts/ToastContext";
import { apiField, apiNum, apiStr } from "../lib/api-row";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";

interface SmsThread {
  id: string;
  customer_number: string;
  status: string;
  summary?: string | null;
  unread_count: number;
  last_message_at: string;
  created_at: string;
}

interface SmsMessage {
  id: string;
  direction: "in" | "out";
  body: string;
  created_at: string;
  twilio_sid?: string | null;
}

/**
 * Two-way SMS inbox. Lists threads on the left, opens a chat-style
 * detail on the right. Operator can type + send replies which go out
 * via the tenant's Twilio sender. Reuses the same send path as the
 * agent action engine, so opt-out enforcement applies automatically.
 *
 * Mounted at /inbox under a "SMS" tab alongside the existing email
 * inbox — see AppRoutes.tsx + EmailInbox.tsx for the surrounding
 * tab layout.
 */
export default function SmsThreads({ embedded = false }: { embedded?: boolean }) {
  const { success, error: toastError } = useToast();
  const [threads, setThreads] = useState<SmsThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoSelectedDesktopRef = useRef(false);
  const mountedRef = useRef(true);
  const threadButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchThreads = async () => {
    setFetchErr(null);
    try {
      const r = await authFetch("/api/sms/threads");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      if (mountedRef.current) {
        const rows = (d.threads || []) as Record<string, unknown>[];
        setThreads(
          rows.map((row) => ({
            id: String(apiField(row, "id") ?? ""),
            customer_number: apiStr(row, "customer_number", "Unknown number"),
            status: apiStr(row, "status", "open"),
            summary: apiStr(row, "summary") || null,
            unread_count: apiNum(row, "unread_count"),
            last_message_at: String(apiField(row, "last_message_at") ?? ""),
            created_at: String(apiField(row, "created_at") ?? ""),
          })),
        );
      }
    } catch (e: any) {
      if (mountedRef.current) {
        setFetchErr(e?.message || "Could not load SMS threads");
        toastError("Failed to load SMS inbox", e?.message);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const fetchMessages = async (threadId: string) => {
    setMessagesLoading(true);
    try {
      const r = await authFetch(`/api/sms/threads/${threadId}/messages`);
      const d = await r.json();
      const rows = (d.messages || []) as Record<string, unknown>[];
      setMessages(
        rows.map((row) => ({
          id: String(apiField(row, "id") ?? ""),
          direction: (apiField<string>(row, "direction") === "out" ? "out" : "in") as "in" | "out",
          body: apiStr(row, "body"),
          created_at: String(apiField(row, "created_at") ?? ""),
          twilio_sid: apiField<string>(row, "twilio_sid") ?? null,
        })),
      );
      // Clear unread on open
      await authFetch(`/api/sms/threads/${threadId}/mark-read`, { method: "POST" }).catch(() => {});
      setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread_count: 0 } : t)));
    } catch (e: any) {
      toastError("Failed to load thread", e?.message);
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    fetchThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time fetch on mount
  }, []);

  useEffect(() => {
    if (loading || threads.length === 0 || autoSelectedDesktopRef.current) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    autoSelectedDesktopRef.current = true;
    setActiveId(threads[0].id);
  }, [loading, threads]);

  useEffect(() => {
    // Clear immediately so the previous thread's bubbles never render under
    // the new thread's header while messages are in flight.
    setMessages([]);
    if (activeId) fetchMessages(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-keyed on active thread id
  }, [activeId]);

  // Auto-scroll to newest message on open + after send.
  useEffect(() => {
    if (!messagesEndRef.current || messages.length === 0) return;
    try {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      /* ignore — element may be detached during route change */
    }
  }, [messages]);

  const handleSend = async () => {
    if (!activeId || !reply.trim() || sending) return;
    const threadId = activeId;
    const body = reply.trim();
    // Optimistic insert: show the outbound bubble immediately, then confirm
    // with a refetch. Rolled back (and the draft restored) if the send fails.
    const optimistic: SmsMessage = {
      id: `optimistic-${Date.now()}`,
      direction: "out",
      body,
      created_at: new Date().toISOString(),
      twilio_sid: null,
    };
    setSending(true);
    setReply("");
    setMessages((prev) => [...prev, optimistic]);
    try {
      const r = await authFetch(`/api/sms/threads/${threadId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.reason || "Send failed");
      success("SMS sent", "Message delivered to customer.");
      await fetchMessages(threadId);
      await fetchThreads();
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setReply(body);
      toastError("SMS send failed", e?.message || "Try again.");
    } finally {
      setSending(false);
    }
  };

  const activeThread = threads.find((t) => t.id === activeId);
  const query = search.trim().toLowerCase();
  const visibleThreads = query
    ? threads.filter(
        (t) =>
          t.customer_number.toLowerCase().includes(query) ||
          (t.summary || "").toLowerCase().includes(query),
      )
    : threads;
  const activeThreadIndex = visibleThreads.findIndex((thread) => thread.id === activeId);

  const copyNumber = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toastError("Copy failed", "Clipboard is unavailable in this browser.");
    }
  };

  const refreshAction = (
    <ShadButton
      type="button"
      variant="outline"
      size="sm"
      disableAnimations
      onClick={fetchThreads}
      disabled={loading}
      className="h-9 rounded-full wl-label text-muted hover:text-brand hover:border-brand/40 touch-press hover:scale-[1.05]"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
      {OPS_CHANNEL_TOOLBAR.sms.refresh}
    </ShadButton>
  );

  const showInitialLoad = loading && threads.length === 0;

  const inboxBody = (
    <div className="flex-1 min-h-0">
      <PageShell
        eyebrow={embedded ? undefined : "Channels · Messaging"}
        title={embedded ? "" : "SMS Inbox"}
        subtitle={
          embedded
            ? undefined
            : "Two-way text conversations with customers — outbound from your agents, inbound replies routed here."
        }
      >
        <Panel title="Inbox" hint="SMS · THREADS & REPLIES" icon={Inbox} flush className="h-full">
          <ChannelInboxGrid>
            <ChannelInboxListPane label="All conversations" detailOpen={!!activeId}>
              {!loading && !fetchErr && threads.length > 0 && (
                <div className="sticky top-0 z-10 px-1 pb-2 bg-gradient-to-b from-card/95 to-card/60 backdrop-blur-sm">
                  <div className="relative">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground/55 pointer-events-none"
                      aria-hidden
                    />
                    <Input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search number or summary…"
                      aria-label="Search SMS threads"
                      className="w-full text-sm bg-white/60 backdrop-blur-sm border border-border rounded-md pl-9 pr-3 py-2 outline-none focus:border-brand/50 text-foreground placeholder:text-foreground/55 transition-all"
                    />
                  </div>
                </div>
              )}
              {loading ? (
                <PanelSkeleton rows={6} />
              ) : fetchErr ? (
                <EmptyState
                  icon={MessageSquare}
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
                  icon={MessageSquare}
                  eyebrow={OPS_CHANNEL_EMPTY.sms.eyebrow}
                  title={OPS_CHANNEL_EMPTY.sms.title}
                  description={OPS_CHANNEL_EMPTY.sms.description}
                  actions={[...OPS_CHANNEL_EMPTY.sms.actions]}
                  density="compact"
                  withHalo={false}
                  fill
                  className="py-10"
                />
              ) : visibleThreads.length === 0 ? (
                <EmptyState
                  icon={Search}
                  eyebrow="No matches"
                  title="No threads match your search"
                  description={`Nothing matched “${search.trim()}”. Try a different number or keyword.`}
                  actions={[{ label: "Clear search", onClick: () => setSearch("") }]}
                  density="compact"
                  withHalo={false}
                  fill
                  className="py-10"
                />
              ) : (
                <div className="space-y-1.5" role="listbox" aria-label="SMS threads">
                  <AnimatePresence>
                    {visibleThreads.map((t, index) => (
                      <motion.button
                        key={t.id}
                        type="button"
                        aria-label={`SMS thread with ${t.customer_number}`}
                        aria-selected={activeId === t.id}
                        aria-controls="sms-thread-detail"
                        role="option"
                        layoutId={`sms-thread-${t.id}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        ref={(node) => {
                          threadButtonRefs.current[index] = node;
                        }}
                        onClick={() => setActiveId(t.id)}
                        onKeyDown={(event) => {
                          const currentIndex = activeThreadIndex >= 0 ? activeThreadIndex : index;
                          const nextIndex = resolveChannelListNavigationIndex(
                            currentIndex,
                            event.key,
                            visibleThreads.length,
                          );
                          if (nextIndex == null) return;
                          event.preventDefault();
                          const nextThread = visibleThreads[nextIndex];
                          if (!nextThread) return;
                          setActiveId(nextThread.id);
                          threadButtonRefs.current[nextIndex]?.focus();
                        }}
                        tabIndex={activeId === t.id || (!activeId && index === 0) ? 0 : -1}
                        className={cn(
                          WL_CHANNEL_CLASSES.threadRow,
                          "transition-all duration-300 hover:shadow-sm hover:bg-black/[0.04]",
                          activeId === t.id && WL_CHANNEL_CLASSES.threadRowActive,
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-sm text-foreground truncate">
                              {t.customer_number}
                            </p>
                            {t.summary ? (
                              <p className="text-[12px] text-muted mt-0.5 line-clamp-2 leading-snug">
                                {t.summary}
                              </p>
                            ) : null}
                            <p className="chrome-subtle mt-0.5">
                              {formatDate(
                                t.last_message_at,
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                                "—",
                                "en-US",
                              )}
                            </p>
                          </div>
                          {t.unread_count > 0 && (
                            <span className="shrink-0 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand text-on-brand wl-label font-bold">
                              {t.unread_count}
                            </span>
                          )}
                        </div>
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </ChannelInboxListPane>

            <ChannelInboxDetailPane detailOpen={!!activeId} label="Selected SMS conversation">
              {!activeThread ? (
                <EmptyState
                  icon={MessageSquare}
                  eyebrow={OPS_CHANNEL_EMPTY.inboxDetail.eyebrow}
                  title={OPS_CHANNEL_EMPTY.inboxDetail.title}
                  description={OPS_CHANNEL_EMPTY.inboxDetail.description}
                  density="compact"
                  withHalo={false}
                  fill
                  className="py-12"
                />
              ) : (
                <motion.div
                  id="sms-thread-detail"
                  key={activeThread.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full flex flex-col min-h-0 p-3 bg-gradient-to-br from-white/40 to-transparent"
                >
                  <div className="shrink-0 pb-2 border-b border-border flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-brand shrink-0" />
                    <span className="font-mono text-sm text-foreground truncate">
                      {activeThread.customer_number}
                    </span>
                    <ShadButton
                      type="button"
                      variant="ghost"
                      size="icon"
                      disableAnimations
                      onClick={() => copyNumber(activeThread.customer_number)}
                      aria-label={copied ? "Number copied" : "Copy customer number"}
                      title="Copy number"
                      className="shrink-0 h-7 w-7 rounded-md text-muted hover:text-brand"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-brand" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </ShadButton>
                    <span className="text-eyebrow opacity-70 ml-auto">Two-way</span>
                  </div>
                  <ShadButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    disableAnimations
                    onClick={() => setActiveId(null)}
                    aria-label="Back to threads"
                    className="lg:hidden self-start h-auto p-1 mb-2 wl-label-muted"
                  >
                    <ArrowLeft className="w-2.5 h-2.5" /> Back
                  </ShadButton>
                  <div className="flex-1 min-h-0 scroll-viewport space-y-2 pb-3">
                    {messagesLoading && messages.length === 0 ? (
                      <PanelSkeleton rows={4} />
                    ) : (
                      messages.map((m) => (
                        <div
                          key={m.id}
                          className={cn(
                            "max-w-[min(78%,36rem)] lg:max-w-[min(72%,44rem)] xl:max-w-[min(66%,52rem)] rounded-md px-3.5 py-2.5 border transition-all duration-300 hover:shadow-sm",
                            m.direction === "out"
                              ? "ml-auto bg-brand/12 border-brand/30 text-foreground"
                              : "mr-auto bg-white/80 backdrop-blur-sm border-border text-foreground",
                          )}
                        >
                          <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                            {m.body}
                          </p>
                          <p className="wl-micro-meta mt-1.5">
                            {m.direction === "out" ? "You" : "Caller"} ·{" "}
                            {formatDate(
                              m.created_at,
                              { hour: "numeric", minute: "2-digit" },
                              "—",
                              "en-US",
                            )}
                          </p>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="shrink-0 border-t border-border pt-3">
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder="Type a reply…"
                        disabled={sending}
                        className="flex-1 text-sm bg-white/50 backdrop-blur-sm border border-border rounded-md px-3 py-2.5 outline-none focus:border-brand/50 focus:shadow-[0_0_8px_rgba(var(--brand-rgb),0.1)] text-foreground placeholder:text-foreground/55 disabled:opacity-50 transition-all duration-300"
                      />
                      <ShadButton
                        type="button"
                        variant="editorial"
                        size="icon"
                        disableAnimations
                        onClick={handleSend}
                        disabled={sending || !reply.trim()}
                        aria-label="Send SMS reply"
                        className="touch-press hover:scale-[1.05] shrink-0 min-h-11 w-11 rounded-md transition-all duration-300 hover:shadow-[0_0_15px_rgba(var(--brand-rgb),0.3)] hover:-translate-y-0.5 group"
                      >
                        {sending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </ShadButton>
                    </div>
                    <p className="chrome-subtle mt-1.5 leading-relaxed text-pretty">
                      Sent from your Twilio sender · TCPA opt-out applies · STOP keyword
                      auto-honored.
                    </p>
                  </div>
                </motion.div>
              )}
            </ChannelInboxDetailPane>
          </ChannelInboxGrid>
        </Panel>
      </PageShell>
    </div>
  );

  return (
    <div className="bg-background text-foreground h-full flex flex-col min-h-0 paper-texture">
      <ClientToolbar
        left={
          <span className="app-toolbar-stat">
            {showInitialLoad
              ? OPS_CHANNEL_TOOLBAR.sms.loading
              : OPS_CHANNEL_TOOLBAR.sms.stat(threads.length)}
          </span>
        }
        actions={refreshAction}
      />
      {showInitialLoad ? (
        <ClientRouteLoading
          icon={<MessageSquare className="w-7 h-7" />}
          label={OPS_CHANNEL_TOOLBAR.sms.loading}
          className="flex-1 min-h-0"
        />
      ) : (
        inboxBody
      )}
    </div>
  );
}
