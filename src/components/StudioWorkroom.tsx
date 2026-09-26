import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Loader2, Phone, Send, Trash2 } from "lucide-react";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import OutboundDialDialog from "./OutboundDialDialog";
import { useStreamingChat } from "../hooks/useStreamingChat";
import { authFetch } from "../lib/api";
import type { BotMarkKey } from "../lib/bot-mark";
import { WORKSPACE_VOICE } from "../lib/product-copy";
import { reconcileStudioCommandDraft } from "../lib/studio-route-state";
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

export type StudioWorkroomDraft = {
  text: string;
  command: string | null;
  commandNonce: string | null;
};

function MessageBubble({
  message,
  agentName,
  mode,
}: {
  message: StudioMessage;
  agentName: string;
  mode: WorkroomMode;
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
          <p className="mt-1 text-right text-xs text-muted-foreground">Customer</p>
        ) : null}
      </article>
    );
  }

  return (
    <article className="w-fit max-w-[92%]" aria-label={`${agentName} response`}>
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
    markKey?: BotMarkKey | null;
    initialCommand?: string;
    commandNonce?: string;
    initialDraft?: StudioWorkroomDraft;
    onDraftChange?: (draft: StudioWorkroomDraft) => void;
    layout?: "standalone" | "canvas" | "split";
    mode?: WorkroomMode;
    onModeChange?: (mode: WorkroomMode) => void;
    allowOutbound?: boolean;
  }
>(function StudioWorkroom(
  {
    agentId,
    agentName,
    initialCommand,
    commandNonce,
    initialDraft,
    onDraftChange,
    layout = "standalone",
    mode = "configure",
    onModeChange,
    allowOutbound = false,
  },
  ref,
) {
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [draft, setDraft] = useState(() => {
    const command = initialCommand?.trim() || null;
    if (
      initialDraft &&
      initialDraft.command === command &&
      initialDraft.commandNonce === (commandNonce || null)
    ) {
      return initialDraft.text;
    }
    return reconcileStudioCommandDraft(
      initialDraft?.text || "",
      initialDraft?.command || null,
      command,
    );
  });
  const [loading, setLoading] = useState(mode === "configure");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [showOutboundDial, setShowOutboundDial] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const injectedCommandRef = useRef<string | null>(initialCommand?.trim() || null);
  const injectedCommandNonceRef = useRef<string | null>(commandNonce || null);
  const split = layout === "split";
  const quickPrompts = mode === "test" ? TEST_PROMPTS : CONFIGURE_PROMPTS;
  const showStarterPrompts = !loading && !sending && messages.length === 0 && !draft.trim();

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

  const loadMessages = useCallback(
    async (signal?: AbortSignal) => {
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
          { signal },
        );
        if (!response.ok) throw new Error("Conversation could not be loaded.");
        const payload = await response.json();
        if (signal?.aborted) return;
        setMessages(Array.isArray(payload.messages) ? payload.messages : []);
      } catch (reason) {
        if (signal?.aborted) return;
        setError(reason instanceof Error ? reason.message : "Conversation could not be loaded.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [agentId, mode],
  );

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
    const controller = new AbortController();
    void loadMessages(controller.signal);
    return () => controller.abort();
  }, [loadMessages]);

  useEffect(() => {
    const previousInjectedCommand = injectedCommandRef.current;
    const nextInjectedCommand = initialCommand?.trim() || null;
    const nextNonce = commandNonce || null;
    const commandChanged =
      previousInjectedCommand !== nextInjectedCommand ||
      injectedCommandNonceRef.current !== nextNonce;
    injectedCommandRef.current = nextInjectedCommand;
    injectedCommandNonceRef.current = nextNonce;
    if (commandChanged) {
      setDraft((current) =>
        reconcileStudioCommandDraft(current, previousInjectedCommand, nextInjectedCommand),
      );
    }
    if (nextInjectedCommand) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [initialCommand, commandNonce]);

  useEffect(() => {
    onDraftChange?.({
      text: draft,
      command: initialCommand?.trim() || null,
      commandNonce: commandNonce || null,
    });
  }, [commandNonce, draft, initialCommand, onDraftChange]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamState.phase, split]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    const resize = () => {
      textarea.style.minHeight = "52px";
      textarea.style.height = "0px";
      textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 52), 160)}px`;
    };
    resize();
    if (typeof ResizeObserver === "undefined") return;
    let width = textarea.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const nextWidth = textarea.getBoundingClientRect().width;
      // Sidebar changes and phone rotation can wrap an unchanged draft.
      // Ignore our own height updates so autosizing cannot loop.
      if (nextWidth === width) return;
      width = nextWidth;
      resize();
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [draft]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || sending || loading || clearing) return;
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
  }, [clearing, draft, loading, messages, mode, sending, streamSend]);

  const clearConversation = useCallback(async () => {
    if (clearing || sending || loading) return;
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
  }, [agentId, clearing, loading, mode, sending]);

  const workingLabel =
    streamState.phase === "connecting" || streamState.phase === "preparing"
      ? "Preparing"
      : streamState.phase === "thinking"
        ? "Thinking"
        : streamState.phase === "replying"
          ? "Replying"
          : "Working";

  const modeTabId = (option: WorkroomMode) => `studio-workroom-${agentId}-tab-${option}`;
  const modePanelId = `studio-workroom-${agentId}-panel`;
  const selectMode = (option: WorkroomMode) => {
    onModeChange?.(option);
    // The workspace remounts the conversation when its mode changes.
    // Restore focus to the new tab instead of leaving keyboard users at the page root.
    requestAnimationFrame(() => document.getElementById(modeTabId(option))?.focus());
  };

  const modeToggle = onModeChange ? (
    <div
      className="inline-flex items-center rounded-lg bg-muted/45 p-0.5"
      role="tablist"
      aria-label="Workroom mode"
    >
      {(["configure", "test"] as const).map((option) => (
        <button
          key={option}
          id={modeTabId(option)}
          type="button"
          role="tab"
          aria-selected={mode === option}
          aria-controls={modePanelId}
          tabIndex={mode === option ? 0 : -1}
          onClick={() => selectMode(option)}
          onKeyDown={(event) => {
            const nextMode =
              event.key === "Home"
                ? "configure"
                : event.key === "End"
                  ? "test"
                  : event.key === "ArrowLeft" || event.key === "ArrowRight"
                    ? option === "configure"
                      ? "test"
                      : "configure"
                    : null;
            if (!nextMode) return;
            event.preventDefault();
            selectMode(nextMode);
          }}
          className={`min-h-11 min-w-11 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors wl-focus-ring-halo ${
            mode === option
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {option === "configure" ? "Build" : "Test"}
        </button>
      ))}
    </div>
  ) : null;

  const clearButton = (
    <button
      type="button"
      disabled={!messages.length || clearing || sending || loading}
      onClick={() => void clearConversation()}
      className="grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo disabled:cursor-not-allowed disabled:opacity-35"
      aria-label={mode === "test" ? "Reset test conversation" : "Clear conversation"}
      title={mode === "test" ? "Reset test" : "Clear conversation"}
    >
      {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-background"
      aria-label={mode === "test" ? `${agentName} customer test` : `${agentName} workroom`}
    >
      <header
        className={`shrink-0 border-b border-border/60 bg-card/40 ${
          split ? "px-3 py-2.5 sm:px-4" : "px-4 py-4 sm:px-6"
        }`}
      >
        <div
          className={`mx-auto flex w-full max-w-3xl justify-between gap-4 ${
            split ? "items-center" : "flex-col items-start sm:flex-row"
          }`}
        >
          {split ? (
            <div className="flex min-w-0 items-center gap-2">
              {onModeChange ? null : (
                <span className="inline-flex h-6 items-center rounded-md bg-muted/55 px-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  {mode === "test" ? "Customer test" : "Build"}
                </span>
              )}
              <span className="wl-preserve-case truncate text-xs font-medium text-foreground">
                {agentName}
              </span>
            </div>
          ) : (
            <div className="min-w-0 max-w-full">
              <p className="text-eyebrow text-primary">
                {mode === "test" ? "Browser test" : "Build by conversation"}
              </p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
                {mode === "test" ? (
                  <>
                    Talk to <span className="wl-preserve-case">{agentName}</span> Like a Customer
                  </>
                ) : (
                  <>
                    Improve <span className="wl-preserve-case">{agentName}</span>
                  </>
                )}
              </h2>
            </div>
          )}
          <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5">
            {modeToggle}
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
          </div>
        </div>
      </header>

      <div
        id={onModeChange ? modePanelId : undefined}
        role={onModeChange ? "tabpanel" : undefined}
        aria-labelledby={onModeChange ? modeTabId(mode) : undefined}
        className="flex min-h-[24rem] flex-1 flex-col sm:min-h-0"
      >
        {error ? (
          <div className="mx-auto mt-3 w-[calc(100%-2rem)] max-w-3xl">
            <StatusNotice tone="destructive" title="Conversation Issue">
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
                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    agentName={agentName}
                    mode={mode}
                  />
                ))}
                {sending ? (
                  <div className="max-w-[92%]" role="status">
                    <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-[13px] text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                      {workingLabel}…
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full min-h-52 flex-col items-center justify-center text-center">
                <h3 className="text-lg font-semibold text-foreground">
                  {mode === "test"
                    ? "Start with a Real Customer Question"
                    : "Ready to Build"}
                </h3>
              </div>
            )}
          </div>
        </section>

        <div className="shrink-0 border-t border-border/70 bg-background px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
          <div className="mx-auto max-w-3xl">
            {showStarterPrompts ? (
              <div
                className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5"
                aria-label="Starter prompts"
              >
                {quickPrompts.slice(0, 3).map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setDraft(prompt);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    className={`${WL_COMPOSER_CLASSES.starterChip} shrink-0`}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : null}
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
                  if (
                    event.nativeEvent.isComposing ||
                    event.key !== "Enter" ||
                    event.shiftKey ||
                    sending
                  )
                    return;
                  const finePointer = window.matchMedia("(pointer: fine)").matches;
                  if (!finePointer && !event.metaKey && !event.ctrlKey) return;
                  event.preventDefault();
                  submit();
                }}
                rows={1}
                disabled={sending}
                placeholder={
                  mode === "test" ? "Ask as a customer…" : "Describe what should change"
                }
                className="wl-composer-dock__input max-h-40 overflow-y-auto disabled:opacity-60"
              />
              <div className="wl-composer-dock__toolbar">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-6 shrink-0 items-center rounded-md bg-muted/55 px-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    {mode === "test" ? "Test" : "Build"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!draft.trim() || sending || loading || clearing}
                    onClick={submit}
                    className="min-w-9"
                    aria-busy={sending}
                    aria-label={sending ? "Sending" : "Send"}
                  >
                    {sending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                    <span className="ml-1 hidden sm:inline">{sending ? "Sending" : "Send"}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>
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
