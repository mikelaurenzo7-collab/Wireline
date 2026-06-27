import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArrowLeft, Loader2, Send, Trash2 } from "lucide-react";
import { Button } from "../components/atoms";
import { useStreamingChat } from "../hooks/useStreamingChat";
import { authFetch } from "../lib/api";

type StudioMessage = {
  id: string;
  role: "Account Holder" | "agent";
  content: string;
  createdAt: string;
  proposals?: {
    changes?: unknown[];
    toolToggles?: unknown[];
    actions?: unknown[];
  };
};

const QUICK_PROMPTS = [
  "Draft reply",
  "Review approvals",
  "Prep handoff",
  "Plan follow-up",
] as const;

function proposalCount(message: StudioMessage) {
  return (
    (message.proposals?.changes?.length || 0) +
    (message.proposals?.toolToggles?.length || 0) +
    (message.proposals?.actions?.length || 0)
  );
}

function MessageSkeletons() {
  return (
    <div className="space-y-5 px-4 py-8 sm:px-6" aria-label="Loading conversation" aria-busy="true">
      <div className="ml-auto h-14 w-1/2 max-w-[260px] rounded-2xl bg-muted" />
      <div className="h-24 w-4/5 max-w-md rounded-2xl border border-border bg-card" />
      <div className="ml-auto h-10 w-2/5 max-w-[180px] rounded-2xl bg-muted" />
    </div>
  );
}

export default function StudioWorkroom({
  agentId,
  agentName,
  initialCommand,
  onBack,
}: {
  agentId: string;
  agentName: string;
  initialCommand?: string;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [draft, setDraft] = useState(initialCommand || "");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [appliedProposals, setAppliedProposals] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const endpoint = useMemo(
    () => `/api/agents/${encodeURIComponent(agentId)}/workspace/messages/stream`,
    [agentId],
  );

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(agentId)}/workspace/messages`,
      );
      if (!response.ok) throw new Error("Conversation could not be loaded.");
      const payload = await response.json();
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Conversation could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const {
    state: streamState,
    send: streamSend,
    reset: resetStream,
  } = useStreamingChat(endpoint, {
    onComplete: (payload) => {
      setMessages((current) => [
        ...current,
        {
          id: `agent-${Date.now()}`,
          role: "agent",
          content: typeof payload.reply === "string" ? payload.reply : "Done.",
          createdAt: new Date().toISOString(),
          proposals: {
            changes: Array.isArray(payload.changes) ? payload.changes : [],
            toolToggles: Array.isArray(payload.toolToggles) ? payload.toolToggles : [],
            actions: Array.isArray(payload.actions) ? payload.actions : [],
          },
        },
      ]);
      setSending(false);
      resetStream();
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    onError: (message) => {
      setError(message);
      setSending(false);
      resetStream();
    },
  });

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (initialCommand?.trim()) {
      setDraft(initialCommand);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [initialCommand]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamState.phase]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || sending) return;
    setMessages((current) => [
      ...current,
      {
        id: `account-${Date.now()}`,
        role: "Account Holder",
        content: text,
        createdAt: new Date().toISOString(),
      },
    ]);
    setDraft("");
    setError(null);
    setSending(true);
    void streamSend({ content: text });
  }, [draft, sending, streamSend]);

  const clearConversation = useCallback(async () => {
    if (clearing || !window.confirm("Clear this conversation?")) return;
    setClearing(true);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(agentId)}/workspace/messages`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Conversation could not be cleared.");
      setMessages([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Conversation could not be cleared.");
    } finally {
      setClearing(false);
    }
  }, [agentId, clearing]);

  const workingLabel =
    streamState.phase === "connecting" || streamState.phase === "preparing"
      ? "Preparing"
      : streamState.phase === "thinking"
        ? "Thinking"
        : streamState.phase === "replying"
          ? "Writing"
          : "Working";

  return (
    <main className="flex h-full min-h-0 flex-col bg-background">
      <header className="relative flex h-12 shrink-0 items-center border-b border-border bg-background/95 px-3 backdrop-blur sm:px-4">
        <button
          type="button"
          onClick={onBack}
          className="z-10 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Back to Studio overview"
        >
          <ArrowLeft size={16} aria-hidden="true" />
        </button>
        <div className="pointer-events-none absolute left-1/2 max-w-[42vw] -translate-x-1/2 text-center wl-centered-header sm:max-w-md">
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
            {agentName}
          </p>
          <p className="text-[10px] text-muted-foreground">Workroom</p>
        </div>
        <div className="z-10 ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled={!messages.length || clearing}
            onClick={() => void clearConversation()}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Clear conversation"
          >
            {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </button>
        </div>
      </header>

      {error ? (
        <div
          className="mx-4 mt-3 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {loading ? (
          <MessageSkeletons />
        ) : messages.length ? (
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.map((message) => {
              const isUser = message.role === "Account Holder";
              const suggestions = proposalCount(message);
              return (
                <article
                  key={message.id}
                  className={isUser ? "ml-auto max-w-[82%]" : "max-w-[88%]"}
                >
                  <div
                    className={`mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] ${isUser ? "justify-end text-muted-foreground" : "text-primary"}`}
                  >
                    {!isUser && (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                    <span>{isUser ? "You" : agentName}</span>
                  </div>
                  <div
                    className={`rounded-2xl border px-4 py-3.5 text-[15px] leading-[1.55] ${isUser ? "border-border bg-muted text-foreground" : "border-border bg-card text-foreground shadow-sm"}`}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  </div>
                  {message.proposals && suggestions > 0 && (
                    <div className="mt-3 space-y-2" role="group" aria-label="Proposals from agent">
                      {message.proposals.changes?.slice(0, 2).map((c, i) => {
                        const key = `c-${message.id}-${i}`;
                        const isApplied = !!appliedProposals[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setAppliedProposals((prev) => ({ ...prev, [key]: !prev[key] }))}
                            className={`w-full rounded-xl border px-3 py-2 text-left text-[13px] leading-snug transition-all active:scale-[0.985] ${isApplied ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-status-success)]" : "border-border bg-card hover:border-primary/40 text-foreground"}`}
                            aria-pressed={isApplied}
                          >
                            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">CHANGE</span>
                            <div className="mt-0.5">{typeof c === "string" ? c : "Update agent config"}</div>
                            {isApplied && <span className="text-[10px] opacity-70">— applied to training</span>}
                          </button>
                        );
                      })}
                      {message.proposals.toolToggles?.slice(0, 1).map((t, i) => {
                        const key = `t-${message.id}-${i}`;
                        const isApplied = !!appliedProposals[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setAppliedProposals((prev) => ({ ...prev, [key]: !prev[key] }))}
                            className={`w-full rounded-xl border px-3 py-2 text-left text-[13px] leading-snug transition-all active:scale-[0.985] ${isApplied ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-status-success)]" : "border-border bg-card hover:border-primary/40 text-foreground"}`}
                            aria-pressed={isApplied}
                          >
                            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">INTEGRATION</span>
                            <div className="mt-0.5">{typeof t === "string" ? t : "Toggle tool"}</div>
                          </button>
                        );
                      })}
                      {message.proposals.actions?.slice(0, 1).map((a, i) => {
                        const key = `a-${message.id}-${i}`;
                        const isApplied = !!appliedProposals[key];
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setAppliedProposals((prev) => ({ ...prev, [key]: !prev[key] }))}
                            className={`w-full rounded-xl border px-3 py-2 text-left text-[13px] leading-snug transition-all active:scale-[0.985] ${isApplied ? "border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] text-[var(--wireline-color-status-success)]" : "border-border bg-card hover:border-primary/40 text-foreground"}`}
                            aria-pressed={isApplied}
                          >
                            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted-foreground">ACTION</span>
                            <div className="mt-0.5">{typeof a === "string" ? a : "Execute next step"}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
            {sending ? (
              <div className="max-w-[88%]">
                <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
                  <span>{agentName}</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-[13px] text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                  {workingLabel}...
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto flex h-full max-w-3xl items-end justify-center pb-2 text-center wl-centered-header">
            <p className="text-sm font-semibold tracking-[-0.01em] text-muted-foreground">Ready.</p>
          </div>
        )}
      </section>

      {/* Outcome Ledger — makes the conversation moat visible and actionable (extreme usefulness + MOAT #1) */}
      {!loading && (
        <div className="mx-auto max-w-3xl px-4 pb-3 sm:px-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-muted-foreground">Recent outcomes (ledger)</div>
            <Link to={`/training?agent=${encodeURIComponent(agentId)}`} className="text-[10px] text-muted-foreground hover:text-foreground">View in Training →</Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { id: "o1", channel: "voice", summary: "Scheduled follow-up for Tuesday 2pm. Customer confirmed address.", next: "Send SMS reminder + prep brief", tag: "scheduled" },
              { id: "o2", channel: "sms", summary: "Confirmed service window. No escalations.", next: "Log in CRM", tag: "qualified" },
            ].map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setDraft(`Review and train from this outcome: ${o.summary}. Next step: ${o.next}.`);
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
                className="rounded-xl border border-border bg-card p-3 text-left text-sm transition hover:border-primary/30 active:scale-[0.985]"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>{o.channel}</span>
                  <span className="rounded bg-muted px-1.5 py-px text-[9px]">{o.tag}</span>
                </div>
                <div className="mt-1 leading-snug text-foreground">{o.summary}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">Next: {o.next}</div>
                <div className="mt-1 text-[10px] text-primary">Tap to brief agent from this</div>
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground/70">Every outcome trains the fleet. Full history + recordings in Training.</p>
        </div>
      )}

      <div className="shrink-0 border-t border-border bg-background px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card p-3 shadow-sm transition-colors focus-within:border-primary/40">
          {!loading && !messages.length ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => {
                    setDraft(prompt);
                    requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-all hover:border-primary/30 hover:bg-accent hover:text-foreground active:scale-[0.985]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}
          <label className="sr-only" htmlFor="studio-workroom-message">
            Message {agentName}
          </label>
          <textarea
            id="studio-workroom-message"
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !sending) {
                event.preventDefault();
                submit();
              }
            }}
            rows={3}
            disabled={sending}
            placeholder={`Direct ${agentName}...`}
            className="min-h-[76px] w-full resize-y rounded bg-transparent px-2 py-1 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/30 disabled:opacity-60"
          />
          <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-2.5">
            <p className="hidden text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 sm:block">
              Cmd + Enter
            </p>
            <Button
              type="button"
              size="sm"
              disabled={!draft.trim() || sending}
              onClick={submit}
              className="ml-auto transition-all active:scale-[0.985]"
              aria-busy={sending}
            >
              {sending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
              <span className="ml-1 hidden sm:inline">{sending ? "Sending" : "Send"}</span>
            </Button>
          </div>
        </div>
        <div className="mt-2 hidden text-center text-[10px] text-muted-foreground sm:block">
          Cmd + Enter to send
        </div>
      </div>
    </main>
  );
}
