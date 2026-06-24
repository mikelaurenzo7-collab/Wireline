import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  ClipboardPlus,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { authFetch } from "../lib/api";

type EmailThread = {
  id: string;
  subject: string;
  sender: string;
  summary: string;
  lastMessageAt: string;
};

type EmailMessage = {
  id: string;
  sender: string;
  body: string;
  createdAt: string;
};

type ThreadsResponse = {
  threads?: Array<Record<string, unknown>>;
  error?: string;
};

type MessagesResponse = {
  messages?: Array<Record<string, unknown>>;
  error?: string;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function normalizeThread(row: Record<string, unknown>): EmailThread {
  return {
    id: text(row.id),
    subject: text(row.subject, "Untitled conversation"),
    sender: text(row.customer_email) || text(row.sender_email) || "Unknown sender",
    summary: text(row.summary, "No preview is available yet."),
    lastMessageAt: text(row.last_message_at) || text(row.created_at),
  };
}

function normalizeMessage(row: Record<string, unknown>, index: number): EmailMessage {
  const body =
    text(row.body) ||
    text(row.content) ||
    text(row.text) ||
    text(row.snippet) ||
    "No message body is available yet.";
  const createdAt = text(row.created_at) || text(row.sent_at) || text(row.received_at);
  return {
    id: text(row.id) || `${createdAt}-${index}`,
    sender:
      text(row.sender_email) ||
      text(row.customer_email) ||
      text(row.from) ||
      text(row.from_email) ||
      "Unknown sender",
    body,
    createdAt,
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

export default function EmailInbox({ embedded = false }: { embedded?: boolean }) {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [creatingFollowUp, setCreatingFollowUp] = useState(false);
  const [followUpNotice, setFollowUpNotice] = useState<string | null>(null);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/emails/threads");
      const body = (await response.json().catch(() => null)) as ThreadsResponse | null;
      if (!response.ok) throw new Error(body?.error || "Could not load email threads.");
      setThreads(Array.isArray(body?.threads) ? body.threads.map(normalizeThread) : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load email threads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const syncInbox = async () => {
    setSyncing(true);
    setError(null);
    try {
      const response = await authFetch("/api/emails/sync", { method: "POST" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Inbox sync failed.");
      await loadThreads();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Inbox sync failed.");
    } finally {
      setSyncing(false);
    }
  };

  const selectThread = async (thread: EmailThread) => {
    setSelectedThread(thread);
    setMessages([]);
    setDetailError(null);
    setFollowUpNotice(null);
    setDetailLoading(true);
    try {
      const response = await authFetch(`/api/emails/threads/${encodeURIComponent(thread.id)}/messages`);
      const body = (await response.json().catch(() => null)) as MessagesResponse | null;
      if (!response.ok) throw new Error(body?.error || "Could not load this conversation.");
      setMessages(Array.isArray(body?.messages) ? body.messages.map(normalizeMessage) : []);
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Could not load this conversation.");
    } finally {
      setDetailLoading(false);
    }
  };

  const createFollowUp = async () => {
    if (!selectedThread || creatingFollowUp) return;
    setCreatingFollowUp(true);
    setFollowUpNotice(null);
    setDetailError(null);
    try {
      const response = await authFetch(
        `/api/emails/threads/${encodeURIComponent(selectedThread.id)}/follow-up`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "Could not create the follow-up.");
      setFollowUpNotice(body?.message || "Follow-up added to your work queue.");
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : "Could not create the follow-up.");
    } finally {
      setCreatingFollowUp(false);
    }
  };

  const frameClass = embedded
    ? "flex h-full min-h-0 flex-col bg-background"
    : "min-h-screen bg-background px-5 py-8 sm:px-6";

  if (loading) {
    return (
      <section className={`${frameClass} grid place-items-center px-5`} aria-busy="true" aria-live="polite">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-11 place-items-center rounded-[var(--radius-lg)] border border-border bg-card text-primary shadow-[var(--wl-shadow-sm)]"><Loader2 className="size-5 animate-spin" /></span>
          <p className="text-sm text-muted-foreground">Preparing your inbox…</p>
        </div>
      </section>
    );
  }

  if (threads.length === 0) {
    return (
      <section className={`${frameClass} grid place-items-center px-5 text-center`}>
        <div className="studio-card w-full max-w-md px-6 py-10 sm:px-8">
          <span className="mx-auto grid size-12 place-items-center rounded-[var(--radius-xl)] bg-muted text-primary"><Mail className="size-5" /></span>
          <p className="studio-kicker mt-5">Email inbox</p>
          <h2 className="wl-section-title mt-2">No email conversations yet.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Connect an inbox, then Wireline can organize the conversations that need attention—from lead replies and appointment coordination to follow-up and recap.</p>
          {error ? <p className="mt-3 text-sm text-destructive" role="alert">{error}</p> : null}
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link to="/connections" className="studio-primary-button">Open connections</Link>
            <button type="button" onClick={() => void syncInbox()} disabled={syncing} className="studio-secondary-button">
              {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
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
          <p className="studio-kicker">Email inbox</p>
          <p className="mt-1 text-sm text-muted-foreground">{threads.length} conversation{threads.length === 1 ? "" : "s"}. Review the context, then turn the right one into a clear next step.</p>
        </div>
        <button type="button" onClick={() => void syncInbox()} disabled={syncing} className="studio-secondary-button min-h-9 px-3 text-sm">
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          {syncing ? "Refreshing" : "Refresh"}
        </button>
      </header>

      {error ? (
        <div className="mx-5 mt-4 flex items-start justify-between gap-4 rounded-[var(--radius-lg)] border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-foreground sm:mx-6" role="alert">
          <div className="flex min-w-0 items-start gap-2.5"><CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" /><p>{error}</p></div>
          <button type="button" onClick={() => void loadThreads()} className="shrink-0 text-sm font-semibold text-primary hover:text-[color:var(--wl-accent-hover)]">Retry</button>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,.88fr)_minmax(360px,1.12fr)]">
        <div className="wl-scroll min-h-0 overflow-y-auto border-b border-border p-3 sm:p-4 lg:border-b-0 lg:border-r">
          <ul className="mx-auto max-w-3xl space-y-2" aria-label="Email threads">
            {threads.map((thread) => {
              const active = selectedThread?.id === thread.id;
              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => void selectThread(thread)}
                    aria-pressed={active}
                    className={`studio-card w-full px-4 py-3.5 text-left transition-colors sm:px-5 ${active ? "border-primary/40 bg-primary/[.035]" : "hover:border-primary/25"}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-accent text-sm font-semibold text-primary" aria-hidden>{senderInitial(thread.sender)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-foreground">{thread.subject}</span>
                            <span className="mt-1 block truncate text-xs font-medium text-muted-foreground">{thread.sender}</span>
                          </span>
                          {thread.lastMessageAt ? <time className="shrink-0 pt-0.5 text-xs text-muted-foreground">{formatTimestamp(thread.lastMessageAt)}</time> : null}
                        </span>
                        <span className="mt-2 block line-clamp-2 text-sm leading-5 text-muted-foreground">{thread.summary}</span>
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="wl-scroll min-h-0 overflow-y-auto bg-secondary/[.18] p-4 sm:p-6" aria-live="polite">
          {!selectedThread ? (
            <div className="grid min-h-[300px] place-items-center text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-12 place-items-center rounded-[var(--radius-xl)] border border-border bg-card text-primary"><Mail className="size-5" /></span>
                <p className="studio-kicker mt-5">Conversation context</p>
                <h2 className="wl-section-title mt-2">Choose a conversation to see the full picture.</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">Read the thread first. Then create a follow-up only when the conversation deserves a human-owned next step.</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-2xl">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
                <div className="min-w-0">
                  <p className="studio-kicker">Conversation review</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-.03em] text-foreground sm:text-2xl">{selectedThread.subject}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{selectedThread.sender}{selectedThread.lastMessageAt ? ` · ${formatTimestamp(selectedThread.lastMessageAt)}` : ""}</p>
                </div>
                <span className="wl-stitch-status-pill shrink-0">Review before action</span>
              </div>

              <div className="mt-5 rounded-[var(--radius-lg)] border border-border bg-card p-4">
                <div className="flex gap-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <h3 className="wl-card-title">Your control stays intact.</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">This view does not send a reply or change a customer record. Creating a follow-up simply places the conversation into your work queue for a deliberate next move.</p>
                  </div>
                </div>
              </div>

              {detailError ? (
                <div className="mt-5 flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm text-foreground" role="alert">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                  <p>{detailError}</p>
                </div>
              ) : null}

              {followUpNotice ? (
                <div className="mt-5 flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-primary/25 bg-primary/5 px-3 py-3 text-sm text-foreground" role="status">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                  <p>{followUpNotice}</p>
                </div>
              ) : null}

              <div className="mt-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="wl-card-title">Thread detail</h3>
                  {detailLoading ? <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Loading</span> : null}
                </div>
                {detailLoading ? (
                  <div className="space-y-3" aria-busy="true">
                    {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-[var(--radius-lg)] border border-border bg-card" />)}
                  </div>
                ) : messages.length ? (
                  <ol className="space-y-3">
                    {messages.map((message) => (
                      <li key={message.id} className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{message.sender}</p>
                          {message.createdAt ? <time className="text-xs text-muted-foreground">{formatTimestamp(message.createdAt)}</time> : null}
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{message.body}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-card px-4 py-8 text-center text-sm leading-6 text-muted-foreground">The thread is available, but message detail has not arrived from the connected inbox yet.</div>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-5">
                <button type="button" onClick={() => void createFollowUp()} disabled={creatingFollowUp} className="studio-primary-button">
                  {creatingFollowUp ? <Loader2 className="size-4 animate-spin" /> : <ClipboardPlus className="size-4" />}
                  Create follow-up
                </button>
                <Link to="/actions" className="studio-secondary-button">
                  Review assistant rules <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
