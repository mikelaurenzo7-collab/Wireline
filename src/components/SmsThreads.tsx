/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint. */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";

import { authFetch } from "../lib/api";
import { apiField, apiNum, apiStr } from "../lib/api-row";
import { formatDate } from "../lib/safe-date";
import { useToast } from "../contexts/ToastContext";
import { Button, EmptyState, Input, Skeleton } from "./atoms";
import { ConversationMessage, SearchField, StatusNotice } from "./molecules";
import SmsOutcomePanel from "./SmsOutcomePanel";

interface SmsThread {
  id: string;
  customer_number: string;
  destination_number: string | null;
  status: string;
  unread_count: number;
  last_message_at: string;
}

interface SmsMessage {
  id: string;
  direction: "in" | "out";
  body: string;
  created_at: string;
  agent_id: string | null;
}

type PendingSmsSendState = "sending" | "retryable" | "ambiguous";

type PendingSmsSend = {
  idempotencyKey: string;
  bodyFingerprint: string;
  state: PendingSmsSendState;
  message: string | null;
};

const PENDING_SMS_SEND_PREFIX = "botbound:sms-send:";
const DEFINITIVE_SMS_PRE_PROVIDER_CODES = new Set([
  "IDEMPOTENCY_KEY_REQUIRED",
  "INVALID_IDEMPOTENCY_KEY",
  "IDEMPOTENCY_KEY_REUSED",
  "SMS_THREAD_ROUTING_CONFLICT",
  "SMS_THREAD_DESTINATION_UNRESOLVED",
  "SMS_THREAD_UNASSIGNED",
  "BOT_SETUP_REVIEW_REQUIRED",
  "SMS_SEND_PRE_PROVIDER_FAILED",
]);

function pendingSmsSendStorageKey(threadId: string): string {
  return `${PENDING_SMS_SEND_PREFIX}${threadId}`;
}

function writePendingSmsSend(threadId: string, pending: PendingSmsSend): void {
  try {
    window.sessionStorage.setItem(pendingSmsSendStorageKey(threadId), JSON.stringify(pending));
  } catch {
    // The in-memory copy still protects the mounted inbox when storage is unavailable.
  }
}

function removePendingSmsSend(threadId: string): void {
  try {
    window.sessionStorage.removeItem(pendingSmsSendStorageKey(threadId));
  } catch {
    // The in-memory copy is removed by the caller regardless.
  }
}

function readPendingSmsSend(threadId: string): PendingSmsSend | null {
  try {
    const raw = window.sessionStorage.getItem(pendingSmsSendStorageKey(threadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingSmsSend>;
    if (
      typeof parsed.idempotencyKey !== "string" ||
      !parsed.idempotencyKey.trim() ||
      typeof parsed.bodyFingerprint !== "string" ||
      !parsed.bodyFingerprint ||
      (parsed.state !== "sending" && parsed.state !== "retryable" && parsed.state !== "ambiguous")
    ) {
      removePendingSmsSend(threadId);
      return null;
    }
    const pending: PendingSmsSend = {
      idempotencyKey: parsed.idempotencyKey,
      bodyFingerprint: parsed.bodyFingerprint,
      // A mounted request owns `sending` in memory. Finding it only in storage
      // means the page was reloaded or remounted, so the same operation is safe
      // to retry through the server's durable idempotency fence.
      state: parsed.state === "sending" ? "retryable" : parsed.state,
      message: typeof parsed.message === "string" ? parsed.message.slice(0, 500) : null,
    };
    if (parsed.state === "sending") writePendingSmsSend(threadId, pending);
    return pending;
  } catch {
    removePendingSmsSend(threadId);
    return null;
  }
}

function createSmsIdempotencyKey(threadId: string): string {
  const randomId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `sms-thread-${threadId}-${randomId}`;
}

function smsBodyFingerprint(value: string): string {
  // This is only a non-sensitive client-side mismatch detector. The server
  // performs the authoritative payload/idempotency validation.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${value.length}:${(hash >>> 0).toString(16)}`;
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
  const [drafting, setDrafting] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [pendingSends, setPendingSends] = useState<Record<string, PendingSmsSend>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const threadListFetchRef = useRef<AbortController | null>(null);
  const activeThreadFetchRef = useRef<AbortController | null>(null);
  const threadListOperationRef = useRef(0);
  const messageOperationRef = useRef(0);
  const draftOperationRef = useRef(0);
  const sendOperationRef = useRef(0);
  const sendClaimsRef = useRef<Set<string>>(new Set());
  const pendingSendsRef = useRef<Record<string, PendingSmsSend>>({});
  const activeAgentIdRef = useRef<string | null>(agentId || null);
  const activeIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    activeAgentIdRef.current = agentId || null;
    threadListOperationRef.current += 1;
    threadListFetchRef.current?.abort();
    setThreads([]);
    setActiveId(null);
    setMessages([]);
    setFetchErr(null);
    setThreadErr(null);
    setLoading(true);
  }, [agentId]);

  useLayoutEffect(() => {
    activeIdRef.current = activeId;
    messageOperationRef.current += 1;
    activeThreadFetchRef.current?.abort();
    draftOperationRef.current += 1;
    sendOperationRef.current += 1;
    // Clear thread-owned state before paint so a newly selected customer's
    // header can never render above the previous customer's transcript.
    setMessages([]);
    setMessagesLoading(Boolean(activeId));
    setThreadErr(null);
    setDraftNotice(null);
    setDraftError(null);
    setDrafting(false);
    setSending(false);
    setReply("");
  }, [activeId]);

  const fetchThreads = useCallback(async () => {
    threadListFetchRef.current?.abort();
    const controller = new AbortController();
    threadListFetchRef.current = controller;
    const requestedAgentId = agentId || null;
    const operation = ++threadListOperationRef.current;
    const isCurrentRequest = () =>
      !controller.signal.aborted &&
      activeAgentIdRef.current === requestedAgentId &&
      threadListOperationRef.current === operation;
    setFetchErr(null);
    setLoading(true);
    try {
      const endpoint = agentId
        ? `/api/sms/threads?agent_id=${encodeURIComponent(agentId)}`
        : "/api/sms/threads";
      const response = await authFetch(endpoint, { signal: controller.signal });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Could not load texts.");
      if (!isCurrentRequest()) return;
      const rows = (body.threads || []) as Record<string, unknown>[];
      const next = rows.map((row) => ({
        id: String(apiField(row, "id") ?? ""),
        customer_number: apiStr(row, "customer_number", "Unknown number"),
        destination_number: apiStr(row, "destination_number") || null,
        status: apiStr(row, "status", "open"),
        unread_count: apiNum(row, "unread_count"),
        last_message_at: String(apiField(row, "last_message_at") ?? ""),
      }));
      setThreads(next);
      setPendingSends((current) => {
        const hydrated = { ...current };
        for (const thread of next) {
          if (!hydrated[thread.id]) {
            const persisted = readPendingSmsSend(thread.id);
            if (persisted) hydrated[thread.id] = persisted;
          }
        }
        return hydrated;
      });
      setActiveId((current) =>
        current && next.some((thread) => thread.id === current) ? current : null,
      );
    } catch (reason: any) {
      if (!isCurrentRequest()) return;
      const message = reason?.message || "Could not load texts.";
      setFetchErr(message);
      toastError("Texts unavailable", message);
    } finally {
      if (isCurrentRequest()) setLoading(false);
      if (threadListFetchRef.current === controller) threadListFetchRef.current = null;
    }
  }, [agentId, toastError]);

  const fetchMessages = useCallback(
    async (threadId: string, signal?: AbortSignal) => {
      const operation = ++messageOperationRef.current;
      const isCurrentRequest = () =>
        !signal?.aborted &&
        activeIdRef.current === threadId &&
        messageOperationRef.current === operation;
      setMessagesLoading(true);
      setThreadErr(null);
      try {
        const response = await authFetch(`/api/sms/threads/${threadId}/messages`, { signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Could not load this text thread.");
        if (!isCurrentRequest()) return;
        const rows = (body.messages || []) as Record<string, unknown>[];
        setMessages(
          rows.map((row) => ({
            id: String(apiField(row, "id") ?? ""),
            direction: apiField<string>(row, "direction") === "out" ? "out" : "in",
            body: apiStr(row, "body"),
            created_at: String(apiField(row, "created_at") ?? ""),
            agent_id: apiStr(row, "agent_id") || null,
          })),
        );
        // Transcript availability must not wait on best-effort badge upkeep.
        setMessagesLoading(false);
        void (async () => {
          try {
            const markReadResponse = await authFetch(`/api/sms/threads/${threadId}/mark-read`, {
              method: "POST",
              signal,
            });
            if (!isCurrentRequest()) return;
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
                markReadBody.error ||
                  "This thread is open, but its unread badge could not be cleared.",
              );
            }
          } catch (reason: any) {
            if (!isCurrentRequest()) return;
            toastError(
              "Unread status not updated",
              reason?.message || "This thread is open, but its unread badge could not be cleared.",
            );
          }
        })();
      } catch (reason: any) {
        if (!isCurrentRequest()) return;
        const message = reason?.message || "Could not load this text thread.";
        setThreadErr(message);
        toastError("Thread unavailable", message);
      } finally {
        if (isCurrentRequest()) setMessagesLoading(false);
      }
    },
    [toastError],
  );

  useEffect(() => {
    void fetchThreads();
    return () => {
      threadListFetchRef.current?.abort();
    };
  }, [fetchThreads]);

  useEffect(() => {
    if (!activeId) return;
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

  function rememberPendingSend(threadId: string, pending: PendingSmsSend) {
    pendingSendsRef.current = { ...pendingSendsRef.current, [threadId]: pending };
    writePendingSmsSend(threadId, pending);
    setPendingSends((current) => ({ ...current, [threadId]: pending }));
  }

  function forgetPendingSend(threadId: string) {
    if (pendingSendsRef.current[threadId]) {
      const next = { ...pendingSendsRef.current };
      delete next[threadId];
      pendingSendsRef.current = next;
    }
    removePendingSmsSend(threadId);
    setPendingSends((current) => {
      if (!current[threadId]) return current;
      const next = { ...current };
      delete next[threadId];
      return next;
    });
  }

  const visibleThreads = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return threads;
    return threads.filter((thread) =>
      `${thread.customer_number} ${thread.destination_number || ""} ${thread.status}`
        .toLowerCase()
        .includes(normalized),
    );
  }, [search, threads]);

  const activeThread = threads.find((thread) => thread.id === activeId) || null;
  const handleOutcomeStatusChange = useCallback(
    (status: string) => {
      if (!activeId) return;
      setThreads((current) => {
        let changed = false;
        const next = current.map((thread) => {
          if (thread.id !== activeId || thread.status === status) return thread;
          changed = true;
          return { ...thread, status };
        });
        return changed ? next : current;
      });
    },
    [activeId],
  );
  const activePendingSend = activeId ? pendingSends[activeId] || null : null;
  const routingConflict = activeThread?.status === "routing_conflict";
  const missingDestination = Boolean(activeThread && !activeThread.destination_number);
  const sendingLineUnavailable = routingConflict || missingDestination;
  const pendingSendInFlight = activePendingSend?.state === "sending";
  const pendingSendAmbiguous = activePendingSend?.state === "ambiguous";
  const hasSearch = search.trim().length > 0;
  const listOwnsOnlyState = visibleThreads.length === 0;

  async function writeWithBot() {
    if (!activeId || sendingLineUnavailable || activePendingSend || drafting || sending) return;
    const threadId = activeId;
    const operation = ++draftOperationRef.current;
    setDrafting(true);
    setDraftError(null);
    setDraftNotice(null);
    try {
      const response = await authFetch(`/api/sms/threads/${threadId}/draft`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as {
        reply?: string;
        requires_human?: boolean;
        reason?: string | null;
        error?: string;
      };
      if (!response.ok || !body.reply) {
        throw new Error(body.error || "The Bot could not write a reply.");
      }
      if (activeIdRef.current !== threadId || draftOperationRef.current !== operation) return;
      setReply(body.reply);
      setDraftNotice(
        body.requires_human
          ? body.reason || "This reply needs human judgment before it is sent."
          : "Written from this Bot's saved role and knowledge. Review it, then send with Twilio.",
      );
    } catch (reason) {
      if (activeIdRef.current !== threadId || draftOperationRef.current !== operation) return;
      setDraftError(reason instanceof Error ? reason.message : "The Bot could not write a reply.");
    } finally {
      if (activeIdRef.current === threadId && draftOperationRef.current === operation) {
        setDrafting(false);
      }
    }
  }

  async function sendReply() {
    if (
      !activeId ||
      sendingLineUnavailable ||
      sendClaimsRef.current.has(activeId) ||
      pendingSendInFlight ||
      pendingSendAmbiguous ||
      !reply.trim() ||
      sending ||
      drafting
    )
      return;
    const threadId = activeId;
    const body = reply.trim();
    const bodyFingerprint = smsBodyFingerprint(body);
    const previousPending =
      pendingSendsRef.current[threadId] || pendingSends[threadId] || readPendingSmsSend(threadId);
    if (previousPending?.state === "sending" || previousPending?.state === "ambiguous") {
      setThreadErr(
        previousPending.message ||
          "The previous send is still unresolved. Do not resend it until BotBound confirms the carrier outcome.",
      );
      return;
    }
    if (previousPending && previousPending.bodyFingerprint !== bodyFingerprint) {
      setThreadErr(
        "A previous send from this conversation is still unresolved. Re-enter that exact message so BotBound can safely reuse its operation key.",
      );
      return;
    }
    // React state cannot synchronously fence two submit invocations in the
    // same turn. Claim the thread before creating a key or starting transport.
    if (sendClaimsRef.current.has(threadId)) return;
    sendClaimsRef.current.add(threadId);
    const requestedAgentId = agentId || null;
    const operation = ++sendOperationRef.current;
    draftOperationRef.current += 1;
    setDrafting(false);
    setDraftNotice(null);
    setDraftError(null);
    const idempotencyKey = previousPending?.idempotencyKey || createSmsIdempotencyKey(threadId);
    const sendingRecord: PendingSmsSend = {
      idempotencyKey,
      bodyFingerprint,
      state: "sending",
      message: null,
    };
    const optimistic: SmsMessage = {
      id: `optimistic-${Date.now()}`,
      direction: "out",
      body,
      created_at: new Date().toISOString(),
      agent_id: null,
    };

    rememberPendingSend(threadId, sendingRecord);
    setSending(true);
    setThreadErr(null);
    setReply("");
    setMessages((current) => [...current, optimistic]);

    try {
      const submit = () =>
        authFetch(`/api/sms/threads/${threadId}/reply`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify({ body }),
        });
      type SmsReplyResult = {
        ok?: boolean;
        reason?: string;
        error?: string;
        code?: string;
        provider_outcome_ambiguous?: boolean;
        do_not_resend?: boolean;
      } | null;
      let response = await submit();
      let result = (await response.json().catch(() => null)) as SmsReplyResult;
      // This code proves Twilio was never called. Replay the exact operation
      // once so the server can finish its idempotent balance refund instead of
      // turning an accounting outage into a permanently blocked conversation.
      if (result?.code === "SMS_PRE_PROVIDER_REFUND_UNCONFIRMED") {
        response = await submit();
        result = (await response.json().catch(() => null)) as SmsReplyResult;
      }
      const isCurrentThread =
        activeIdRef.current === threadId && sendOperationRef.current === operation;

      if (result?.code === "SMS_PRE_PROVIDER_REFUND_UNCONFIRMED") {
        const warning =
          result.reason ||
          "Twilio was not called. Retrying this exact message will continue the balance reconciliation without creating a second carrier send.";
        rememberPendingSend(threadId, {
          ...sendingRecord,
          state: "retryable",
          message: warning,
        });
        if (isCurrentThread) {
          setMessages((current) => current.filter((message) => message.id !== optimistic.id));
          setReply(body);
          setThreadErr(warning);
        }
        toastError("SMS balance reconciliation pending", warning);
        return;
      }

      if (
        result?.code === "SMS_PROVIDER_OUTCOME_AMBIGUOUS" ||
        result?.provider_outcome_ambiguous === true ||
        result?.do_not_resend === true
      ) {
        const warning =
          result?.reason ||
          "Delivery status is unknown. The carrier may have accepted this message. Do not resend it; contact support.";
        rememberPendingSend(threadId, {
          ...sendingRecord,
          state: "ambiguous",
          message: warning,
        });
        if (isCurrentThread) {
          setMessages((current) => current.filter((message) => message.id !== optimistic.id));
          setThreadErr(warning);
        }
        toastError("SMS status unknown. Do not resend", warning);
        return;
      }

      if (response.ok && result?.ok === true) {
        forgetPendingSend(threadId);
        success("SMS queued", "The carrier accepted the message for delivery.");
        if (activeIdRef.current === threadId) {
          await fetchMessages(threadId, activeThreadFetchRef.current?.signal);
        }
        if (activeAgentIdRef.current === requestedAgentId) await fetchThreads();
        return;
      }

      const message = result?.reason || result?.error || "Text could not be sent.";
      const explicitlyDefinitive =
        result?.ok === false && result.provider_outcome_ambiguous === false;
      const codedPreProviderRejection =
        typeof result?.code === "string" && DEFINITIVE_SMS_PRE_PROVIDER_CODES.has(result.code);
      const preProviderRejection = [400, 401, 403, 404, 405, 413, 415, 422].includes(
        response.status,
      );
      // Timeouts, early-data responses, rate limits, conflicts, and server
      // failures do not prove that the provider side effect did not happen.
      const definitiveRejection =
        explicitlyDefinitive || codedPreProviderRejection || preProviderRejection;
      if (definitiveRejection) {
        forgetPendingSend(threadId);
      } else {
        rememberPendingSend(threadId, {
          ...sendingRecord,
          state: "retryable",
          message:
            "The request was interrupted before delivery could be confirmed. Retrying the exact same message will reuse its safe operation key.",
        });
      }
      if (isCurrentThread) {
        setMessages((current) => current.filter((item) => item.id !== optimistic.id));
        setReply(body);
        setThreadErr(message);
      }
      toastError(definitiveRejection ? "SMS send rejected" : "SMS send interrupted", message);
    } catch (reason: any) {
      const message = reason?.message || "Try again.";
      rememberPendingSend(threadId, {
        ...sendingRecord,
        state: "retryable",
        message:
          "The request was interrupted before delivery could be confirmed. Retrying the exact same message will reuse its safe operation key.",
      });
      if (activeIdRef.current === threadId && sendOperationRef.current === operation) {
        setMessages((current) => current.filter((item) => item.id !== optimistic.id));
        setReply(body);
        setThreadErr(message);
      }
      toastError("SMS send interrupted", message);
    } finally {
      sendClaimsRef.current.delete(threadId);
      if (activeIdRef.current === threadId && sendOperationRef.current === operation) {
        setSending(false);
      }
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
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch("")}
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

      {fetchErr && threads.length ? (
        <StatusNotice tone="destructive" title="Texts unavailable" className="m-3 sm:m-4">
          {fetchErr}
        </StatusNotice>
      ) : null}

      <div
        className="wl-channel-inbox-grid grid min-h-0 flex-1 lg:grid-cols-[minmax(17rem,0.74fr)_minmax(0,1.26fr)]"
        data-empty={listOwnsOnlyState ? "true" : undefined}
      >
        <div
          className={`${listOwnsOnlyState ? "block" : activeId ? "hidden lg:block" : "block"} min-h-0 overflow-y-auto border-r border-border`}
        >
          {fetchErr && !threads.length ? (
            <EmptyState
              icon={<MessageSquare className="size-5" aria-hidden="true" />}
              title="Texts unavailable"
              description={fetchErr}
              density="compact"
              titleTone="ui"
              withHalo={false}
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void fetchThreads()}
                >
                  Retry
                </Button>
              }
            />
          ) : loading && !threads.length ? (
            <div className="w-full max-w-lg space-y-2 p-3" aria-busy="true">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="rounded-xl border border-border p-3">
                  <Skeleton shape="text" className="h-4 w-32" />
                  <Skeleton shape="text" className="mt-2 h-3 w-20" />
                </div>
              ))}
            </div>
          ) : hasSearch && !visibleThreads.length ? (
            <EmptyState
              icon={<MessageSquare className="size-5" aria-hidden="true" />}
              title="No matching texts"
              description="Try a different number or status."
              density="compact"
              titleTone="ui"
              withHalo={false}
            />
          ) : !visibleThreads.length && !fetchErr ? (
            <EmptyState
              icon={<MessageSquare className="size-5" aria-hidden="true" />}
              title={agentId ? "No texts for this Bot" : "No texts yet"}
              density="compact"
              titleTone="ui"
              withHalo={false}
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
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{thread.status || "Open"}</span>
                      <span>
                        {thread.destination_number
                          ? `From ${thread.destination_number}`
                          : "Sending line unavailable"}
                      </span>
                      {pendingSends[thread.id]?.state === "ambiguous" ? (
                        <span className="font-semibold text-destructive">Delivery unknown</span>
                      ) : pendingSends[thread.id]?.state === "retryable" ? (
                        <span className="font-semibold text-amber-700 dark:text-amber-300">
                          Safe retry pending
                        </span>
                      ) : null}
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

        <div
          className={`${listOwnsOnlyState ? "hidden" : activeId ? "block" : "hidden lg:block"} min-h-0`}
        >
          {!activeThread ? (
            <EmptyState
              title="Select a conversation"
              density="compact"
              titleTone="ui"
              withHalo={false}
            />
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
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {activeThread.destination_number
                    ? `Replies send from ${activeThread.destination_number}`
                    : "No verified sending line is attached to this conversation."}
                </p>
              </header>

              {threadErr ? (
                <StatusNotice
                  tone="destructive"
                  title="Conversation unavailable"
                  className="m-3 sm:m-4"
                >
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
                        author={message.direction === "out" ? "assistant" : "customer"}
                        label={
                          message.direction === "out"
                            ? message.agent_id
                              ? "Bot"
                              : "You"
                            : activeThread.customer_number
                        }
                        channel="text"
                        timestamp={formatSmsTime(message.created_at)}
                      >
                        {message.body}
                      </ConversationMessage>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <details className="group shrink-0 border-t border-border bg-card/35">
                <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-foreground sm:px-4">
                  <span>Outcome</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="max-w-28 truncate font-normal capitalize">
                      {activeThread.status || "open"}
                    </span>
                    <ChevronDown
                      className="size-3.5 transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </span>
                </summary>
                <div className="border-t border-border px-3 pt-3 sm:px-4">
                  <SmsOutcomePanel
                    key={activeThread.id}
                    threadId={activeThread.id}
                    initialStatus={activeThread.status}
                    onStatusChange={handleOutcomeStatusChange}
                  />
                </div>
              </details>

              <form
                className="grid gap-2 border-t border-border p-3 sm:p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendReply();
                }}
              >
                {draftNotice ? <StatusNotice tone="info">{draftNotice}</StatusNotice> : null}
                {draftError ? (
                  <StatusNotice tone="destructive" title="Bot could not write this reply">
                    {draftError}
                  </StatusNotice>
                ) : null}
                {activePendingSend?.state === "ambiguous" ? (
                  <StatusNotice tone="destructive" title="Delivery status unknown">
                    {activePendingSend.message ||
                      "The carrier may have accepted the previous message. Do not resend it; contact support."}
                  </StatusNotice>
                ) : activePendingSend?.state === "retryable" ? (
                  <StatusNotice tone="warning" title="Safe retry pending">
                    {activePendingSend.message ||
                      "Re-enter the exact same message to retry with its existing operation key."}
                  </StatusNotice>
                ) : null}
                {routingConflict ? (
                  <StatusNotice tone="warning" title="Sending line needs review">
                    This customer reached more than one Bot number. BotBound will not draft or send
                    until the conversation is assigned to a specific destination line.
                  </StatusNotice>
                ) : missingDestination ? (
                  <StatusNotice tone="warning" title="Sending line unavailable">
                    This conversation has no verified destination number. BotBound will not draft or
                    send until a specific Twilio line is attached.
                  </StatusNotice>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={
                      sendingLineUnavailable ||
                      Boolean(activePendingSend) ||
                      drafting ||
                      sending ||
                      messagesLoading
                    }
                    onClick={() => void writeWithBot()}
                    aria-label="Write reply with Bot"
                  >
                    {drafting ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Sparkles className="size-4" aria-hidden="true" />
                    )}
                    <span className="hidden sm:inline">Write with Bot</span>
                  </Button>
                  <Input
                    value={reply}
                    disabled={
                      sendingLineUnavailable ||
                      pendingSendInFlight ||
                      pendingSendAmbiguous ||
                      drafting ||
                      sending
                    }
                    onChange={(event) => {
                      setReply(event.target.value);
                      setDraftNotice(null);
                      setDraftError(null);
                    }}
                    placeholder="Message"
                    aria-label="Text reply"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="submit"
                    disabled={
                      sendingLineUnavailable ||
                      pendingSendInFlight ||
                      pendingSendAmbiguous ||
                      drafting ||
                      sending ||
                      !reply.trim()
                    }
                    aria-label="Send text"
                  >
                    {sending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
