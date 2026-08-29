import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, CheckCircle2, ChevronDown, Loader2, Mail, RefreshCw } from "lucide-react";

import { authFetch } from "../lib/api";
import { Badge, Button, EmptyState, Skeleton, type BadgeProps } from "./atoms";
import { ConversationActivity, ConversationMessage, SearchField, StatusNotice } from "./molecules";

type OutcomeStatus = "open" | "waiting" | "escalated" | "booked" | "resolved";

type EmailThread = {
  id: string;
  subject: string;
  sender: string;
  summary: string;
  lastMessageAt: string;
  status: OutcomeStatus;
};

type EmailMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

type ThreadDetail = {
  thread: EmailThread;
  messages: EmailMessage[];
  handoff: { id: string; status: string } | null;
};

type ThreadsResponse = {
  threads?: Array<Record<string, unknown>>;
  error?: string;
};

const OUTCOME_META: Record<
  OutcomeStatus,
  { label: string; variant: NonNullable<BadgeProps["variant"]> }
> = {
  open: { label: "Needs review", variant: "info" },
  waiting: { label: "Waiting", variant: "default" },
  escalated: { label: "Handoff", variant: "warning" },
  booked: { label: "Booked", variant: "success" },
  resolved: { label: "Resolved", variant: "outline" },
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeStatus(value: unknown): OutcomeStatus {
  return value === "waiting" || value === "escalated" || value === "booked" || value === "resolved"
    ? value
    : "open";
}

function normalizeThread(row: Record<string, unknown>): EmailThread {
  return {
    id: text(row.id),
    subject: text(row.subject, "Untitled conversation"),
    sender: text(row.customer_email) || text(row.sender_email) || "Unknown sender",
    summary: text(row.summary, "No preview is available yet."),
    lastMessageAt: text(row.last_message_at) || text(row.created_at),
    status: normalizeStatus(row.status),
  };
}

function normalizeMessage(row: Record<string, unknown>): EmailMessage {
  return {
    id: text(row.id),
    role: text(row.role, "user"),
    content: text(row.content, "No message body is available yet."),
    createdAt: text(row.created_at),
  };
}

function formatTimestamp(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function isAssistantMessage(role: string) {
  return role === "ai" || role === "assistant" || role === "out";
}

function activityState(status: OutcomeStatus): "pending" | "active" | "complete" {
  if (status === "resolved" || status === "booked") return "complete";
  if (status === "escalated") return "active";
  return "pending";
}

function InboxLoadingState({ frameClass }: { frameClass: string }) {
  return (
    <section
      className={`${frameClass} grid flex-1 place-items-center px-5`}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="w-full max-w-md space-y-3 rounded-[var(--radius-xl)] border border-border bg-card p-6 shadow-[var(--wireline-elevation-sm)]">
        <Skeleton shape="text" className="h-4 w-28" />
        <Skeleton shape="text" className="h-7 w-3/4" />
        <Skeleton shape="text" className="h-4 w-full" />
        <Skeleton shape="text" className="h-4 w-5/6" />
      </div>
    </section>
  );
}

function EmailBackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-primary lg:hidden"
      onClick={onBack}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Email
    </button>
  );
}

export default function EmailInbox({
  embedded = false,
  agentId,
  accountId,
}: {
  embedded?: boolean;
  agentId?: string | null;
  accountId?: string | null;
}) {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [outcomeBusy, setOutcomeBusy] = useState<OutcomeStatus | "handoff" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = new URLSearchParams();
      if (agentId) queryParams.set("agent_id", agentId);
      if (accountId) queryParams.set("account_id", accountId);
      const suffix = queryParams.toString();
      const response = await authFetch(`/api/emails/threads${suffix ? `?${suffix}` : ""}`);
      const body = (await response.json().catch(() => null)) as ThreadsResponse | null;
      if (!response.ok) throw new Error(body?.error || "Could not load email conversations.");
      const nextThreads = Array.isArray(body?.threads) ? body.threads.map(normalizeThread) : [];
      setThreads(nextThreads);
      setSelectedId((current) =>
        current && nextThreads.some((thread) => thread.id === current) ? current : null,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load email conversations.");
    } finally {
      setLoading(false);
    }
  }, [accountId, agentId]);

  const loadThreadDetail = useCallback(async (threadId: string, signal?: AbortSignal) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await authFetch(`/api/emails/threads/${threadId}/outcome`, { signal });
      const body = (await response.json().catch(() => null)) as {
        thread?: Record<string, unknown>;
        messages?: Array<Record<string, unknown>>;
        handoff?: { id: string; status: string } | null;
        error?: string;
      } | null;
      if (!response.ok || !body?.thread)
        throw new Error(body?.error || "Could not load this conversation.");
      if (signal?.aborted) return;
      setDetail({
        thread: normalizeThread(body.thread),
        messages: Array.isArray(body.messages) ? body.messages.map(normalizeMessage) : [],
        handoff: body.handoff || null,
      });
    } catch (cause) {
      if (signal?.aborted) return;
      setDetailError(cause instanceof Error ? cause.message : "Could not load this conversation.");
    } finally {
      if (!signal?.aborted) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    // Never carry one conversation's detail into another selection. Without
    // this reset, a failed second request can leave the previous sender and
    // messages rendered under the newly selected list row.
    setDetail(null);
    const controller = new AbortController();
    void loadThreadDetail(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadThreadDetail, selectedId]);

  const syncInbox = async () => {
    setSyncing(true);
    setError(null);
    try {
      const response = await authFetch("/api/emails/sync", { method: "POST" });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        fetched?: number;
        message?: string;
      } | null;
      if (!response.ok) throw new Error(body?.error || "Try again in a moment.");
      setNotice(body?.message || "Inbox refreshed.");
      await loadThreads();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh email.");
    } finally {
      setSyncing(false);
    }
  };

  const persistOutcome = async (status: OutcomeStatus) => {
    if (!selectedId) return;
    const response = await authFetch(`/api/emails/threads/${selectedId}/outcome`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const body = (await response.json().catch(() => null)) as {
      thread?: Record<string, unknown>;
      error?: string;
    } | null;
    if (!response.ok || !body?.thread)
      throw new Error(body?.error || "Could not update this conversation.");
    const updated = normalizeThread(body.thread);
    setThreads((current) => current.map((thread) => (thread.id === updated.id ? updated : thread)));
    setDetail((current) => (current ? { ...current, thread: updated } : current));
  };

  const updateOutcome = async (status: OutcomeStatus) => {
    if (!selectedId || outcomeBusy) return;
    setOutcomeBusy(status);
    setDetailError(null);
    try {
      await persistOutcome(status);
    } catch (cause) {
      setDetailError(
        cause instanceof Error ? cause.message : "Could not update this conversation.",
      );
    } finally {
      setOutcomeBusy(null);
    }
  };

  const requestHandoff = async () => {
    if (!selectedId || outcomeBusy) return;
    setOutcomeBusy("handoff");
    setDetailError(null);
    try {
      const response = await authFetch(`/api/emails/threads/${selectedId}/handoff`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as {
        handoff?: { id: string; status: string };
        error?: string;
      } | null;
      if (!response.ok || !body?.handoff)
        throw new Error(body?.error || "Could not request a handoff.");
      setDetail((current) => (current ? { ...current, handoff: body.handoff || null } : current));
      // Handoff creation and thread status are two durable writes. Do not route
      // the second through updateOutcome(): its user-action busy guard is
      // intentionally active while this handoff request is in flight.
      await persistOutcome("escalated");
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Could not request a handoff.");
    } finally {
      setOutcomeBusy(null);
    }
  };

  const visibleThreads = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return threads;
    return threads.filter((thread) =>
      [thread.subject, thread.sender, thread.summary, thread.status]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, threads]);

  const selected = detail?.thread ?? threads.find((thread) => thread.id === selectedId) ?? null;
  const hasSearch = query.trim().length > 0;
  const listOwnsOnlyState = visibleThreads.length === 0;
  const frameClass = embedded
    ? "flex min-h-0 flex-1 flex-col overflow-hidden"
    : "wl-paper flex min-h-[620px] flex-1 flex-col overflow-hidden";

  const outcomePanel = selected ? (
    <>
      <div className="grid gap-2 sm:grid-cols-3">
        <ConversationActivity
          state="complete"
          title="Last activity"
          detail={formatTimestamp(selected.lastMessageAt)}
        />
        <ConversationActivity
          state={activityState(selected.status)}
          title="Status"
          detail={OUTCOME_META[selected.status].label}
        />
        {detail?.handoff ? (
          <ConversationActivity state="active" title="Handoff" detail={detail.handoff.status} />
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["waiting", "booked", "resolved"] as OutcomeStatus[]).map((status) => (
          <Button
            key={status}
            type="button"
            size="sm"
            variant="secondary"
            disabled={Boolean(outcomeBusy) || selected.status === status}
            onClick={() => void updateOutcome(status)}
          >
            {outcomeBusy === status ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="size-3.5" />
            )}
            {OUTCOME_META[status].label}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={Boolean(outcomeBusy) || Boolean(detail?.handoff)}
          onClick={() => void requestHandoff()}
        >
          {outcomeBusy === "handoff" ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Handoff
        </Button>
      </div>
    </>
  ) : null;

  if (loading && !threads.length) return <InboxLoadingState frameClass={frameClass} />;

  return (
    <section className={frameClass} aria-label="Email inbox">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5 sm:px-4">
        <SearchField
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          placeholder="Search email"
          aria-label="Search email conversations"
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void syncInbox()}
          disabled={syncing}
        >
          {syncing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {notice ? (
        <StatusNotice tone="success" title="Updated" className="mx-3 mt-3 sm:mx-4">
          {notice}
        </StatusNotice>
      ) : null}
      {error && threads.length ? (
        <StatusNotice tone="destructive" title="Inbox unavailable" className="mx-3 mt-3 sm:mx-4">
          {error}
        </StatusNotice>
      ) : null}

      <div
        className="wl-channel-inbox-grid grid min-h-0 flex-1 lg:grid-cols-[minmax(17rem,0.74fr)_minmax(0,1.26fr)]"
        data-empty={listOwnsOnlyState ? "true" : undefined}
      >
        <div
          className={`min-h-0 overflow-y-auto ${listOwnsOnlyState ? "block" : selectedId ? "hidden lg:block" : "block"} border-r border-border`}
        >
          {error && !threads.length ? (
            <EmptyState
              icon={<Mail className="size-5" aria-hidden="true" />}
              title="Inbox unavailable"
              description={error}
              density="compact"
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void loadThreads()}
                >
                  Retry
                </Button>
              }
            />
          ) : hasSearch && !visibleThreads.length ? (
            <EmptyState
              icon={<Mail className="size-5" aria-hidden="true" />}
              title="No matching email"
              description="Try a different sender, subject, status, or keyword."
              density="compact"
            />
          ) : !visibleThreads.length ? (
            <EmptyState
              icon={<Mail className="size-5" aria-hidden="true" />}
              title={agentId ? "No email for this Bot" : "No email yet"}
              description={
                agentId || accountId
                  ? undefined
                  : "Connected mailbox conversations will appear here."
              }
              density="compact"
              action={
                !agentId && !accountId ? (
                  <Button asChild variant="secondary" size="sm">
                    <Link to="/connections">Connect email</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {visibleThreads.map((thread) => {
                const active = thread.id === selectedId;
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setDetail(null);
                        setDetailError(null);
                        setSelectedId(thread.id);
                      }}
                      aria-pressed={active}
                      className={`w-full px-4 py-3 text-left transition-colors ${
                        active ? "bg-primary/7" : "hover:bg-muted/45"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <strong className="wl-preserve-case block truncate text-sm font-semibold text-foreground">
                            {thread.sender}
                          </strong>
                          <span className="wl-preserve-case mt-0.5 block truncate text-xs text-muted-foreground">
                            {thread.subject}
                          </span>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatTimestamp(thread.lastMessageAt)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant={OUTCOME_META[thread.status].variant}>
                          {OUTCOME_META[thread.status].label}
                        </Badge>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          className={`min-h-0 ${listOwnsOnlyState ? "hidden" : selectedId ? "block" : "hidden lg:block"}`}
        >
          {!selectedId ? (
            <EmptyState
              icon={<Mail className="size-5" aria-hidden="true" />}
              title="Select a conversation"
              density="compact"
            />
          ) : detailLoading ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="mx-4 mt-3">
                <EmailBackButton onBack={() => setSelectedId(null)} />
              </div>
              <div className="grid min-h-0 flex-1 place-items-center text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading…
                </span>
              </div>
            </div>
          ) : detailError && !detail ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="mx-4 mt-3">
                <EmailBackButton onBack={() => setSelectedId(null)} />
              </div>
              <EmptyState
                icon={<Mail className="size-5" aria-hidden="true" />}
                title="Conversation unavailable"
                description={detailError}
                density="compact"
                action={
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void loadThreadDetail(selectedId)}
                  >
                    Retry
                  </Button>
                }
              />
            </div>
          ) : selected ? (
            <div className="flex h-full min-h-0 flex-col">
              <header className="border-b border-border px-4 py-3 sm:px-5">
                <div className="mb-2 lg:hidden">
                  <EmailBackButton onBack={() => setSelectedId(null)} />
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="wl-preserve-case truncate text-base font-semibold text-foreground">
                      {selected.subject}
                    </h2>
                    <p className="wl-preserve-case mt-1 truncate text-xs text-muted-foreground">
                      {selected.sender}
                    </p>
                  </div>
                  <Badge variant={OUTCOME_META[selected.status].variant}>
                    {OUTCOME_META[selected.status].label}
                  </Badge>
                </div>
              </header>

              {detailError ? (
                <StatusNotice
                  tone="destructive"
                  title="Conversation needs attention"
                  className="m-3 sm:m-4"
                >
                  {detailError}
                </StatusNotice>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                {detail?.messages.length ? (
                  <div className="space-y-3">
                    {detail.messages.map((message) => {
                      const assistant = isAssistantMessage(message.role);
                      return (
                        <ConversationMessage
                          key={message.id}
                          author={assistant ? "assistant" : "customer"}
                          label={assistant ? "Bot" : selected.sender}
                          timestamp={formatTimestamp(message.createdAt)}
                          channel="email"
                        >
                          {message.content}
                        </ConversationMessage>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No message body is available yet.</p>
                )}
              </div>

              <footer className="shrink-0 border-t border-border bg-card/35">
                <details className="group sm:hidden">
                  <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-foreground">
                    <span>Outcome</span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="max-w-28 truncate font-normal">
                        {OUTCOME_META[selected.status].label}
                      </span>
                      <ChevronDown
                        className="size-3.5 transition-transform group-open:rotate-180"
                        aria-hidden="true"
                      />
                    </span>
                  </summary>
                  <div className="border-t border-border p-3">{outcomePanel}</div>
                </details>
                <div className="hidden p-4 sm:block">{outcomePanel}</div>
              </footer>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
