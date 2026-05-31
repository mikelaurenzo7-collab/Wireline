/**
 * DirectorWorkspace — the account-level "manager" chat surface.
 *
 * The Director sits ABOVE the individual agents: it's always available (even
 * before the operator owns a single agent) and acts as the strategist that
 * helps plan the fleet, decide what agents to hire, and coach them. Unlike
 * AgentWorkspace it doesn't propose agent-config changes — it advises and
 * surfaces lightweight navigation suggestions (create an agent, open an
 * agent's chat, jump to training / live ops / insights).
 *
 * Backed by /api/director/messages (one thread per operator). Normal turns
 * run on Sonnet; explicit deep-analysis requests escalate to Opus server-side.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  Send,
  Loader2,
  Trash2,
  Sparkles,
  Plus,
  MessagesSquare,
  Activity,
  GraduationCap,
  BarChart3,
  ArrowUpRight,
  Compass,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { useAgents } from "../contexts/AgentsContext";
import { cn } from "../lib/utils";

type SuggestionKind =
  | "create_agent"
  | "open_agent_chat"
  | "view_ops"
  | "open_training"
  | "open_insights";

interface DirectorSuggestion {
  kind: SuggestionKind;
  label: string;
  agentId?: string;
}

interface DirectorMessage {
  id: string;
  role: "operator" | "director";
  content: string;
  createdAt: string;
  suggestions?: DirectorSuggestion[];
}

const SUGGESTION_ICON: Record<SuggestionKind, React.ElementType> = {
  create_agent: Plus,
  open_agent_chat: MessagesSquare,
  view_ops: Activity,
  open_training: GraduationCap,
  open_insights: BarChart3,
};

const STARTER_PROMPTS = [
  "What kind of agent should I hire first?",
  "Help me set up a sales agent for my business.",
  "Audit my fleet and tell me what to improve.",
] as const;

// What the Director is *for* — shown as a quiet capability strip on the
// welcome screen so a first-time operator instantly grasps its remit.
const DIRECTOR_CAPABILITIES = [
  { icon: Compass, label: "Plan" },
  { icon: Plus, label: "Hire" },
  { icon: GraduationCap, label: "Coach" },
  { icon: BarChart3, label: "Analyze" },
] as const;

export default function DirectorWorkspace() {
  const navigate = useNavigate();
  const { agents } = useAgents();
  const { error: toastError, success: toastSuccess } = useToast();
  const [messages, setMessages] = useState<DirectorMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      const r = await authFetch("/api/director/messages");
      if (!r.ok) throw new Error("Failed to load messages");
      const data = await r.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch {
      toastError("Couldn't load the Director", "Check connection and refresh");
    } finally {
      setIsLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const runSuggestion = useCallback(
    (s: DirectorSuggestion) => {
      switch (s.kind) {
        case "create_agent":
          navigate("/agents");
          break;
        case "open_agent_chat":
          if (s.agentId) navigate(`/chat/${s.agentId}`);
          break;
        case "view_ops":
          navigate("/ops");
          break;
        case "open_training": {
          // Training now lives inside each agent's chat. Open the suggested
          // agent's Training tab (or the first owned agent's); if the operator
          // has no agents yet, send them to create one.
          const target = s.agentId || agents[0]?.id;
          navigate(target ? `/chat/${target}?tab=training` : "/agents");
          break;
        }
        case "open_insights":
          navigate("/insights");
          break;
      }
    },
    [navigate, agents],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isSending) return;
      const optimistic: DirectorMessage = {
        id: `tmp-${Date.now()}`,
        role: "operator",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);
      setInput("");
      setIsSending(true);
      try {
        const r = await authFetch("/api/director/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
        });
        if (!r.ok) throw new Error("Send failed");
        const data = await r.json();
        const reply: DirectorMessage = {
          id: `director-${Date.now()}`,
          role: "director",
          content: data.reply || "(empty reply)",
          createdAt: new Date().toISOString(),
          suggestions: Array.isArray(data.suggestions) ? data.suggestions : undefined,
        };
        setMessages((prev) => [...prev, reply]);
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setInput(trimmed);
        toastError("Couldn't send", "Try again in a moment");
      } finally {
        setIsSending(false);
        inputRef.current?.focus();
      }
    },
    [isSending, toastError],
  );

  const clearThread = useCallback(async () => {
    if (!confirm("Clear your entire conversation with the Director? This can't be undone.")) return;
    try {
      const r = await authFetch("/api/director/messages", { method: "DELETE" });
      if (!r.ok) throw new Error("Clear failed");
      setMessages([]);
      toastSuccess("Thread cleared", "Fresh start with your Director");
    } catch {
      toastError("Couldn't clear thread");
    }
  }, [toastError, toastSuccess]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Identity header — gives the Director presence in conversation:
          medallion + name + live status, with the clear-thread affordance. */}
      {messages.length > 0 && (
        <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2.5 border-b border-black/8">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="shrink-0 flex w-8 h-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/25">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink leading-tight truncate">Director</p>
              <p className="flex items-center gap-1.5 text-[10px] text-muted leading-tight">
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span
                    className="animate-ping absolute inline-flex h-full w-full rounded-full"
                    style={{ background: "rgba(16,185,129,0.60)" }}
                  />
                  <span
                    className="relative inline-flex rounded-full h-1.5 w-1.5"
                    style={{ background: "#10b981" }}
                  />
                </span>
                Always-on manager
              </p>
            </div>
          </div>
          <button
            onClick={clearThread}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.22em] text-muted hover:text-rose-600 hover:bg-rose-500/8 transition-colors"
            aria-label="Clear Director thread"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted" aria-busy="true">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center py-10 lg:py-14 px-3 max-w-md mx-auto"
          >
            {/* Branded medallion with a soft aurora halo */}
            <div className="relative mb-5">
              <span
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150"
              />
              <span className="relative flex w-14 h-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-lg shadow-brand/25 aurora-ring">
                <Sparkles className="w-6 h-6" />
              </span>
            </div>

            <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70 mb-3">
              Your Director
            </p>
            <h2 className="font-display italic text-2xl lg:text-[1.75rem] leading-[1.1] text-ink mb-3">
              {agents.length > 0
                ? `${agents.length} agent${agents.length === 1 ? "" : "s"} on deck.`
                : "Let’s build your fleet."}
            </h2>
            <p className="text-[13px] text-muted leading-relaxed mb-6 max-w-sm">
              {agents.length > 0
                ? `I’m your always-on manager. Tell me what to improve, audit, or teach across your fleet — I’ll route it to the right place.`
                : `I’m your always-on manager — tell me about your business and I’ll help you hire the right agents, coach them, and read the room across every call.`}
            </p>

            {/* Fleet-at-a-glance — visible only when agents exist so the operator
                instantly sees what’s running before they type a word. */}
            {agents.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className="w-full mb-5 grid grid-cols-2 gap-1.5"
              >
                {agents.slice(0, 4).map((a) => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/chat/${a.id}`)}
                    className="flex items-center gap-2 rounded-xl border border-black/8 glass px-3 py-2.5 text-left hover:border-brand/25 hover:shadow-sm hover:-translate-y-px transition-all duration-300"
                  >
                    <span className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-brand to-brand-deep text-on-brand text-[9px] font-semibold flex items-center justify-center">
                      {a.name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 text-[11px] font-medium text-ink truncate">
                      {a.name}
                    </span>
                  </button>
                ))}
                {agents.length > 4 && (
                  <span className="flex items-center justify-center text-[10px] text-muted font-mono px-3 py-2.5">
                    +{agents.length - 4} more
                  </span>
                )}
              </motion.div>
            )}

            {/* Capability strip — instantly communicates the Director's remit */}
            <div className="flex items-center justify-center gap-1.5 mb-7">
              {DIRECTOR_CAPABILITIES.map((c, i) => (
                <React.Fragment key={c.label}>
                  {i > 0 && <span className="w-1 h-1 rounded-full bg-ink/15" aria-hidden="true" />}
                  <span className="inline-flex items-center gap-1.5 px-1">
                    <c.icon className="w-3.5 h-3.5 text-brand/60" aria-hidden="true" />
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                      {c.label}
                    </span>
                  </span>
                </React.Fragment>
              ))}
            </div>

            {/* Starter prompts — first-class cards with hover-revealed arrow */}
            <div className="flex flex-col gap-2 w-full">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="group flex items-center justify-between gap-3 text-left text-[13px] text-ink rounded-xl border border-black/10 glass px-3.5 py-3 hover:border-brand/30 hover:shadow-md hover:shadow-brand/5 hover:-translate-y-px transition-all duration-300"
                >
                  <span className="min-w-0">{p}</span>
                  <ArrowUpRight className="w-4 h-4 shrink-0 text-muted/50 group-hover:text-brand group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300" />
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "flex items-end gap-2",
                m.role === "operator" ? "justify-end" : "justify-start",
              )}
            >
              {/* Director avatar — anchors the thread to a named manager */}
              {m.role === "director" && (
                <span
                  className="shrink-0 flex w-7 h-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/20 mb-0.5"
                  aria-hidden="true"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
              )}
              <div className={cn("max-w-[84%] min-w-0", m.role === "operator" && "items-end")}>
                <div
                  className={cn(
                    "group rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words",
                    m.role === "operator"
                      ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand rounded-br-md shadow-sm shadow-brand/20"
                      : "glass border border-black/8 text-ink rounded-bl-md",
                  )}
                >
                  {m.content}
                  {/* Subtle hover-reveal timestamp — consistent with AgentWorkspace */}
                  {m.createdAt && (
                    <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <time
                        dateTime={m.createdAt}
                        className="text-[9px] text-muted/40 font-mono tabular-nums"
                      >
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  )}
                </div>
                {m.suggestions && m.suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.suggestions.map((s, i) => {
                      const Icon = SUGGESTION_ICON[s.kind];
                      return (
                        <button
                          key={`${s.kind}-${i}`}
                          onClick={() => runSuggestion(s)}
                          className="group inline-flex items-center gap-1.5 text-[11px] font-medium text-brand rounded-full border border-brand/30 bg-brand/[0.06] px-2.5 py-1 min-h-[28px] hover:bg-brand/12 hover:border-brand/45 hover:-translate-y-px transition-all duration-200"
                        >
                          <Icon className="w-3 h-3" />
                          {s.label}
                          <ArrowUpRight className="w-2.5 h-2.5 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          ))
        )}
        {isSending && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-end gap-2 justify-start"
          >
            <span
              className="shrink-0 flex w-7 h-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/20 mb-0.5"
              aria-hidden="true"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <div className="glass border border-brand/20 rounded-2xl rounded-bl-md px-3 py-2 space-y-0.5">
              <div className="flex items-center gap-2 text-[11px] text-ink/80">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
                </span>
                <span className="font-medium">Thinking…</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-black/8 px-3 py-2.5">
        <div className="flex items-end gap-1.5 rounded-xl border border-black/10 glass px-2.5 py-1.5 transition-all duration-300 focus-within:border-brand/40 focus-within:shadow-md focus-within:shadow-brand/5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask your Director anything…"
            className="flex-1 resize-none bg-transparent text-[13px] text-ink placeholder:text-muted/60 outline-none max-h-24 py-1"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || isSending}
            className="shrink-0 w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-brand to-brand-deep text-on-brand flex items-center justify-center shadow-sm shadow-brand/20 disabled:opacity-40 disabled:shadow-none enabled:active:scale-95 transition-all duration-200"
            aria-label="Send message"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
