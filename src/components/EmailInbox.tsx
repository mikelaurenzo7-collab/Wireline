import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Loader2,
  Mail,
  RefreshCw,
  Route,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";
import { authFetch } from "../lib/api";

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

const OUTCOME_META: Record<OutcomeStatus, { label: string; className: string }> = {
  open: { label: "Needs review", className: "border-primary/25 bg-primary/10 text-primary" },
  waiting: { label: "Waiting", className: "border-border bg-muted text-muted-foreground" },
  escalated: {
    label: "Handoff",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  booked: {
    label: "Booked",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  resolved: { label: "Resolved", className: "border-border bg-secondary text-foreground" },
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

function senderInitial(sender: string) {
  return sender.trim().slice(0, 1).toUpperCase() || "?";
}

function isAssistantMessage(role: string) {
  return role === "ai" || role === "assistant" || role === "out";
}

export default function EmailInbox({ embedded = false }: { embedded?: boolean }) {
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

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/emails/threads");
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
  }, []);

  const loadThreadDetail = useCallback(async (threadId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await authFetch(`/api/emails/threads/${threadId}/outcome`);
      const body = (await response.json().catch(() => null)) as {
        thread?: Record<string, unknown>;
        messages?: Array<Record<string, unknown>>;
        handoff?: { id: string; status: string } | null;
        error?: string;
      } | null;
      if (!response.ok || !body?.thread)
        throw new Error(body?.error || "Could not load this conversation.");
      setDetail({
        thread: normalizeThread(body.thread),
        messages: Array.isArray(body.messages) ? body.messages.map(normalizeMessage) : [],
        handoff: body.handoff || null,
      });
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Could not load this conversation.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    void loadThreadDetail(selectedId);
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
      if (!response.ok) throw new Error(body?.error || "Inbox refresh failed.");
      await loadThreads();
      if (body?.message) {
        setNotice(body.message);
      } else if (body?.fetched) {
        setNotice(
          `Inbox refreshed — ${body.fetched} message${body.fetched === 1 ? "" : "s"} checked.`,
        );
      } else {
        setNotice("Inbox refresh started.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inbox refresh failed.");
    } finally {
      setSyncing(false);
    }
  };

  const setOutcome = async (status: OutcomeStatus, handoff = false) => {
    if (!selectedId) return;
    setOutcomeBusy(handoff ? "handoff" : status);
    setDetailError(null);
    setNotice(null);
    try {
      const response = await authFetch(`/api/emails/threads/${selectedId}/outcome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, handoff }),
      });
      const body = (await response.json().catch(() => null)) as {
        thread?: Record<string, unknown>;
        handoff_task_id?: string | null;
        error?: string;
      } | null;
      if (!response.ok || !body?.thread)
        throw new Error(body?.error || "Could not update the outcome.");
      const updated = normalizeThread(body.thread);
      setThreads((current) =>
        current.map((thread) => (thread.id === updated.id ? { ...thread, ...updated } : thread)),
      );
      setDetail((current) =>
        current
          ? {
              ...current,
              thread: updated,
              handoff: body.handoff_task_id
                ? { id: body.handoff_task_id, status: "pending" }
                : current.handoff,
            }
          : current,
      );
      setNotice(
        handoff
          ? "A human follow-up task is now in the queue."
          : `Conversation marked ${OUTCOME_META[status].label.toLowerCase()}.`,
      );
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Could not update the outcome.");
    } finally {
      setOutcomeBusy(null);
    }
  };

  const selectedThread = useMemo(
    () =>
      selectedId
        ? threads.find((thread) => thread.id === selectedId) || detail?.thread || null
        : null,
    [detail?.thread, selectedId, threads],
  );

  const frameClass = embedded
    ? "flex h-full min-h-0 flex-col bg-background"
    : "min-h-screen bg-background px-5 py-8 sm:px-6";

  if (loading) {
    return (
      <section
        className={`${frameClass} grid place-items-center px-5`}
        aria-busy="true"
        aria-live="polite"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-11 place-items-center rounded-[var(--radius-lg)] border border-border bg-card text-primary shadow-[var(--wl-shadow-sm)]">
            <Loader2 className="size-5 animate-spin" />
          </span>
          <p className="text-sm text-muted-foreground">Preparing your outcomes center…</p>
        </div>
      </section>
    );
  }

  if (threads.length === 0) {
    return (
      <section className={`${frameClass} grid place-items-center px-5 text-center`}>
        <div className="studio-card w-full max-w-md px-6 py-10 sm:px-8">
          <span className="mx-auto grid size-12 place-items-center rounded-[var(--radius-xl)] bg-muted text-primary">
            <Mail className="size-5" />
          </span>
          <p className="studio-kicker mt-5">Outcome center</p>
          <h2 className="wl-section-title mt-2">No email conversations yet.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Connect an inbox, then Wireline can organize the conversations that need attention—from
            lead replies and appointment coordination to follow-up and recap.
          </p>
          {error ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/connections" className="studio-primary-button">
              Open connections
            </Link>
            <button
              type="button"
              onClick={() => void syncInbox()}
              disabled={syncing}
              className="studio-secondary-button"
            >
              {syncing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Refresh inbox
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`${frameClass} min-h-0`}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <p className="studio-kicker">Outcome center · email</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Inspect the conversation, choose the next state, and make the handoff durable.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void syncInbox()}
          disabled={syncing}
          className="studio-secondary-button min-h-9 px-3 text-sm"
        >
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {syncing ? "Refreshing" : "Refresh"}
        </button>
      </header>

      {error ? (
        <div
          className="mx-5 mt-4 flex items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-foreground sm:mx-6"
          role="alert"
        >
          <div className="flex min-w-0 items-start gap-2.5">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <p>{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadThreads()}
            className="shrink-0 text-sm font-semibold text-primary hover:text-[color:var(--wl-accent-hover)]"
          >
            Retry
          </button>
        </div>
      ) : null}

      {notice ? (
        <p className="mx-5 mt-4 text-sm text-primary sm:mx-6" role="status">
          {notice}
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(320px,.95fr)_minmax(0,1.35fr)]">
        <div className="wl-scroll min-h-0 overflow-y-auto border-b border-border p-3 xl:border-b-0 xl:border-r sm:p-4">
          <ul className="space-y-2" aria-label="Email conversations">
            {threads.map((thread) => {
              const outcome = OUTCOME_META[thread.status];
              const selected = selectedId === thread.id;
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setSelectedId(thread.id);
                      setNotice(null);
                    }}
                    className={`w-full rounded-[var(--radius-lg)] border p-4 text-left transition-colors ${selected ? "border-primary/35 bg-primary/[.055]" : "border-border bg-card hover:bg-muted/70"}`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-accent text-sm font-semibold text-primary"
                        aria-hidden
                      >
                        {senderInitial(thread.sender)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {thread.subject}
                            </p>
                            <p className="mt-1 truncate text-xs font-medium text-muted-foreground">
                              {thread.sender}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[.06em] ${outcome.className}`}
                          >
                            {outcome.label}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">
                          {thread.summary}
                        </p>
                        {thread.lastMessageAt ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            {formatTimestamp(thread.lastMessageAt)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="wl-scroll min-h-0 overflow-y-auto bg-secondary/30 p-4 sm:p-6">
          {!selectedThread ? (
            <div className="grid min-h-[360px] place-items-center rounded-[var(--radius-xl)] border border-dashed border-border bg-card p-8 text-center">
              <div>
                <span className="mx-auto grid size-11 place-items-center rounded-[var(--radius-lg)] bg-muted text-primary">
                  <Sparkles className="size-5" />
                </span>
                <h2 className="wl-section-title mt-4 text-xl">Choose a conversation.</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  Review the thread, then set a clear operational outcome instead of leaving it as
                  an unread summary.
                </p>
              </div>
            </div>
          ) : detailLoading ? (
            <div
              className="grid min-h-[360px] place-items-center rounded-[var(--radius-xl)] border border-border bg-card p-8 text-center"
              aria-busy="true"
            >
              <Loader2 className="size-5 animate-spin text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">Loading the conversation…</p>
            </div>
          ) : detailError ? (
            <div
              className="rounded-[var(--radius-xl)] border border-destructive/25 bg-destructive/5 p-5"
              role="alert"
            >
              <p className="font-semibold text-foreground">Could not open this conversation.</p>
              <p className="mt-1 text-sm text-muted-foreground">{detailError}</p>
              <button
                type="button"
                onClick={() => void loadThreadDetail(selectedThread.id)}
                className="studio-secondary-button mt-4"
              >
                Try again
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              <section className="studio-card p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="studio-kicker">Conversation outcome</p>
                    <h2 className="mt-2 text-xl font-semibold tracking-[-.03em] text-foreground sm:text-2xl">
                      {selectedThread.subject}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">{selectedThread.sender}</p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.06em] ${OUTCOME_META[selectedThread.status].className}`}
                  >
                    {OUTCOME_META[selectedThread.status].label}
                  </span>
                </div>
                <p className="mt-5 rounded-[var(--radius-lg)] border border-border bg-secondary p-4 text-sm leading-6 text-muted-foreground">
                  {selectedThread.summary}
                </p>
              </section>

              <section className="studio-card overflow-hidden">
                <div className="border-b border-border px-5 py-4 sm:px-6">
                  <p className="wl-card-title">Conversation record</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    The underlying messages available to this workspace.
                  </p>
                </div>
                <div className="space-y-3 p-4 sm:p-5">
                  {detail?.messages.length ? (
                    detail.messages.map((message) => {
                      const assistantMessage = isAssistantMessage(message.role);
                      return (
                        <article
                          key={message.id}
                          className={`max-w-[92%] rounded-[var(--radius-lg)] border p-3.5 text-sm leading-6 ${assistantMessage ? "ml-auto border-primary/25 bg-primary/10 text-foreground" : "border-border bg-card text-foreground"}`}
                        >
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.08em] text-muted-foreground">
                            {assistantMessage ? "Wireline" : "Customer"}
                          </p>
                          <p className="whitespace-pre-wrap">{message.content}</p>
                          {message.createdAt ? (
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              {formatTimestamp(message.createdAt)}
                            </p>
                          ) : null}
                        </article>
                      );
                    })
                  ) : (
                    <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-secondary px-4 py-5 text-sm leading-6 text-muted-foreground">
                      The synced inbox currently has the thread summary but no stored message bodies
                      for this conversation. The outcome controls still let the team make ownership
                      explicit.
                    </div>
                  )}
                </div>
              </section>

              <section className="studio-card p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-primary/10 text-primary">
                    <Route className="size-4" />
                  </span>
                  <div>
                    <p className="wl-card-title">Set the next state</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      This is an accountable team decision, not an inferred AI score.
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => void setOutcome("waiting")}
                    disabled={outcomeBusy !== null}
                    className="studio-secondary-button text-sm"
                  >
                    {outcomeBusy === "waiting" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Clock3 className="size-4" />
                    )}{" "}
                    Mark waiting
                  </button>
                  <button
                    type="button"
                    onClick={() => void setOutcome("booked")}
                    disabled={outcomeBusy !== null}
                    className="studio-secondary-button text-sm"
                  >
                    {outcomeBusy === "booked" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}{" "}
                    Mark booked
                  </button>
                  <button
                    type="button"
                    onClick={() => void setOutcome("escalated", true)}
                    disabled={outcomeBusy !== null}
                    className="studio-secondary-button text-sm"
                  >
                    {outcomeBusy === "handoff" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <UserRoundCheck className="size-4" />
                    )}{" "}
                    Handoff to team
                  </button>
                  <button
                    type="button"
                    onClick={() => void setOutcome("resolved")}
                    disabled={outcomeBusy !== null}
                    className="studio-primary-button text-sm"
                  >
                    {outcomeBusy === "resolved" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="size-4" />
                    )}{" "}
                    Resolve
                  </button>
                  {selectedThread.status !== "open" ? (
                    <button
                      type="button"
                      onClick={() => void setOutcome("open")}
                      disabled={outcomeBusy !== null}
                      className="text-sm font-semibold text-primary hover:text-[color:var(--wl-accent-hover)]"
                    >
                      Reopen
                    </button>
                  ) : null}
                </div>
                {detail?.handoff ? (
                  <p className="mt-4 flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                    <ArrowUpRight className="size-4" /> A follow-up task is active for this
                    conversation.
                  </p>
                ) : null}
                {detailError ? (
                  <p className="mt-4 text-sm text-destructive" role="alert">
                    {detailError}
                  </p>
                ) : null}
              </section>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
