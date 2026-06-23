import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Mail, RefreshCw } from "lucide-react";
import { authFetch } from "../lib/api";

type EmailThread = {
  id: string;
  subject: string;
  sender: string;
  summary: string;
  lastMessageAt: string;
};

type ThreadsResponse = {
  threads?: Array<Record<string, unknown>>;
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

export default function EmailInbox({ embedded = false }: { embedded?: boolean }) {
  const [threads, setThreads] = useState<EmailThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const frameClass = embedded
    ? "flex h-full min-h-0 flex-col bg-background"
    : "min-h-screen bg-background px-5 py-8 sm:px-6";

  if (loading) {
    return (
      <section className={`${frameClass} grid place-items-center`} aria-busy="true">
        <Loader2 className="size-5 animate-spin text-primary" aria-label="Loading inbox" />
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
          <p className="studio-kicker mt-5">Email</p>
          <h2 className="wl-section-title mt-2">No threads yet</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Connect an email account, then Wireline can bring conversations, recaps, and follow-ups into one place.
          </p>
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
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
              {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Sync inbox
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`${frameClass} min-h-0`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
        <p className="text-sm text-muted-foreground">
          {threads.length} conversation{threads.length === 1 ? "" : "s"}
        </p>
        <button
          type="button"
          onClick={() => void syncInbox()}
          disabled={syncing}
          className="studio-secondary-button min-h-9 px-3 text-sm"
        >
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Sync
        </button>
      </header>
      {error ? <p className="px-5 pt-4 text-sm text-destructive">{error}</p> : null}
      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <ul className="space-y-2" aria-label="Email threads">
          {threads.map((thread) => (
            <li key={thread.id}>
              <article className="studio-card px-4 py-3.5 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold text-foreground">{thread.subject}</p>
                  {thread.lastMessageAt ? (
                    <time className="shrink-0 text-xs text-muted-foreground">{formatTimestamp(thread.lastMessageAt)}</time>
                  ) : null}
                </div>
                <p className="mt-1 text-xs font-medium text-muted-foreground">{thread.sender}</p>
                <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{thread.summary}</p>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
