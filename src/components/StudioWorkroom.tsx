import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowUp, Loader2, MessageCircle, Monitor, Phone, Trash2 } from "lucide-react";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import OutboundDialDialog from "./OutboundDialDialog";
import StudioProposalReview, {
  type StudioProposals,
  type StudioProposalOperation,
} from "./StudioProposalReview";
import { useStreamingChat } from "../hooks/useStreamingChat";
import { authFetch } from "../lib/api";
import type { BotMarkKey } from "../lib/bot-mark";
import { WORKSPACE_VOICE } from "../lib/product-copy";
import { reconcileStudioCommandDraft } from "../lib/studio-route-state";
import { WL_COMPOSER_CLASSES } from "../lib/wireline-design-system";
import { retainStudioConversationMessages } from "../lib/studio-session-state";

export type StudioMessage = {
  id: string;
  role: "Account Holder" | "agent";
  content: string;
  createdAt: string;
  proposals?: StudioProposals;
};

export type StudioConversationSession = {
  snapshot: {
    messages: StudioMessage[];
    clearing: boolean;
    clearError: string | null;
    replyError: string | null;
    interrupted: boolean;
  };
  loaded: boolean;
  operations: Map<string, StudioProposalOperation>;
  listeners: Set<() => void>;
};

type WorkroomMode = "configure" | "test";

const CONFIGURE_PROMPTS = WORKSPACE_VOICE.configurePrompts;
const TEST_PROMPTS = WORKSPACE_VOICE.testPrompts;

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
  agentId,
  operations,
}: {
  message: StudioMessage;
  agentName: string;
  mode: WorkroomMode;
  agentId: string;
  operations: Map<string, StudioProposalOperation>;
}) {
  const isUser = message.role === "Account Holder";

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
        {mode === "configure" && message.proposals ? (
          <StudioProposalReview
            agentId={agentId}
            proposals={message.proposals}
            messageId={message.id}
            operations={operations}
          />
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
    conversationSession?: StudioConversationSession;
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
    conversationSession,
    layout = "standalone",
    mode = "configure",
    onModeChange,
    allowOutbound = false,
  },
  ref,
) {
  const localSession = useRef<StudioConversationSession>({
    snapshot: {
      messages: [],
      clearing: false,
      clearError: null,
      replyError: null,
      interrupted: false,
    },
    loaded: false,
    operations: new Map(),
    listeners: new Set(),
  });
  const session = conversationSession || localSession.current;
  const subscribe = useCallback(
    (listener: () => void) => {
      session.listeners.add(listener);
      return () => {
        session.listeners.delete(listener);
      };
    },
    [session],
  );
  const {
    messages,
    clearing,
    clearError,
    replyError: error,
    interrupted,
  } = useSyncExternalStore(
    subscribe,
    () => session.snapshot,
    () => session.snapshot,
  );
  const updateSession = useCallback(
    (patch: Partial<StudioConversationSession["snapshot"]>) => {
      session.snapshot = { ...session.snapshot, ...patch };
      session.listeners.forEach((listener) => listener());
    },
    [session],
  );
  const setMessages = useCallback(
    (next: StudioMessage[] | ((current: StudioMessage[]) => StudioMessage[])) => {
      updateSession({
        messages: retainStudioConversationMessages(
          session,
          typeof next === "function" ? next(session.snapshot.messages) : next,
        ),
      });
    },
    [session, updateSession],
  );
  const setError = useCallback(
    (replyError: string | null) => updateSession({ replyError }),
    [updateSession],
  );
  const requestActive = useRef(false);
  useEffect(
    () => () => {
      if (requestActive.current) updateSession({ interrupted: true });
    },
    [updateSession],
  );
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
  const [loading, setLoading] = useState(mode === "configure" && !session.loaded);
  const [sending, setSending] = useState(false);
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
        if (text) setDraft((current) => (current.trim() ? current : text));
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
      if (session.loaded) {
        setLoading(false);
        return;
      }
      if (mode === "test") {
        session.loaded = true;
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
        if (!Array.isArray(payload.messages)) throw new Error("Conversation could not be loaded.");
        session.loaded = true;
        setMessages(payload.messages);
      } catch (reason) {
        if (signal?.aborted) return;
        setError(reason instanceof Error ? reason.message : "Conversation could not be loaded.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [agentId, mode, session, setMessages, setError],
  );

  const {
    state: streamState,
    send: streamSend,
    reset: resetStream,
  } = useStreamingChat(endpoint, {
    onComplete: (payload) => {
      requestActive.current = false;
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
      requestActive.current = false;
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
    requestActive.current = true;
    updateSession({ interrupted: false });
    void streamSend({ content: text, history: mode === "test" ? history : undefined });
  }, [
    clearing,
    draft,
    loading,
    messages,
    mode,
    sending,
    streamSend,
    setMessages,
    setError,
    updateSession,
  ]);

  const clearConversation = useCallback(async () => {
    if (clearing || sending || loading) return;
    if (mode === "test") {
      setMessages([]);
      updateSession({ interrupted: false });
      session.operations.clear();
      setError(null);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    if (!window.confirm("Clear this conversation?")) return;

    updateSession({ clearing: true, clearError: null });
    setError(null);
    try {
      const response = await authFetch(
        `/api/agents/${encodeURIComponent(agentId)}/workspace/messages`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) throw new Error("Conversation could not be cleared.");
      const payload = await response.json();
      if (payload?.cleared !== true)
        throw new Error("Conversation clear was not confirmed. Try again.");
      updateSession({ messages: [], interrupted: false });
      session.operations.clear();
    } catch (reason) {
      updateSession({
        clearError: reason instanceof Error ? reason.message : "Conversation could not be cleared.",
      });
    } finally {
      updateSession({ clearing: false });
    }
  }, [agentId, clearing, loading, mode, sending, session, setMessages, setError, updateSession]);

  const workingLabel =
    streamState.phase === "connecting" || streamState.phase === "preparing"
      ? "Preparing"
      : streamState.phase === "thinking"
        ? "Thinking"
        : streamState.phase === "replying"
          ? "Replying"
          : "Working";

  const modeActionId = `studio-workroom-${agentId}-mode-action`;
  const selectMode = (option: WorkroomMode) => {
    onModeChange?.(option);
    // The workspace remounts the conversation when its mode changes. Keep
    // keyboard focus on the same in-context action after the remount.
    requestAnimationFrame(() => document.getElementById(modeActionId)?.focus());
  };

  const clearButton = (
    <button
      type="button"
      disabled={!messages.length || clearing || sending || loading}
      onClick={() => void clearConversation()}
      className="grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo disabled:cursor-not-allowed disabled:opacity-35"
      aria-label={mode === "test" ? "Reset rehearsal conversation" : "Clear conversation"}
      title={mode === "test" ? "Reset rehearsal" : "Clear conversation"}
    >
      {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-background"
      aria-label={mode === "test" ? `${agentName} rehearsal conversation` : `${agentName} workroom`}
    >
      <header className={`shrink-0 ${split ? "px-3 py-2 sm:px-4" : "px-4 py-2 sm:px-6"}`}>
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {onModeChange ? (
              <>
                <span className="text-sm font-semibold text-foreground">
                  {mode === "test" ? "Private Rehearsal" : "Set Up"}
                </span>
                <Button
                  id={modeActionId}
                  type="button"
                  size="sm"
                  variant={mode === "test" ? "outline" : "secondary"}
                  className="min-h-11"
                  onClick={() => selectMode(mode === "test" ? "configure" : "test")}
                >
                  {mode === "test" ? (
                    <>
                      <ArrowLeft aria-hidden="true" />
                      Set Up
                    </>
                  ) : (
                    <>
                      <MessageCircle aria-hidden="true" />
                      Rehearse
                    </>
                  )}
                </Button>
                <Button asChild size="sm" variant="outline" className="min-h-11">
                  <Link to={`/computer?agent=${encodeURIComponent(agentId)}`}>
                    <Monitor aria-hidden="true" />
                    Computer
                  </Link>
                </Button>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">
                {mode === "test" ? "Private Rehearsal" : "Set Up"}
              </span>
            )}
          </div>
          <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5">
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

      <div className="flex min-h-[24rem] flex-1 flex-col sm:min-h-0">
        {error || clearError || interrupted ? (
          <div className="mx-auto mt-3 w-[calc(100%-2rem)] max-w-3xl">
            <StatusNotice
              tone="destructive"
              title="Conversation Issue"
              action={
                (interrupted || error) &&
                messages.some((message) => message.role === "Account Holder") ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const lastQuestion = [...messages]
                        .reverse()
                        .find((message) => message.role === "Account Holder");
                      if (lastQuestion)
                        setDraft((current) => (current.trim() ? current : lastQuestion.content));
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                  >
                    Edit and Retry
                  </Button>
                ) : undefined
              }
            >
              {error || clearError || "The reply was interrupted when you left this conversation."}
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
                    agentId={agentId}
                    operations={session.operations}
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
              <div className="mx-auto flex h-full min-h-52 max-w-md flex-col items-center justify-center gap-3 py-8 text-center">
                <h2 className="text-2xl font-semibold text-foreground">
                  {mode === "test" ? "Try a Customer Question" : "What Should We Change?"}
                </h2>
              </div>
            )}
          </div>
        </section>

        <div className="shrink-0 border-t border-border/70 bg-background px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
          <div className="mx-auto max-w-3xl">
            {showStarterPrompts ? (
              <div
                className="-mx-3 mb-3 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0"
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
                    className={`${WL_COMPOSER_CLASSES.starterChip} shrink-0 whitespace-nowrap`}
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
                data-resize="none"
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
                placeholder={mode === "test" ? "Ask as a customer…" : "Describe what should change"}
                className="wl-composer-dock__input max-h-40 overflow-y-auto disabled:opacity-60"
              />
              <div className="wl-composer-dock__toolbar">
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={!draft.trim() || sending || loading || clearing}
                    onClick={submit}
                    className="size-10 shrink-0 rounded-full p-0"
                    aria-busy={sending}
                    aria-label={sending ? "Sending" : "Send"}
                    title={sending ? "Sending" : "Send"}
                  >
                    {sending ? (
                      <Loader2 className="animate-spin" size={16} aria-hidden="true" />
                    ) : (
                      <ArrowUp size={18} aria-hidden="true" />
                    )}
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
