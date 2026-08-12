import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  Mail,
  RefreshCw,
  Route,
  Sparkles,
  UserRoundCheck,
} from "lucide-react";

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

function senderInitial(sender: string) {
  return sender.trim().slice(0, 1).toUpperCase() || "?";
}

function isAssistantMessage(role: string) {
  return role === "ai" || role === "assistant" || role === "out";
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
  const [query, setQuery] = useState("");

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

  // The signal is what keeps the pane honest. Selecting thread A and then B
  // fires two overlapping requests, and if A resolves last it wins the state
  // write — rendering one conversation's messages under another conversation's
  // header. Abort makes the stale response drop its result instead of racing.
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
      // A superseded request rejects with AbortError. Surfacing that would put a
      // failure banner over the conversation the reader actually asked for.
      if (signal?.aborted) return;
      setDetailError(cause instanceof Error ? cause.message : "Could not load this conversation.");
    } finally {
      // The newer request already set this true; clearing it here would flash
      // the loaded pane over a fetch that is still running.
      if (!signal?.aborted) setDetailLoading(false);
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
      await loadThreads();
      setNotice(
        body?.message ||
          (body?.fetched
            ? `Inbox refreshed — ${body.fetched} message${body.fetched === 1 ? "" : "s"} checked.`
            : "Inbox refresh started."),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Try again in a moment.");
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
                : updated.status === "escalated"
                  ? current.handoff
                  : null,
            }
          : current,
      );
      setNotice(
        handoff
          ? "A human follow-up task is now in the queue."
          : `Conversation marked ${OUTCOME_META[updated.status].label.toLowerCase()}.`,
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

  const visibleThreads = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return threads;
    return threads.filter((thread) =>
      [thread.subject, thread.sender, thread.summary, OUTCOME_META[thread.status].label]
        .join(" ")
        .toLocaleLowerCase()
        .includes(term),
    );
  }, [query, threads]);

  const frameClass = embedded
    ? "flex h-full min-h-0 flex-col bg-background"
    : "min-h-screen bg-background px-5 py-8 sm:px-6";
  if (loading) return <InboxLoadingState frameClass={frameClass} />;

  if (threads.length === 0) {
    return (
      <section className={`${frameClass} flex flex-1 flex-col px-5 text-center`}>
        <EmptyState
          fill
          framed
          density="compact"
          titleTone="ui"
          withHalo={false}
          icon={<Mail className="size-5" />}
          title="Connect your inbox"
          description="Connect Gmail or Outlook to sync customer threads."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link to="/connections">Open Connections</Link>
              </Button>
              {error ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={syncing}
                  onClick={() => void syncInbox()}
                >
                  {syncing ? (
                    <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw aria-hidden="true" className="size-4" />
                  )}
                  {syncing ? "Refreshing" : "Try again"}
                </Button>
              ) : null}
            </div>
          }
        />
        {error ? (
          <StatusNotice tone="destructive" className="mx-auto mt-3 max-w-lg text-left">
            {error}
          </StatusNotice>
        ) : null}
      </section>
    );
  }

  return (
    <section className={`${frameClass} min-h-0`}>
      {/* Embedded in the Inbox page the tab strip above already draws a divider,
          so a second bordered band holding one button reads as a dead zone —
          keep the band borderless and tight there; standalone keeps its header. */}
      <header
        className={`flex shrink-0 flex-wrap items-center justify-end gap-3 px-5 sm:px-6 ${
          embedded ? "py-2" : "border-b border-[var(--wireline-color-border-default)] py-3"
        }`}
      >
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={syncing}
          onClick={() => void syncInbox()}
        >
          {syncing ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" className="size-4" />
          )}
          {syncing ? "Refreshing" : "Refresh"}
        </Button>
      </header>

      <div className="space-y-3 px-5 pt-4 sm:px-6">
        {error ? (
          <StatusNotice tone="destructive" title="Inbox refresh failed">
            {error}
          </StatusNotice>
        ) : null}
        {notice ? (
          <ConversationActivity state="complete" title="Inbox updated" detail={notice} />
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(340px,1fr)_minmax(0,1.4fr)]">
        <div className="wl-scroll min-h-0 overflow-y-auto border-b border-border p-3 xl:border-b-0 xl:border-r sm:p-4">
          <div className="mb-3 flex items-center gap-3">
            <SearchField
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onClear={() => setQuery("")}
              aria-label="Search conversations"
              placeholder="Search conversations"
              className="min-w-0 flex-1"
            />
            <span className="shrink-0 text-xs text-muted-foreground" aria-live="polite">
              {visibleThreads.length}/{threads.length}
            </span>
          </div>
          <ul className="space-y-2" aria-label="Email conversations">
            {visibleThreads.length ? (
              visibleThreads.map((thread) => {
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
                          aria-hidden="true"
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
                            <Badge
                              variant={outcome.variant}
                              className="shrink-0 text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[.06em]"
                            >
                              {outcome.label}
                            </Badge>
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
              })
            ) : (
              <li>
                <EmptyState
                  density="compact"
                  icon={<Sparkles className="size-5" />}
                  title="No matches"
                />
              </li>
            )}
          </ul>
        </div>

        <aside className="wl-scroll min-h-0 overflow-y-auto bg-secondary/30 p-4 sm:p-6">
          {!selectedThread ? (
            <EmptyState
              density="default"
              className="min-h-[360px] border-dashed border-border bg-card p-8"
              icon={<Sparkles className="size-5" />}
              title="Select a conversation"
            />
          ) : detailLoading ? (
            <div
              className="space-y-4 rounded-[var(--radius-xl)] border border-border bg-card p-6"
              aria-busy="true"
              aria-live="polite"
            >
              <Skeleton shape="text" className="h-4 w-28" />
              <Skeleton shape="text" className="h-7 w-4/5" />
              <Skeleton shape="text" className="h-4 w-1/3" />
              <Skeleton shape="surface" className="h-28 w-full" />
            </div>
          ) : detailError ? (
            <StatusNotice
              tone="destructive"
              title="Could not open this conversation."
              action={undefined}
            >
              <div>{detailError}</div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => void loadThreadDetail(selectedThread.id)}
              >
                Try again
              </Button>
            </StatusNotice>
          ) : (
            <div className="space-y-5">
              <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Outcome
                    </p>
                    <h2 className="wl-preserve-case mt-2 text-xl font-semibold tracking-[-.03em] text-foreground sm:text-2xl">
                      {selectedThread.subject}
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">{selectedThread.sender}</p>
                  </div>
                  <Badge
                    variant={OUTCOME_META[selectedThread.status].variant}
                    className="text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[.06em]"
                  >
                    {OUTCOME_META[selectedThread.status].label}
                  </Badge>
                </div>
                <p className="mt-5 rounded-[var(--radius-lg)] border border-border bg-secondary p-4 text-sm leading-6 text-muted-foreground">
                  {selectedThread.summary}
                </p>
              </section>
              <section className="wl-paper wl-paper-elevated overflow-hidden">
                <div className="border-b border-border px-5 py-4 sm:px-6">
                  <p className="wl-card-title">Conversation record</p>
                </div>
                <div className="space-y-3 p-4 sm:p-5">
                  {detail?.messages.length ? (
                    detail.messages.map((message) => (
                      <ConversationMessage
                        key={message.id}
                        author={isAssistantMessage(message.role) ? "assistant" : "customer"}
                        channel="email"
                        timestamp={
                          message.createdAt ? formatTimestamp(message.createdAt) : undefined
                        }
                      >
                        {message.content}
                      </ConversationMessage>
                    ))
                  ) : (
                    <EmptyState
                      density="compact"
                      title="Message bodies are not stored for this conversation."
                    />
                  )}
                </div>
              </section>
              <section className="wl-paper wl-paper-elevated p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-primary/10 text-primary">
                    <Route className="size-4" />
                  </span>
                  <div>
                    <p className="wl-card-title">Set next state</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={outcomeBusy !== null}
                    onClick={() => void setOutcome("waiting")}
                  >
                    {outcomeBusy === "waiting" ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <Clock3 aria-hidden="true" className="size-4" />
                    )}
                    Mark waiting
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={outcomeBusy !== null}
                    onClick={() => void setOutcome("booked")}
                  >
                    {outcomeBusy === "booked" ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 aria-hidden="true" className="size-4" />
                    )}
                    Mark booked
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={outcomeBusy !== null}
                    onClick={() => void setOutcome("escalated", true)}
                  >
                    {outcomeBusy === "handoff" ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <UserRoundCheck aria-hidden="true" className="size-4" />
                    )}
                    Handoff to team
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={outcomeBusy !== null}
                    onClick={() => void setOutcome("resolved")}
                  >
                    {outcomeBusy === "resolved" ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle2 aria-hidden="true" className="size-4" />
                    )}
                    Resolve
                  </Button>
                  {selectedThread.status !== "open" ? (
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto px-0 text-sm"
                      disabled={outcomeBusy !== null}
                      onClick={() => void setOutcome("open")}
                    >
                      Reopen
                    </Button>
                  ) : null}
                </div>
                {detail?.handoff && selectedThread.status === "escalated" ? (
                  <ConversationActivity
                    className="mt-4"
                    state="active"
                    title="Follow-up task is active"
                    detail="A team member owns the next step for this conversation."
                  />
                ) : null}
                {detailError ? (
                  <StatusNotice tone="destructive" className="mt-4">
                    {detailError}
                  </StatusNotice>
                ) : null}
              </section>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
