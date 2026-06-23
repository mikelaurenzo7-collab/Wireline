import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, Loader2, Mail, RefreshCw } from "lucide-react";
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

function senderInitial(sender: string) {
  return sender.trim().slice(0, 1).toUpperCase() || "?";
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

  const frameClass = embedded ? "flex h-full min-h-0 flex-col bg-background" : "min-h-screen bg-background px-5 py-8 sm:px-6";

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
          <p className="mt-1 text-sm text-muted-foreground">{threads.length} conversation{threads.length === 1 ? "" : "s"} available to review</p>
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

      <div className="wl-scroll min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <ul className="mx-auto max-w-5xl space-y-2" aria-label="Email threads">
          {threads.map((thread) => (
            <li key={thread.id}>
              <article className="studio-card px-4 py-3.5 sm:px-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-accent text-sm font-semibold text-primary" aria-hidden>{senderInitial(thread.sender)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{thread.subject}</p>
                        <p className="mt-1 truncate text-xs font-medium text-muted-foreground">{thread.sender}</p>
                      </div>
                      {thread.lastMessageAt ? <time className="shrink-0 pt-0.5 text-xs text-muted-foreground">{formatTimestamp(thread.lastMessageAt)}</time> : null}
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">{thread.summary}</p>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
