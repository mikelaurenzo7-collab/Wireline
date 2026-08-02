import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { ArrowLeft, Loader2, Phone, Send, Trash2 } from "lucide-react";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import AgentFace from "./AgentFace";
import OutboundDialDialog from "./OutboundDialDialog";
import { useStreamingChat } from "../hooks/useStreamingChat";
import { authFetch } from "../lib/api";
import { WORKSPACE_VOICE } from "../lib/product-copy";
import { WL_COMPOSER_CLASSES } from "../lib/wireline-design-system";

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

type WorkroomMode = "configure" | "test";

const CONFIGURE_PROMPTS = WORKSPACE_VOICE.configurePrompts;
const TEST_PROMPTS = WORKSPACE_VOICE.testPrompts;

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
      <div className="h-20 w-4/5 max-w-md rounded-2xl border border-border bg-card" />
      <div className="ml-auto h-12 w-3/5 max-w-[260px] rounded-2xl bg-primary/10" />
      <div className="h-20 w-4/5 max-w-md rounded-2xl border border-border bg-card" />
    </div>
  );
}

export type StudioWorkroomHandle = {
  focusComposer: (text?: string) => void;
};

function AgentAvatar({ agentName, speaking = false }: { agentName: string; speaking?: boolean }) {
  return (
    <AgentFace
      seed={agentName || "agent"}
      size={24}
      speaking={speaking}
      title={`${agentName || "Voice agent"} face`}
      className="mt-1 shrink-0"
    />
  );
}

function MessageBubble({
  message,
  agentName,
  mode,
  speaking = false,
}: {
  message: StudioMessage;
  agentName: string;
  mode: WorkroomMode;
  speaking?: boolean;
}) {
  const isUser = message.role === "Account Holder";
  const suggestions = proposalCount(message);

  if (isUser) {
    return (
      <article className="ml-auto max-w-[84%]">
        <div className="rounded-xl bg-primary px-4 py-3 text-[14px] font-medium leading-[1.5] text-primary-foreground shadow-sm">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        {mode === "test" ? (
          <p className="mt-1 text-right text-[10px] text-muted-foreground">Customer</p>
        ) : null}
      </article>
    );
  }

  return (
    <article className="flex max-w-[92%] items-start gap-3">
      <AgentAvatar agentName={agentName} speaking={speaking} />
      <div className="min-w-0">
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-[14px] leading-[1.5] text-foreground shadow-sm">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        {mode === "configure" && message.proposals && suggestions > 0 ? (
          <div className="mt-2 rounded-xl border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] px-3 py-2 text-xs text-[var(--wireline-color-status-success)]">
            {suggestions} proposed update{suggestions === 1 ? "" : "s"} ready for review.
          </div>
        ) : null}
      </div>
    </article>
  );
}

const StudioWorkroom = forwardRef<
  StudioWorkroomHandle,
  {
    agentId: string;
    agentName: string;
    initialCommand?: string;
    commandNonce?: string;
    onBack: () => void;
    backLabel?: string;
    layout?: "standalone" | "canvas" | "split";
    mode?: WorkroomMode;
    allowOutbound?: boolean;
  }
>(function StudioWorkroom(
  {
    agentId,
    agentName,
    initialCommand,
    commandNonce,
    onBack,
    backLabel = "Back",
    layout = "standalone",
    mode = "configure",
    allowOutbound = true,
  },
  ref,
) {
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [draft, setDraft] = useState(initialCommand || "");
  const [loading, setLoading] = useState(mode === "configure");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [showOutboundDial, setShowOutboundDial] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const split = layout === "split";
  const quickPrompts = mode === "test" ? TEST_PROMPTS : CONFIGURE_PROMPTS;

  useImperativeHandle(
    ref,
    () => ({
      focusComposer(text?: string) {
        if (text) setDraft(text);
        requestAnimationFrame(() => inputRef.current?.focus());
      },
    }),
    [],
  );

  const endpoint = useMemo(
    () =>
      mode === "test"
        ? `/api/agents/${encodeURIComponent(agentId)}/test/stream`
        : `/api/agents/${encodeURIComponent(agentId)}/workspace/messages/stream`,
    [agentId, mode],
  );

  const loadMessages = useCallback(async () => {
    if (mode === "test") {
      setMessages([]);
      setLoading(false);
      return;
    }

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
  }, [agentId, mode]);

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
  }, [initialCommand, commandNonce]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamState.phase, split]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || sending) return;
    const history = messages.slice(-12).map((message) => ({
      role: message.role === "Account Holder" ? "customer" : "employee",
      content: message.content,
    }));
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
    void streamSend({ content: text, history: mode === "test" ? history : undefined });
  }, [draft, messages, mode, sending, streamSend]);

  const clearConversation = useCallback(async () => {
    if (clearing) return;
    if (mode === "test") {
      setMessages([]);
      setError(null);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    if (!window.confirm("Clear this conversation?")) return;

    setClearing(true);
    setError(null);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(agentId)}/workspace/messages`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) throw new Error("Conversation could not be cleared.");
      setMessages([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Conversation could not be cleared.");
    } finally {
      setClearing(false);
    }
  }, [agentId, clearing, mode]);

  const workingLabel =
    streamState.phase === "connecting" || streamState.phase === "preparing"
      ? "Preparing"
      : streamState.phase === "thinking"
        ? "Thinking"
        : streamState.phase === "replying"
          ? "Replying"
          : "Working";

  const clearButton = (
    <button
      type="button"
      disabled={!messages.length || clearing}
      onClick={() => void clearConversation()}
      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
      aria-label={mode === "test" ? "Reset test conversation" : "Clear conversation"}
    >
      {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-background"
      aria-label={mode === "test" ? `${agentName} customer test` : `${agentName} workroom`}
    >
      <header className="shrink-0 border-b border-border/60 bg-card/50 px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              {mode === "test" ? "Browser test" : "Build by conversation"}
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
              {mode === "test" ? `Talk to ${agentName} like a customer` : `Improve ${agentName}`}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {mode === "test" && allowOutbound ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setShowOutboundDial(true)}
                aria-label="Start a real call"
              >
                <Phone className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Real call</span>
              </Button>
            ) : null}
            {clearButton}
            <button
              type="button"
              onClick={onBack}
              className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={backLabel}
            >
              <ArrowLeft size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="mx-auto mt-3 w-[calc(100%-2rem)] max-w-3xl">
          <StatusNotice tone="destructive" title="Conversation issue">
            {error}
          </StatusNotice>
        </div>
      ) : null}

      <section
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-6"
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-relevant="additions text"
        tabIndex={0}
      >
        <div className="mx-auto h-full w-full max-w-3xl">
          {loading ? (
            <MessageSkeletons />
          ) : messages.length ? (
            <div className="flex flex-col gap-5">
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  agentName={agentName}
                  mode={mode}
                  speaking={
                    sending &&
                    streamState.phase === "replying" &&
                    message.role === "agent" &&
                    index === messages.length - 1
                  }
                />
              ))}
              {sending ? (
                <div className="flex max-w-[92%] items-start gap-3">
                  <AgentAvatar agentName={agentName} speaking={streamState.phase === "replying"} />
                  <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-[13px] text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                    {workingLabel}…
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex h-full min-h-52 flex-col items-center justify-center text-center">
              <AgentFace seed={agentName} size={48} title={`${agentName} face`} />
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                {mode === "test"
                  ? "Start with a real customer question"
                  : "Describe what should change"}
              </h3>
              {mode === "configure" ? (
                <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                  Use plain language. Wireline will propose the smallest useful update.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <div className="shrink-0 border-t border-border bg-background px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
        <div className="mx-auto max-w-3xl">
          <div className={WL_COMPOSER_CLASSES.composerDock}>
            <label className="sr-only" htmlFor="studio-workroom-message">
              {mode === "test" ? `Customer message for ${agentName}` : `Message ${agentName}`}
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
              rows={2}
              disabled={sending}
              placeholder={
                mode === "test"
                  ? "Type what a customer would say…"
                  : `Tell Wireline what to change about ${agentName}…`
              }
              className="wl-composer-dock__input disabled:opacity-60"
            />
            <div className="wl-composer-dock__toolbar">
              <div className="flex flex-wrap gap-1.5">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setDraft(prompt);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    className={WL_COMPOSER_CLASSES.starterChip}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                size="sm"
                disabled={!draft.trim() || sending}
                onClick={submit}
                className="transition-all active:scale-[0.985]"
                aria-busy={sending}
                aria-label={sending ? "Sending" : "Send"}
              >
                {sending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                <span className="ml-1 hidden sm:inline">{sending ? "Sending" : "Send"}</span>
              </Button>
            </div>
          </div>
          {mode === "configure" ? (
            <p className="mt-2 text-center text-[10px] text-muted-foreground">
              Review proposed changes before using them with customers.
            </p>
          ) : null}
        </div>
      </div>

      <OutboundDialDialog
        open={showOutboundDial}
        onClose={() => setShowOutboundDial(false)}
        initialAgentId={agentId}
      />
    </section>
  );
});

export default StudioWorkroom;
