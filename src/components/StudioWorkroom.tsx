import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { ArrowLeft, Loader2, MessageSquareText, Phone, Send, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "../components/atoms";
import AgentFace from "./AgentFace";
import OutboundDialDialog from "./OutboundDialDialog";
import AgentLaunchReadinessCard from "./AgentLaunchReadinessCard";
import { useStreamingChat } from "../hooks/useStreamingChat";
import { authFetch } from "../lib/api";
import { WORKSPACE_VOICE } from "../lib/product-copy";
import { WL_COMPOSER_CLASSES } from "../lib/wireline-design-system";

type LooseRecord = Record<string, unknown>;

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

const QUICK_PROMPTS = ["Change voice", "Edit workflows", "Adjust greeting", "Deploy now"] as const;

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

function seedMessages(agentName: string): StudioMessage[] {
  const name = agentName || "this agent";
  return [
    {
      id: "seed-ready",
      role: "agent",
      content: `I'm ready to help you build ${name}. ${name} is almost ready — run a test call when you want to hear it live. What would you like to configure?`,
      createdAt: new Date().toISOString(),
    },
    {
      id: "seed-user",
      role: "Account Holder",
      content: "Can you walk me through the greeting?",
      createdAt: new Date().toISOString(),
    },
    {
      id: "seed-greeting",
      role: "agent",
      content: `${name}'s current greeting is: “Thank you for calling, how can I help you today?” Want me to personalize it with your business name?`,
      createdAt: new Date().toISOString(),
    },
  ];
}

function AgentAvatar({ agentName, speaking = false }: { agentName: string; speaking?: boolean }) {
  return (
    <AgentFace
      seed={agentName || "agent"}
      size={24}
      speaking={speaking}
      title={`${agentName || "Agent"} face`}
      className="mt-1 shrink-0"
    />
  );
}

function MessageBubble({
  message,
  agentName,
  speaking = false,
}: {
  message: StudioMessage;
  agentName: string;
  speaking?: boolean;
}) {
  const isUser = message.role === "Account Holder";
  const suggestions = proposalCount(message);

  if (isUser) {
    return (
      <article className="ml-auto max-w-[82%]">
        <div className="rounded-[10px] bg-primary px-4 py-3 text-[14px] font-medium leading-[1.45] text-primary-foreground shadow-sm">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="flex max-w-[90%] items-start gap-3">
      <AgentAvatar agentName={agentName} speaking={speaking} />
      <div className="min-w-0">
        <div className="rounded-[10px] border border-border bg-card px-4 py-3 text-[14px] leading-[1.48] text-foreground shadow-sm">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        {message.proposals && suggestions > 0 ? (
          <div className="mt-2 rounded-[10px] border border-[var(--wireline-color-feedback-success-border)] bg-[var(--wireline-color-feedback-success-surface)] px-3 py-2 text-xs text-primary">
            {suggestions} proposed update{suggestions === 1 ? "" : "s"} ready for {agentName}.
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
    agentRole?: string | null;
    agentPhoneNumber?: string | null;
    initialCommand?: string;
    commandNonce?: string;
    onBack: () => void;
    backLabel?: string;
    layout?: "standalone" | "canvas" | "split";
  }
>(function StudioWorkroom(
  {
    agentId,
    agentName,
    agentRole,
    agentPhoneNumber,
    initialCommand,
    commandNonce,
    onBack,
    backLabel = "Agent workspace",
    layout = "standalone",
  },
  ref,
) {
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [draft, setDraft] = useState(initialCommand || "");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [showOutboundDial, setShowOutboundDial] = useState(false);
  const [outcomes, setOutcomes] = useState<unknown[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const split = layout === "split";

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
  }, [initialCommand, commandNonce]);

  useEffect(() => {
    if (!agentId || split) return;
    authFetch(`/api/calls?limit=5`)
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data?.calls) ? data.calls : [];
        const forAgent = list
          .filter(
            (c: unknown) =>
              (c as LooseRecord)?.agentId === agentId || (c as LooseRecord)?.agent_id === agentId,
          )
          .slice(0, 2);
        setOutcomes(forAgent);
      })
      .catch(() => {});
  }, [agentId, split]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streamState.phase, split]);

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

  const visibleMessages = messages.length ? messages : split ? seedMessages(agentName) : [];

  const clearButton = (
    <button
      type="button"
      disabled={!messages.length || clearing}
      onClick={() => void clearConversation()}
      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Clear conversation"
    >
      {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );

  return (
    <main
      className={`flex h-full min-h-0 flex-col bg-background ${layout === "canvas" ? "relative" : ""}`}
    >
      {layout === "standalone" ? (
        <header className="relative flex h-12 shrink-0 items-center border-b border-border bg-background/95 px-3 backdrop-blur sm:px-4">
          <button
            type="button"
            onClick={onBack}
            className="z-10 grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={backLabel}
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <div className="pointer-events-none absolute left-1/2 max-w-[42vw] -translate-x-1/2 text-center wl-centered-header sm:max-w-md">
            <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {agentName}
            </p>
            <p className="text-[10px] text-muted-foreground">Direct the work.</p>
          </div>
          <div className="z-10 ml-auto flex items-center gap-1.5">{clearButton}</div>
        </header>
      ) : split ? (
        <header className="shrink-0 border-b border-border/60 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                Wireline AI
              </p>
              <p className="mt-2 text-[13px] leading-5 text-foreground/75">
                Talk to build. Ask me anything about {agentName}&apos;s setup.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setShowOutboundDial(true)}
              >
                <Phone className="h-3.5 w-3.5" aria-hidden />
                <span className="hidden sm:inline">Outbound</span>
              </Button>
              <button
                type="button"
                onClick={onBack}
                className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {backLabel} →
              </button>
            </div>
          </div>
        </header>
      ) : (
        <div className="absolute right-3 top-2 z-10 sm:right-4">{clearButton}</div>
      )}

      {error ? (
        <div
          className="mx-4 mt-3 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        {split ? (
          <AgentLaunchReadinessCard
            agent={{
              id: agentId,
              name: agentName,
              role: agentRole,
              phone_number: agentPhoneNumber,
            }}
            compact
            className="mb-5"
          />
        ) : null}
        {loading ? (
          <MessageSkeletons />
        ) : visibleMessages.length ? (
          <div className="flex flex-col gap-5">
            {visibleMessages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                agentName={agentName}
                speaking={
                  sending &&
                  streamState.phase === "replying" &&
                  message.role === "agent" &&
                  index === visibleMessages.length - 1
                }
              />
            ))}
            {sending ? (
              <div className="flex max-w-[90%] items-start gap-3">
                <AgentAvatar agentName={agentName} speaking={streamState.phase === "replying"} />
                <div className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-[13px] text-sm text-muted-foreground">
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

      {!loading && !split ? (
        <div className="mx-auto max-w-3xl px-4 pb-3 sm:px-6 xl:max-w-5xl 2xl:max-w-6xl">
          <div className="mb-2 flex items-center justify-between">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Recent outcomes
            </div>
            <Link
              to={`/knowledge?agent=${encodeURIComponent(agentId)}`}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              View in Knowledge →
            </Link>
          </div>
          <span className="sr-only">
            Run calls, draft texts, queue follow-up, review approvals, and prepare handoff.
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            {(outcomes.length
              ? outcomes
              : [
                  {
                    id: "o1",
                    channel: "voice",
                    summary: "Scheduled follow-up for Tuesday 2pm. Customer confirmed address.",
                    next: "Send SMS reminder + prep brief",
                    tag: "scheduled",
                    outcomeTag: "scheduled",
                  },
                  {
                    id: "o2",
                    channel: "sms",
                    summary: "Confirmed service window. No escalations.",
                    next: "Log in CRM",
                    tag: "qualified",
                    outcomeTag: "qualified",
                  },
                ]
            ).map((o: unknown) => (
              <button
                key={(o as LooseRecord).id as string}
                type="button"
                onClick={() => {
                  const oo = o as LooseRecord;
                  setDraft(
                    `Review and train from this outcome: ${oo.summary || ""}. Next step: ${oo.next || ""}.`,
                  );
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
                className="rounded-xl border border-border bg-card p-3 text-left text-sm transition hover:border-primary/30 active:scale-[0.985]"
              >
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {((o as LooseRecord).channel || (o as LooseRecord).direction) === "voice" ||
                  ((o as LooseRecord).channel || (o as LooseRecord).direction) === "inbound" ? (
                    <Phone size={12} />
                  ) : (
                    <MessageSquareText size={12} />
                  )}
                  <span>
                    {String((o as LooseRecord).channel || (o as LooseRecord).direction || "call")}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-px text-[9px]">
                    {String((o as LooseRecord).outcomeTag || (o as LooseRecord).tag || "outcome")}
                  </span>
                </div>
                <div className="mt-1 leading-snug text-foreground sm:line-clamp-2">
                  {String((o as LooseRecord).summary || "Call handled.")}
                </div>
                <div className="mt-1 text-[12px] text-muted-foreground">
                  Next: {String((o as LooseRecord).next || "Review in ledger")}
                </div>
                <div className="mt-1 text-[10px] text-primary">Brief agent from this outcome</div>
              </button>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Every outcome trains the fleet.</p>
        </div>
      ) : null}

      <div className="shrink-0 border-t border-border bg-background px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-3 sm:px-4">
        <div className="mx-auto max-w-3xl xl:max-w-5xl 2xl:max-w-6xl">
          <div className={WL_COMPOSER_CLASSES.composerDock}>
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
              rows={split ? 1 : 2}
              disabled={sending}
              placeholder={WORKSPACE_VOICE.directAgent(agentName)}
              className="wl-composer-dock__input disabled:opacity-60"
            />
            <div className="wl-composer-dock__toolbar">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((prompt) => (
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
              <div className="flex items-center gap-1.5">
                {!split ? clearButton : null}
                <Button
                  type="button"
                  size="sm"
                  disabled={!draft.trim() || sending}
                  onClick={submit}
                  className="transition-all active:scale-[0.985]"
                  aria-busy={sending}
                >
                  {sending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                  <span className="ml-1 hidden sm:inline">{sending ? "Sending" : "Send"}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2 hidden text-center text-[10px] text-muted-foreground sm:block">
          Cmd + Enter to send
        </div>
      </div>
      <OutboundDialDialog
        open={showOutboundDial}
        onClose={() => setShowOutboundDial(false)}
        initialAgentId={agentId}
      />
    </main>
  );
});

export default StudioWorkroom;
