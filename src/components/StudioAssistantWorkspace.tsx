import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  ChevronRight,
  FileText,
  GraduationCap,
  Loader2,
  MessageSquareText,
  PanelRightOpen,
  Plug,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button, Skeleton } from "../components/atoms";
import { authFetch } from "../lib/api";
import { useStreamingChat } from "../hooks/useStreamingChat";

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

type LegacyDestination = "training" | "connectors" | "memory" | undefined;

type StudioAssistantWorkspaceProps = {
  agentId: string;
  agentName: string;
  initialCommand?: string;
  onBack: () => void;
  onOpenDetailed: (tab?: LegacyDestination, sub?: string) => void;
};

function proposalCount(message: StudioMessage) {
  return (
    (message.proposals?.changes?.length || 0) +
    (message.proposals?.toolToggles?.length || 0) +
    (message.proposals?.actions?.length || 0)
  );
}

function MessageSkeletons() {
  return (
    <div className="space-y-4 px-5 py-8" aria-label="Loading conversation" aria-busy="true">
      <div className="ml-auto h-16 w-3/5 rounded-lg bg-muted" />
      <div className="h-28 w-4/5 rounded-lg border border-border bg-card" />
    </div>
  );
}

export default function StudioAssistantWorkspace({
  agentId,
  agentName,
  initialCommand,
  onBack,
  onOpenDetailed,
}: StudioAssistantWorkspaceProps) {
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [draft, setDraft] = useState(initialCommand || "");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
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
      const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/messages`);
      if (!response.ok) throw new Error("Conversation could not be loaded.");
      const payload = await response.json();
      setMessages(Array.isArray(payload.messages) ? payload.messages : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Conversation could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const { state: streamState, send: streamSend, reset: resetStream } = useStreamingChat(endpoint, {
    onComplete: (payload) => {
      const nextMessage: StudioMessage = {
        id: `agent-${Date.now()}`,
        role: "agent",
        content: typeof payload.reply === "string" ? payload.reply : "The assistant completed a response.",
        createdAt: new Date().toISOString(),
        proposals: {
          changes: Array.isArray(payload.changes) ? payload.changes : [],
          toolToggles: Array.isArray(payload.toolToggles) ? payload.toolToggles : [],
          actions: Array.isArray(payload.actions) ? payload.actions : [],
        },
      };
      setMessages((current) => [...current, nextMessage]);
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
      { id: `account-${Date.now()}`, role: "Account Holder", content: text, createdAt: new Date().toISOString() },
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
      const response = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/messages`, { method: "DELETE" });
      if (!response.ok) throw new Error("Conversation could not be cleared.");
      setMessages([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Conversation could not be cleared.");
    } finally {
      setClearing(false);
    }
  }, [agentId, clearing]);

  const currentWorkLabel =
    streamState.phase === "connecting" || streamState.phase === "preparing"
      ? "Preparing context"
      : streamState.phase === "thinking"
        ? "Reviewing the request"
        : streamState.phase === "replying"
          ? "Drafting a response"
          : null;

  return (
    <main className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-2 text-[var(--wireline-typography-caption-size)] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          <span className="hidden sm:inline">Studio</span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[var(--wireline-typography-caption-size)] font-semibold text-foreground">{agentName}</p>
          <p className="truncate text-[var(--wireline-typography-overline-size)] text-muted-foreground">Assistant workspace</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => onOpenDetailed("training", "database")} className="hidden min-h-10 items-center gap-2 rounded-md px-3 text-[var(--wireline-typography-caption-size)] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:inline-flex">
            <GraduationCap size={15} aria-hidden="true" /> Training
          </button>
          <button type="button" onClick={() => onOpenDetailed()} className="inline-flex min-h-10 items-center gap-2 rounded-md px-2.5 text-[var(--wireline-typography-caption-size)] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-3">
            <PanelRightOpen size={15} aria-hidden="true" />
            <span className="hidden sm:inline">Detailed view</span>
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
        <section className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="shrink-0 px-5 pb-4 pt-6 sm:px-7 sm:pt-8">
            <p className="wl-overline text-primary">Studio / workroom</p>
            <h1 className="mt-2 max-w-[14ch] text-[clamp(1.8rem,4vw,3.2rem)] font-semibold leading-[1.02] tracking-[-.05em] text-foreground">
              Turn a request into reviewed work.
            </h1>
            <p className="mt-3 max-w-xl text-[var(--wireline-typography-body-size)] leading-6 text-muted-foreground">
              Ask {agentName} for a plan, a draft, or an analysis. Suggested changes remain reviewable before anything is carried out.
            </p>
          </div>

          {error ? (
            <div className="mx-5 mb-3 rounded-md border border-rose-500/25 bg-rose-500/[0.04] px-3 py-2.5 text-[var(--wireline-typography-caption-size)] leading-5 text-muted-foreground sm:mx-7">
              {error}
            </div>
          ) : null}

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto border-y border-border bg-muted/[0.12]">
            {loading ? <MessageSkeletons /> : messages.length ? (
              <div className="mx-auto max-w-3xl space-y-5 px-5 py-6 sm:px-7">
                {messages.map((message) => {
                  const suggestions = proposalCount(message);
                  const isAccountHolder = message.role === "Account Holder";
                  return (
                    <article key={message.id} className={isAccountHolder ? "ml-auto max-w-[88%]" : "max-w-[92%]"}>
                      <p className={`mb-1.5 text-[var(--wireline-typography-overline-size)] font-medium uppercase tracking-[.06em] ${isAccountHolder ? "text-right text-muted-foreground" : "text-primary"}`}>
                        {isAccountHolder ? "You" : agentName}
                      </p>
                      <div className={`rounded-lg border px-4 py-3 text-[var(--wireline-typography-body-size)] leading-6 ${isAccountHolder ? "border-primary/25 bg-primary/[0.08] text-foreground" : "border-border bg-card text-foreground"}`}>
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      </div>
                      {suggestions ? (
                        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-3">
                          <div className="min-w-0">
                            <p className="text-[var(--wireline-typography-caption-size)] font-semibold text-foreground">{suggestions} suggested {suggestions === 1 ? "change" : "changes"} to review</p>
                            <p className="mt-0.5 text-[var(--wireline-typography-overline-size)] leading-4 text-muted-foreground">Review details before approving any action.</p>
                          </div>
                          <button type="button" onClick={() => onOpenDetailed()} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-border px-2.5 text-[var(--wireline-typography-overline-size)] font-semibold text-foreground transition-colors hover:border-primary/35">
                            Review <ChevronRight size={13} aria-hidden="true" />
                          </button>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                {sending ? (
                  <div className="max-w-[92%]">
                    <p className="mb-1.5 text-[var(--wireline-typography-overline-size)] font-medium uppercase tracking-[.06em] text-primary">{agentName}</p>
                    <div className="rounded-lg border border-border bg-card px-4 py-3">
                      <div className="flex items-center gap-2 text-[var(--wireline-typography-caption-size)] text-muted-foreground">
                        <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                        {currentWorkLabel || "Working"}
                      </div>
                      {streamState.actions.length ? (
                        <div className="mt-3 border-t border-border pt-3">
                          {streamState.actions.slice(-3).map((action) => <p key={action.id} className="text-[var(--wireline-typography-overline-size)] leading-5 text-muted-foreground">{action.label}</p>)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-5 py-10 sm:px-7">
                <div className="max-w-lg">
                  <span className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary"><Sparkles size={18} aria-hidden="true" /></span>
                  <h2 className="mt-5 text-[clamp(1.4rem,3vw,2rem)] font-semibold tracking-[-.035em] text-foreground">Start with the outcome.</h2>
                  <p className="mt-2 text-[var(--wireline-typography-body-size)] leading-6 text-muted-foreground">Ask for a plan, a draft, or a review. The assistant will respond here and surface any follow-on work for your review.</p>
                </div>
                <div className="mt-7 grid gap-2 sm:grid-cols-3">
                  {["Review the recent conversation and identify what needs attention.", "Draft a thoughtful follow-up from the latest context.", "What should we improve in this assistant’s handoff?"] .map((prompt) => (
                    <button key={prompt} type="button" onClick={() => { setDraft(prompt); requestAnimationFrame(() => inputRef.current?.focus()); }} className="rounded-lg border border-border bg-card p-3 text-left text-[var(--wireline-typography-caption-size)] leading-5 text-muted-foreground transition-colors hover:border-primary/35 hover:text-foreground">
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6">
            <div className="rounded-xl border border-border bg-card p-3 shadow-[0_12px_32px_-4px_rgba(93,63,211,0.08),0_4px_12px_rgba(93,63,211,0.04)] focus-within:border-primary/35">
              <label className="sr-only" htmlFor="studio-assistant-message">Message {agentName}</label>
              <textarea id="studio-assistant-message" ref={inputRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); submit(); } }} rows={3} disabled={sending} placeholder={`Ask ${agentName} to plan, draft, or review…`} className="min-h-[82px] w-full resize-none bg-transparent px-2 py-1 text-[var(--wireline-typography-body-size)] leading-6 text-foreground outline-none placeholder:text-muted-foreground/70" />
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="hidden text-[var(--wireline-typography-overline-size)] text-muted-foreground sm:block">⌘ / Ctrl + Enter to send</p>
                <span className="sm:hidden text-[var(--wireline-typography-overline-size)] text-muted-foreground">Review before action</span>
                <Button type="button" disabled={!draft.trim() || sending} onClick={submit}>{sending ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />} Send request</Button>
              </div>
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col bg-card px-5 py-6 sm:px-7 lg:px-6">
          <div>
            <p className="wl-overline text-primary">Working context</p>
            <h2 className="mt-2 text-[var(--wireline-typography-h3-size)] font-semibold tracking-[-.025em] text-foreground">{agentName}</h2>
            <p className="mt-2 text-[var(--wireline-typography-caption-size)] leading-5 text-muted-foreground">This workroom uses the assistant’s existing workspace and conversation context.</p>
          </div>

          <div className="mt-6 space-y-2">
            <button type="button" onClick={() => onOpenDetailed("training", "database")} className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/35">
              <span className="grid size-9 place-items-center rounded-md bg-muted text-primary"><GraduationCap size={16} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[var(--wireline-typography-caption-size)] font-semibold text-foreground">Knowledge & guidance</span><span className="mt-0.5 block text-[var(--wireline-typography-overline-size)] text-muted-foreground">Edit the information it can use</span></span>
              <ChevronRight size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onOpenDetailed("connectors")} className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/35">
              <span className="grid size-9 place-items-center rounded-md bg-muted text-primary"><Plug size={16} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[var(--wireline-typography-caption-size)] font-semibold text-foreground">Connections</span><span className="mt-0.5 block text-[var(--wireline-typography-overline-size)] text-muted-foreground">Inspect available capabilities</span></span>
              <ChevronRight size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onOpenDetailed("memory")} className="flex w-full items-center gap-3 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-primary/35">
              <span className="grid size-9 place-items-center rounded-md bg-muted text-primary"><Brain size={16} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1"><span className="block text-[var(--wireline-typography-caption-size)] font-semibold text-foreground">Conversation memory</span><span className="mt-0.5 block text-[var(--wireline-typography-overline-size)] text-muted-foreground">Review the ongoing thread</span></span>
              <ChevronRight size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3"><FileText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><div><p className="text-[var(--wireline-typography-caption-size)] font-semibold text-foreground">Actions remain deliberate.</p><p className="mt-1 text-[var(--wireline-typography-overline-size)] leading-5 text-muted-foreground">When a response contains suggested changes or actions, open detailed review before approving them.</p></div></div>
          </div>

          <div className="mt-auto pt-6">
            <button type="button" disabled={!messages.length || clearing} onClick={() => void clearConversation()} className="inline-flex min-h-10 items-center gap-2 rounded-md px-2 text-[var(--wireline-typography-caption-size)] font-medium text-muted-foreground transition-colors hover:bg-rose-500/[0.06] hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50">
              {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />} Clear conversation
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
