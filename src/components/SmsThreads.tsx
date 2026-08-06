/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  MessageSquare,
  Phone,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";

import { authFetch } from "../lib/api";
import { apiField, apiNum, apiStr } from "../lib/api-row";
import { formatDate } from "../lib/safe-date";
import { cn } from "../lib/utils";
import {
  OPS_CHANNEL_EMPTY,
  OPS_CHANNEL_TOOLBAR,
  WL_CHANNEL_CLASSES,
} from "../lib/wireline-ops-design";
import { useToast } from "../contexts/ToastContext";
import { Button, EmptyState, Input, Skeleton } from "./atoms";
import { ConversationActivity, ConversationMessage, SearchField, StatusNotice } from "./molecules";
import ClientToolbar from "./layout/ClientToolbar";
import ClientRouteLoading from "./layout/ClientRouteLoading";
import {
  ChannelInboxDetailPane,
  ChannelInboxGrid,
  ChannelInboxListPane,
  resolveChannelListNavigationIndex,
} from "./layout/ChannelInbox";

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

function formatSmsTime(value: string) {
  return formatDate(value, { hour: "numeric", minute: "2-digit" }, "—", "en-US");
}

function SmsLoadingState() {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-live="polite">
      <Skeleton shape="text" className="h-4 w-28" />
      <Skeleton shape="surface" className="h-16 w-full" />
      <Skeleton shape="surface" className="h-16 w-5/6" />
      <Skeleton shape="surface" className="h-16 w-full" />
    </div>
  );
}

/** Two-way SMS inbox. Delivery semantics stay server-owned; this surface renders their state clearly. */
export default function SmsThreads({ embedded = false }: { embedded?: boolean }) {
  const { success, error: toastError } = useToast();
  const [threads, setThreads] = useState<SmsThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [threadErr, setThreadErr] = useState<string | null>(null);
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
  }, [toastError]);

  const fetchThreads = useCallback(async () => {
    setFetchErr(null);
    try {
      const response = await authFetch("/api/sms/threads");
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
      if (!mountedRef.current) return;
      const rows = (body.threads || []) as Record<string, unknown>[];
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
    } catch (error: any) {
      if (!mountedRef.current) return;
      const message = error?.message || "Could not load SMS threads.";
      setFetchErr(message);
      toastError("Failed to load SMS inbox", message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [toastError]);

  // Same race the email inbox carried: switching threads fires overlapping
  // requests, and last-writer-wins means an older response can paint its
  // messages under the newer thread's header. The signal makes a superseded
  // request drop its result instead.
  const fetchMessages = useCallback(
    async (threadId: string, signal?: AbortSignal) => {
      setMessagesLoading(true);
      setThreadErr(null);
      try {
        const response = await authFetch(`/api/sms/threads/${threadId}/messages`, { signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load this conversation.");
        const rows = (body.messages || []) as Record<string, unknown>[];
        if (signal?.aborted) return;
        setMessages(
          rows.map((row) => ({
            id: String(apiField(row, "id") ?? ""),
            direction: apiField<string>(row, "direction") === "out" ? "out" : "in",
            body: apiStr(row, "body"),
            created_at: String(apiField(row, "created_at") ?? ""),
            twilio_sid: apiField<string>(row, "twilio_sid") ?? null,
          })),
        );
        await authFetch(`/api/sms/threads/${threadId}/mark-read`, { method: "POST" }).catch(
          () => {},
        );
        setThreads((current) =>
          current.map((thread) =>
            thread.id === threadId ? { ...thread, unread_count: 0 } : thread,
          ),
        );
      } catch (error: any) {
        // A superseded request rejects with AbortError; surfacing it would put an
        // error banner and a toast over the thread the reader actually opened.
        if (signal?.aborted) return;
        const message = error?.message || "Could not load this conversation.";
        setThreadErr(message);
        toastError("Failed to load thread", message);
      } finally {
        // The newer request already set this true.
        if (!signal?.aborted) setMessagesLoading(false);
      }
    },
    [toastError],
  );

  useEffect(() => {
    void fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    if (loading || !threads.length || autoSelectedDesktopRef.current) return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    autoSelectedDesktopRef.current = true;
    setActiveId(threads[0].id);
  }, [loading, threads]);

  useEffect(() => {
    setMessages([]);
    if (!activeId) return;
    const controller = new AbortController();
    void fetchMessages(activeId, controller.signal);
    return () => controller.abort();
  }, [activeId, fetchMessages]);

  useEffect(() => {
    if (!messagesEndRef.current || !messages.length) return;
    try {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch {
      /* route transition */
    }
  }, [messages]);

  const handleSend = async () => {
    if (!activeId || !reply.trim() || sending) return;
    const threadId = activeId;
    const body = reply.trim();
    const optimistic: SmsMessage = {
      id: `optimistic-${Date.now()}`,
      direction: "out",
      body,
      created_at: new Date().toISOString(),
      twilio_sid: null,
    };

    setSending(true);
    setThreadErr(null);
    setReply("");
    setMessages((current) => [...current, optimistic]);
    try {
      const response = await authFetch(`/api/sms/threads/${threadId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const result = await response.json();
      if (!result.ok) throw new Error(result.reason || "Send failed");
      success("SMS sent", "Message delivered to customer.");
      await Promise.all([fetchMessages(threadId), fetchThreads()]);
    } catch (error: any) {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setReply(body);
      const message = error?.message || "Try again.";
      setThreadErr(message);
      toastError("SMS send failed", message);
    } finally {
      setSending(false);
    }
  };

  const activeThread = threads.find((thread) => thread.id === activeId);
  const query = search.trim().toLowerCase();
  const visibleThreads = query
    ? threads.filter(
        (thread) =>
          thread.customer_number.toLowerCase().includes(query) ||
          (thread.summary || "").toLowerCase().includes(query),
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
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => void fetchThreads()}
      disabled={loading}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
      {OPS_CHANNEL_TOOLBAR.sms.refresh}
    </Button>
  );

  const showInitialLoad = loading && !threads.length;

  const listContent = () => {
    if (loading) return <SmsLoadingState />;
    if (fetchErr)
      return (
        <StatusNotice
          tone="destructive"
          title="Inbox unavailable"
          action={
            <Button type="button" variant="link" size="sm" onClick={() => void fetchThreads()}>
              Retry
            </Button>
          }
        >
          {fetchErr}
        </StatusNotice>
      );
    if (!threads.length)
      return (
        <EmptyState
          icon={<MessageSquare className="size-5" />}
          title={OPS_CHANNEL_EMPTY.sms.title}
          description="SMS conversations will appear here after messaging is connected."
          action={
            <Button asChild>
              <Link to="/settings/phone">Review SMS setup</Link>
            </Button>
          }
          density="compact"
        />
      );
    if (!visibleThreads.length)
      return (
        <EmptyState
          icon={<Sparkles className="size-5" />}
          title="No matches"
          action={
            <Button type="button" variant="secondary" onClick={() => setSearch("")}>
              Clear search
            </Button>
          }
          density="compact"
        />
      );

    return (
      <div className="space-y-1.5" role="listbox" aria-label="SMS threads">
        <AnimatePresence>
          {visibleThreads.map((thread, index) => (
            <motion.button
              key={thread.id}
              type="button"
              role="option"
              aria-selected={activeId === thread.id}
              aria-controls="sms-thread-detail"
              aria-label={`SMS thread with ${thread.customer_number}`}
              tabIndex={activeId === thread.id || (!activeId && index === 0) ? 0 : -1}
              ref={(node) => {
                threadButtonRefs.current[index] = node;
              }}
              onClick={() => setActiveId(thread.id)}
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
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                WL_CHANNEL_CLASSES.threadRow,
                "text-left transition-colors hover:bg-[var(--wireline-color-surface-subtle)]",
                activeId === thread.id && WL_CHANNEL_CLASSES.threadRowActive,
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-foreground truncate">
                    {thread.customer_number}
                  </p>
                  {thread.summary ? (
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                      {thread.summary}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {formatDate(
                      thread.last_message_at,
                      { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
                      "—",
                      "en-US",
                    )}
                  </p>
                </div>
                {thread.unread_count > 0 ? (
                  <span className="grid min-w-6 min-h-6 place-items-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                    {thread.unread_count}
                  </span>
                ) : null}
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-background text-foreground">
      {!embedded ? (
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
      ) : null}
      {showInitialLoad ? (
        <ClientRouteLoading
          icon={<MessageSquare className="size-7" />}
          label={OPS_CHANNEL_TOOLBAR.sms.loading}
          className="flex-1 min-h-0"
        />
      ) : (
        <div className="flex-1 min-h-0">
          <div className="h-full min-h-0">
            <ChannelInboxGrid>
              <ChannelInboxListPane label="All conversations" detailOpen={!!activeId}>
                {!loading && !fetchErr && threads.length > 0 ? (
                  <div className="sticky top-0 z-10 bg-card/95 px-1 pb-3 backdrop-blur">
                    <SearchField
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      onClear={() => setSearch("")}
                      placeholder="Search number or summary"
                      aria-label="Search SMS threads"
                    />
                  </div>
                ) : null}
                {listContent()}
              </ChannelInboxListPane>

              <ChannelInboxDetailPane detailOpen={!!activeId} label="Selected SMS conversation">
                {!activeThread ? (
                  <EmptyState
                    icon={<MessageSquare className="size-5" />}
                    title={OPS_CHANNEL_EMPTY.inboxDetail.title}
                    density="compact"
                  />
                ) : (
                  <motion.div
                    id="sms-thread-detail"
                    key={activeThread.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex h-full min-h-0 flex-col p-4 sm:p-5"
                  >
                    <header className="flex shrink-0 items-center gap-2 border-b border-border pb-3">
                      <Phone className="size-4 text-primary" />
                      <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">
                        {activeThread.customer_number}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void copyNumber(activeThread.customer_number)}
                        aria-label={copied ? "Number copied" : "Copy customer number"}
                      >
                        {copied ? (
                          <Check className="size-4 text-[var(--wireline-color-status-success)]" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                      </Button>
                      <span className="text-xs font-medium uppercase tracking-[.08em] text-muted-foreground">
                        Two-way
                      </span>
                    </header>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => setActiveId(null)}
                      className="mt-2 self-start px-0 lg:hidden"
                    >
                      <ArrowLeft className="size-3" /> Back
                    </Button>

                    <div
                      className="flex-1 min-h-0 space-y-3 overflow-y-auto py-4"
                      aria-live="polite"
                      aria-label="SMS conversation"
                    >
                      {messagesLoading && !messages.length ? (
                        <SmsLoadingState />
                      ) : (
                        messages.map((message) => (
                          <ConversationMessage
                            key={message.id}
                            author={message.direction === "out" ? "assistant" : "customer"}
                            channel="text"
                            label={message.direction === "out" ? "You" : "Customer"}
                            timestamp={formatSmsTime(message.created_at)}
                          >
                            {message.body}
                          </ConversationMessage>
                        ))
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    <div className="shrink-0 border-t border-border pt-3">
                      {sending ? (
                        <ConversationActivity
                          className="mb-3"
                          state="active"
                          title="Sending text message"
                          detail="The message is queued while Wireline confirms delivery."
                        />
                      ) : null}
                      {threadErr ? (
                        <StatusNotice
                          tone="destructive"
                          className="mb-3"
                          title="Message delivery needs attention"
                        >
                          {threadErr}
                        </StatusNotice>
                      ) : null}
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          value={reply}
                          onChange={(event) => setReply(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void handleSend();
                            }
                          }}
                          placeholder="Type a reply…"
                          disabled={sending}
                          aria-label="SMS reply"
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          size="icon"
                          onClick={() => void handleSend()}
                          disabled={sending || !reply.trim()}
                          aria-label="Send SMS reply"
                        >
                          {sending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Send className="size-4" />
                          )}
                        </Button>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        Sent from your Wireline number · TCPA opt-out applies · STOP keyword
                        auto-honored.
                      </p>
                    </div>
                  </motion.div>
                )}
              </ChannelInboxDetailPane>
            </ChannelInboxGrid>
          </div>
        </div>
      )}
    </div>
  );
}
