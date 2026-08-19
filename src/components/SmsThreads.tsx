/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2, MessageSquare, RefreshCw, Send } from "lucide-react";

import { authFetch } from "../lib/api";
import { apiField, apiNum, apiStr } from "../lib/api-row";
import { formatDate } from "../lib/safe-date";
import { useToast } from "../contexts/ToastContext";
import { Button, EmptyState, Input, Skeleton } from "./atoms";
import { ConversationMessage, SearchField, StatusNotice } from "./molecules";

interface SmsThread {
  id: string;
  customer_number: string;
  status: string;
  unread_count: number;
  last_message_at: string;
}

interface SmsMessage {
  id: string;
  direction: "in" | "out";
  body: string;
  created_at: string;
}

function formatSmsTime(value: string) {
  return formatDate(
    value,
    { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
    "",
    "en-US",
  );
}

export default function SmsThreads({
  embedded = false,
  agentId,
}: {
  embedded?: boolean;
  agentId?: string | null;
}) {
  const { success, error: toastError } = useToast();
  const [threads, setThreads] = useState<SmsThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [threadErr, setThreadErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeThreadFetchRef = useRef<AbortController | null>(null);

  const fetchThreads = useCallback(async () => {
    setFetchErr(null);
    setLoading(true);
    try {
      const endpoint = agentId
        ? `/api/sms/threads?agent_id=${encodeURIComponent(agentId)}`
        : "/api/sms/threads";
      const response = await authFetch(endpoint);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load texts.");
      const rows = (body.threads || []) as Record<string, unknown>[];
      const next = rows.map((row) => ({
        id: String(apiField(row, "id") ?? ""),
        customer_number: apiStr(row, "customer_number", "Unknown number"),
        status: apiStr(row, "status", "open"),
        unread_count: apiNum(row, "unread_count"),
        last_message_at: String(apiField(row, "last_message_at") ?? ""),
      }));
      setThreads(next);
      setActiveId((current) =>
        current && next.some((thread) => thread.id === current) ? current : null,
      );
    } catch (reason: any) {
      const message = reason?.message || "Could not load texts.";
      setFetchErr(message);
      toastError("Texts unavailable", message);
    } finally {
      setLoading(false);
    }
  }, [agentId, toastError]);

  const fetchMessages = useCallback(
    async (threadId: string, signal?: AbortSignal) => {
      setMessagesLoading(true);
      setThreadErr(null);
      try {
        const response = await authFetch(`/api/sms/threads/${threadId}/messages`, { signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load this text thread.");
        if (signal?.aborted) return;
        const rows = (body.messages || []) as Record<string, unknown>[];
        setMessages(
          rows.map((row) => ({
            id: String(apiField(row, "id") ?? ""),
            direction: apiField<string>(row, "direction") === "out" ? "out" : "in",
            body: apiStr(row, "body"),
            created_at: String(apiField(row, "created_at") ?? ""),
          })),
        );

        const markReadResponse = await authFetch(`/api/sms/threads/${threadId}/mark-read`, {
          method: "POST",
          signal,
        });
        if (signal?.aborted) return;
        if (markReadResponse.ok) {
          setThreads((current) =>
            current.map((thread) =>
              thread.id === threadId ? { ...thread, unread_count: 0 } : thread,
            ),
          );
        } else {
          const markReadBody = await markReadResponse.json().catch(() => ({}));
          toastError(
            "Unread status not updated",
            markReadBody.error || "This thread is open, but its unread badge could not be cleared.",
          );
        }
      } catch (reason: any) {
        if (signal?.aborted) return;
        const message = reason?.message || "Could not load this text thread.";
        setThreadErr(message);
        toastError("Thread unavailable", message);
      } finally {
        if (!signal?.aborted) setMessagesLoading(false);
      }
    },
    [toastError],
  );

  useEffect(() => {
    setActiveId(null);
    setMessages([]);
    void fetchThreads();
  }, [fetchThreads]);

  useEffect(() => {
    activeThreadFetchRef.current?.abort();
    if (!activeId) {
      setMessages([]);
      setThreadErr(null);
      return;
    }
    const controller = new AbortController();
    activeThreadFetchRef.current = controller;
    void fetchMessages(activeId, controller.signal);
    return () => {
      controller.abort();
      if (activeThreadFetchRef.current === controller) activeThreadFetchRef.current = null;
    };
  }, [activeId, fetchMessages]);

  useEffect(() => {
    if (!messagesEndRef.current || !messages.length) return;
    messagesEndRef.current.scrollIntoView({ block: "end" });
  }, [messages]);

  const visibleThreads = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return threads;
    return threads.filter((thread) =>
      `${thread.customer_number} ${thread.status}`.toLowerCase().includes(normalized),
    );
  }, [search, threads]);

  const activeThread = threads.find((thread) => thread.id === activeId) || null;

  async function sendReply() {
    if (!activeId || !reply.trim() || sending) return;
    const threadId = activeId;
    const sentThreadController = activeThreadFetchRef.current;
    const body = reply.trim();
    const optimistic: SmsMessage = {
      id: `optimistic-${Date.now()}`,
      direction: "out",
      body,
      created_at: new Date().toISOString(),
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
      const result = await response.json().catch(() => ({}));

      if (
        result.code === "SMS_PROVIDER_OUTCOME_AMBIGUOUS" ||
        result.provider_outcome_ambiguous === true
      ) {
        const warning =
          result.reason ||
          "Delivery status is unknown. The carrier may have accepted this message. Do not resend it; contact support.";
        setMessages((current) => current.filter((message) => message.id !== optimistic.id));
        setThreadErr(warning);
        toastError("SMS status unknown. Do not resend", warning);
        return;
      }

      if (!response.ok || !result.ok) {
        throw new Error(result.reason || result.error || "Text could not be sent.");
      }

      success("SMS queued", "The carrier accepted the message for delivery.");
      await Promise.all([
        fetchMessages(threadId, sentThreadController?.signal),
        fetchThreads(),
      ]);
    } catch (reason: any) {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setReply(body);
      const message = reason?.message || "Try again.";
      setThreadErr(message);
      toastError("SMS send failed", message);
    } finally {
      setSending(false);
    }
  }

  const frameClass = embedded
    ? "flex min-h-0 flex-1 flex-col overflow-hidden"
    : "wl-paper flex min-h-[620px] flex-1 flex-col overflow-hidden";

  return (
    <section className={frameClass} aria-label="Text inbox">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search texts"
          aria-label="Search text conversations"
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void fetchThreads()}
          disabled={loading}
          aria-label="Refresh texts"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
        </Button>
      </div>

      {fetchErr ? (
        <StatusNotice tone="destructive" title="Texts unavailable" className="m-3 sm:m-4">
          {fetchErr}
        </StatusNotice>
      ) : null}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(17rem,0.74fr)_minmax(0,1.26fr)]">
        <div
          className={`${activeId ? "hidden lg:block" : "block"} min-h-0 overflow-y-auto border-r border-border`}
        >
          {loading && !threads.length ? (
            <div className="space-y-2 p-3" aria-busy="true">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="rounded-xl border border-border p-3">
                  <Skeleton shape="text" className="h-4 w-32" />
                  <Skeleton shape="text" className="mt-2 h-3 w-20" />
                </div>
              ))}
            </div>
          ) : !visibleThreads.length && !fetchErr ? (
            <EmptyState
              icon={<MessageSquare className="size-5" aria-hidden="true" />}
              title={agentId ? "No texts for this Bot" : "No texts yet"}
              density="compact"
            />
          ) : (
            <ul className="divide-y divide-border">
              {visibleThreads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(thread.id)}
                    aria-pressed={activeId === thread.id}
                    className={`w-full px-4 py-3.5 text-left transition-colors ${
                      activeId === thread.id ? "bg-primary/7" : "hover:bg-muted/45"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong className="truncate font-mono text-sm font-semibold text-foreground">
                        {thread.customer_number}
                      </strong>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatSmsTime(thread.last_message_at)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{thread.status || "Open"}</span>
                      {thread.unread_count > 0 ? (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          {thread.unread_count}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${activeId ? "block" : "hidden lg:block"} min-h-0`}>
          {!activeThread ? (
            <EmptyState title="Select a conversation" density="compact" />
          ) : (
            <div className="flex h-full min-h-0 flex-col">
              <header className="border-b border-border px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={() => setActiveId(null)}
                  className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary lg:hidden"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Texts
                </button>
                <h2 className="font-mono text-base font-semibold text-foreground">
                  {activeThread.customer_number}
                </h2>
              </header>

              {threadErr ? (
                <StatusNotice tone="destructive" title="Conversation unavailable" className="m-3 sm:m-4">
                  {threadErr}
                </StatusNotice>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                {messagesLoading ? (
                  <div className="grid h-full place-items-center text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((message) => (
                      <ConversationMessage
                        key={message.id}
                        direction={message.direction}
                        timestamp={formatSmsTime(message.created_at)}
                      >
                        {message.body}
                      </ConversationMessage>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <form
                className="flex gap-2 border-t border-border p-3 sm:p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendReply();
                }}
              >
                <Input
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Message"
                  aria-label="Text reply"
                  className="min-w-0 flex-1"
                />
                <Button type="submit" disabled={sending || !reply.trim()} aria-label="Send text">
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
