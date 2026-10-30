import {
  forwardRef,
  type ReactNode,
  useLayoutEffect,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ArrowDown, ArrowUp, Loader2, MessageCircle, Mic, Phone, Trash2 } from "lucide-react";

import { Button } from "../components/atoms";
import { StatusNotice } from "../components/molecules";
import PhoneTestDialog from "./PhoneTestDialog";
import StudioVoiceRehearsal, { studioVoiceStartId } from "./StudioVoiceRehearsal";
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
import LinkifiedText from "./ui/LinkifiedText";
import BotMark from "./BotMark";

export type StudioMessage = {
  id: string;
  role: "Account Holder" | "agent";
  content: string;
  createdAt: string;
  proposals?: StudioProposals;
  savedProposalKeys?: string[];
  reviewUnavailable?: boolean;
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
  focusVoiceRehearsal: () => void;
};

export type StudioWorkroomDraft = {
  text: string;
  command: string | null;
  commandNonce: string | null;
};

function MessageBubble({
  message,
  agentName,
  agentId,
  operations,
}: {
  message: StudioMessage;
  agentName: string;
  agentId: string;
  operations: Map<string, StudioProposalOperation>;
}) {
  const isUser = message.role === "Account Holder";

  if (isUser) {
    return (
      <article className="wl-studio-message is-owner ml-auto max-w-[84%]">
        <div className="wl-studio-message__body">
          <p className="whitespace-pre-wrap break-words">
            <LinkifiedText>{message.content}</LinkifiedText>
          </p>
        </div>
      </article>
    );
  }

  return (
    <article className="wl-studio-message is-bot w-full" aria-label={`${agentName} response`}>
      <div className="min-w-0">
        <div className="wl-studio-message__body">
          <p className="whitespace-pre-wrap break-words">
            <LinkifiedText>{message.content}</LinkifiedText>
          </p>
        </div>
        {message.proposals ? (
          <StudioProposalReview
            agentId={agentId}
            proposals={message.proposals}
            messageId={message.id}
            savedProposalKeys={message.savedProposalKeys}
            operations={operations}
          />
        ) : null}
        {message.reviewUnavailable ? (
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            This earlier draft is unavailable. Ask your Bot to draft it again.
          </p>
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
    modeControls?: "header" | "composer";
    allowOutbound?: boolean;
    phoneNumber?: string | null;
    voiceVisible?: boolean;
    timelineExtras?: Array<{ id: string; createdAt: string; updatedAt?: string; node: ReactNode }>;
    composerChoice?: ReactNode;
    composerOverride?: ReactNode;
    timelineNotice?: ReactNode;
  }
>(function StudioWorkroom(
  {
    agentId,
    agentName,
    markKey,
    initialCommand,
    commandNonce,
    initialDraft,
    onDraftChange,
    conversationSession,
    layout = "standalone",
    mode = "configure",
    onModeChange,
    modeControls = "header",
    allowOutbound = false,
    phoneNumber,
    voiceVisible = true,
    timelineExtras = [],
    composerChoice,
    composerOverride,
    timelineNotice,
  },
  ref,
) {
  const followLatest = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const timelineRevision = timelineExtras
    .map((item) => `${item.id}:${item.updatedAt || ""}`)
    .join(":");
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
    if (mode === "test") return "";
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
  const [showPhoneTest, setShowPhoneTest] = useState(false);
  const [voiceStartFocusRequested, setVoiceStartFocusRequested] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const injectedCommandRef = useRef<string | null>(initialCommand?.trim() || null);
  const injectedCommandNonceRef = useRef<string | null>(commandNonce || null);
  const split = layout === "split";
  const composerId = "studio-workroom-message";
  const quickPrompts = CONFIGURE_PROMPTS;
  const showStarterPrompts = !loading && !sending && messages.length === 0 && !draft.trim();

  useImperativeHandle(
    ref,
    () => ({
      focusComposer(text?: string) {
        if (mode === "test") {
          setVoiceStartFocusRequested(true);
          return;
        }
        if (text) setDraft((current) => (current.trim() ? current : text));
        requestAnimationFrame(() => inputRef.current?.focus());
      },
      focusVoiceRehearsal() {
        setVoiceStartFocusRequested(true);
      },
    }),
    [mode],
  );

  useEffect(() => {
    if (!voiceStartFocusRequested || mode !== "test" || !voiceVisible) return;
    // Wait until the requested voice panel is visible before focusing its mic control.
    const startButton = document.getElementById(studioVoiceStartId(agentId));
    if (!startButton) return;
    startButton.focus();
    setVoiceStartFocusRequested(false);
  }, [agentId, mode, voiceStartFocusRequested, voiceVisible]);

  const endpoint = `/api/agents/${encodeURIComponent(agentId)}/workspace/messages/stream`;

  const loadMessages = useCallback(
    async (signal?: AbortSignal) => {
      if (session.loaded) {
        setLoading(false);
        return;
      }
      if (mode === "test") {
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
          id:
            typeof payload.messageId === "string" && /^[1-9]\d*$/.test(payload.messageId)
              ? payload.messageId
              : `agent-${Date.now()}`,
          role: "agent",
          content: typeof payload.reply === "string" ? payload.reply : "Done.",
          createdAt: new Date().toISOString(),
          proposals: {
            changes: Array.isArray(payload.changes) ? payload.changes : [],
            toolToggles: Array.isArray(payload.toolToggles) ? payload.toolToggles : [],
            actions: Array.isArray(payload.actions) ? payload.actions : [],
          },
          savedProposalKeys: [],
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
    if (mode === "test") {
      // Historical command links are rehearsal scenarios, never configuration edits.
      if (initialCommand?.trim()) setVoiceStartFocusRequested(true);
      return;
    }
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
  }, [initialCommand, commandNonce, mode]);

  useEffect(() => {
    if (mode === "test") return;
    onDraftChange?.({
      text: draft,
      command: initialCommand?.trim() || null,
      commandNonce: commandNonce || null,
    });
  }, [commandNonce, draft, initialCommand, mode, onDraftChange]);

  useLayoutEffect(() => {
    if (!scrollRef.current || !followLatest.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamState.phase, split, timelineRevision]);

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
  }, [draft, mode]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (mode !== "configure" || !text || sending || loading || clearing) return;
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
    void streamSend({ content: text });
  }, [clearing, draft, loading, mode, sending, streamSend, setMessages, setError, updateSession]);

  const clearConversation = useCallback(async () => {
    if (mode !== "configure" || clearing || sending || loading) return;
    if (
      !window.confirm("Clear chat messages? Saved memories and computer task history will remain.")
    )
      return;

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
  }, [agentId, clearing, loading, mode, sending, session, setError, updateSession]);

  const workingLabel =
    streamState.phase === "connecting" || streamState.phase === "preparing"
      ? "Preparing"
      : streamState.phase === "thinking"
        ? "Thinking"
        : streamState.phase === "replying"
          ? "Replying"
          : "Working";

  const modeActionId = (option: WorkroomMode) => `studio-workroom-${agentId}-mode-${option}`;
  const selectMode = (option: WorkroomMode) => {
    if (option === mode) return;
    onModeChange?.(option);
    // The workspace remounts when its mode changes. Focus the new view's
    // composer or return action, rather than a control that was just removed.
    const targetId =
      modeControls === "composer"
        ? option === "configure"
          ? "studio-workroom-message"
          : modeActionId("configure")
        : modeActionId(option);
    requestAnimationFrame(() => document.getElementById(targetId)?.focus());
  };

  const clearButton = (
    <button
      type="button"
      disabled={!messages.length || clearing || sending || loading}
      onClick={() => void clearConversation()}
      className="grid size-11 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground wl-focus-ring-halo disabled:cursor-not-allowed disabled:opacity-35"
      aria-label="Clear conversation"
      title="Clear chat messages. Computer task history is kept."
    >
      {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );
  const starterPrompts = showStarterPrompts ? (
    <details className="wl-studio-starters" aria-label="Starter prompts">
      <summary>Suggestions</summary>
      <div>
        {quickPrompts.slice(0, 3).map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => {
              setDraft(prompt);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            {prompt}
          </button>
        ))}
      </div>
    </details>
  ) : null;

  return (
    <section
      className="wl-studio-chat flex h-full min-h-0 flex-col overflow-y-auto bg-background"
      aria-label={mode === "test" ? `${agentName} voice rehearsal` : `${agentName} workroom`}
    >
      {modeControls === "header" || mode === "test" ? (
        <header
          className={`wl-studio-chat__header shrink-0 ${split ? "px-3 py-2 sm:px-4" : "px-4 py-2 sm:px-6"}`}
        >
          <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-2 sm:gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {onModeChange && modeControls === "composer" ? (
                <Button
                  id={modeActionId("configure")}
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => selectMode("configure")}
                >
                  Back to Configure
                </Button>
              ) : onModeChange ? (
                // Changing the Bot and trying it are one Set Up job, so they are
                // two views of the same place rather than separate destinations.
                <div
                  role="group"
                  aria-label="Set Up view"
                  className="inline-flex items-center gap-0.5 rounded-lg bg-muted/40 p-0.5"
                >
                  {(
                    [
                      { id: "configure", label: "Instructions", Icon: MessageCircle },
                      { id: "test", label: "Try It", Icon: Mic },
                    ] as const
                  ).map(({ id, label, Icon }) => (
                    <Button
                      key={id}
                      id={modeActionId(id)}
                      type="button"
                      size="sm"
                      variant={mode === id ? "secondary" : "ghost"}
                      aria-pressed={mode === id}
                      className="min-h-11"
                      onClick={() => selectMode(id)}
                    >
                      <Icon aria-hidden="true" />
                      {label}
                    </Button>
                  ))}
                </div>
              ) : (
                <span className="text-sm font-semibold text-foreground">
                  {mode === "test" ? "Private Rehearsal" : "Instructions"}
                </span>
              )}
            </div>
            <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1.5">
              {mode === "test" && allowOutbound ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowPhoneTest(true)}
                  aria-label="Call My Phone"
                >
                  <Phone className="size-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Call My Phone</span>
                </Button>
              ) : null}
            </div>
          </div>
        </header>
      ) : null}

      {mode === "test" ? (
        <div className="shrink-0">
          {voiceVisible ? (
            <StudioVoiceRehearsal
              key={agentId}
              agentId={agentId}
              agentName={agentName}
              markKey={markKey}
              phoneNumber={phoneNumber}
            />
          ) : null}
        </div>
      ) : (
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
                {error ||
                  clearError ||
                  "The reply was interrupted when you left this conversation."}
              </StatusNotice>
            </div>
          ) : null}

          <section
            onScroll={(event) => {
              const node = event.currentTarget;
              followLatest.current = node.scrollHeight - node.scrollTop - node.clientHeight < 160;
              setShowLatest(!followLatest.current);
            }}
            ref={scrollRef}
            className="wl-studio-chat__transcript min-h-0 flex-1 overflow-y-auto px-4 pt-6 pb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-6"
            role="log"
            aria-label="Conversation"
            aria-live="polite"
            aria-relevant="additions text"
            tabIndex={0}
          >
            <div className="mx-auto min-h-full w-full max-w-3xl">
              {timelineNotice}
              {loading ? (
                <MessageSkeletons />
              ) : messages.length || timelineExtras.length ? (
                <div className="flex flex-col gap-5">
                  {[
                    ...messages.map((message) => ({
                      id: `message-${message.id}`,
                      createdAt: message.createdAt,
                      node: (
                        <MessageBubble
                          message={message}
                          agentName={agentName}
                          agentId={agentId}
                          operations={session.operations}
                        />
                      ),
                    })),
                    ...timelineExtras,
                  ]
                    .sort(
                      (a, b) =>
                        Date.parse(a.createdAt) - Date.parse(b.createdAt) ||
                        a.id.localeCompare(b.id),
                    )
                    .map((entry) => (
                      <div key={entry.id} className="flex flex-col gap-5">
                        {entry.node}
                      </div>
                    ))}
                  {sending ? (
                    <div className="max-w-[92%]" role="status">
                      <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-[13px] text-sm text-muted-foreground">
                        <BotMark
                          seed={agentId}
                          name={agentName}
                          markKey={markKey}
                          size={20}
                          working
                          decorative
                        />
                        {workingLabel}…
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="wl-studio-chat__welcome">
                  <MessageCircle className="size-6" aria-hidden="true" />
                  <h2>What can {agentName} do for you?</h2>
                  <p>Ask a question, draft something, or give your Bot a task.</p>
                  {starterPrompts}
                </div>
              )}
            </div>
          </section>

          {showLatest ? (
            <div className="flex justify-center pt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  followLatest.current = true;
                  if (scrollRef.current)
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                  setShowLatest(false);
                }}
              >
                <ArrowDown size={14} aria-hidden="true" />
                Jump to latest
              </Button>
            </div>
          ) : null}
          {composerChoice}
          {composerOverride || (
            <div className="wl-studio-chat__composer shrink-0 bg-background px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
              <div className="mx-auto max-w-3xl">
                <div className={`${WL_COMPOSER_CLASSES.composerDock} wl-studio-composer`}>
                  <label className="sr-only" htmlFor={composerId}>
                    {`Message ${agentName}`}
                  </label>
                  <textarea
                    id={composerId}
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
                    placeholder="Ask anything, or tell your Bot what you need…"
                    className="wl-composer-dock__input max-h-40 overflow-y-auto disabled:opacity-60"
                  />
                  <div className="wl-composer-dock__toolbar">
                    {mode === "configure" && modeControls === "composer" && onModeChange ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-11 min-w-11 px-2"
                        onClick={() => selectMode("test")}
                        aria-label="Rehearse"
                        title="Rehearse privately"
                      >
                        <Mic className="size-4" aria-hidden="true" />
                        <span className="hidden sm:inline">Rehearse</span>
                      </Button>
                    ) : null}
                    {mode === "configure" && messages.length ? clearButton : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={!draft.trim() || sending || loading || clearing}
                      onClick={submit}
                      className="wl-work-send size-11 shrink-0 rounded-full p-0"
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
          )}
        </div>
      )}

      <PhoneTestDialog
        open={showPhoneTest}
        onClose={() => setShowPhoneTest(false)}
        agentId={agentId}
        agentName={agentName}
      />
    </section>
  );
});

export default StudioWorkroom;
