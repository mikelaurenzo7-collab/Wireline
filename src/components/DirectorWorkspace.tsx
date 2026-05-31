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
import ClientRouteLoading from "./layout/ClientRouteLoading";

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

// What the Director is *for* — a compact icon strip used inline in the
// composer hint row when the operator hasn't sent a message yet.
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
    <div className="flex flex-col h-full min-h-0 bg-transparent">
      {/* Identity header — gives the Director presence in conversation:
          medallion + name + live status, with the clear-thread affordance. */}
      {messages.length > 0 && (
        <div className="shrink-0 flex items-center justify-between gap-2 px-6 py-4 border-b border-brand/10 bg-background/20 backdrop-blur-md relative z-20">
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 flex w-9 h-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-[0_4px_12px_rgba(139,63,214,0.25)] relative overflow-hidden">
              <Sparkles className="w-4 h-4 relative z-10" />
              <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent" />
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink leading-tight">Director</p>
              <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground leading-tight mt-0.5">
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500/60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                Always-on manager
              </p>
            </div>
          </div>
          <button
            onClick={clearThread}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] uppercase tracking-[0.22em] text-muted hover:text-rose-600 hover:bg-rose-500/8 transition-colors border border-transparent hover:border-rose-500/10 cursor-pointer"
            aria-label="Clear Director thread"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear Thread</span>
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto px-6 py-6 space-y-4 scrollbar-hide"
      >
        {isLoading ? (
          <ClientRouteLoading
            icon={<Compass className="w-6 h-6 animate-spin-slow" />}
            label="Loading thread"
            className="py-20"
          />
        ) : messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center pt-6 pb-2 px-2 max-w-lg mx-auto"
          >
            {/*
              Intentionally minimal. The chat IS the product — the composer
              below is where attention belongs. We avoid a hero card here so
              the chat surface (especially on mobile) stays uncluttered.
              A tiny capability strip + starter chips give a first-time
              operator just enough orientation to start typing.
            */}
            {agents.length > 0 ? (
              <p className="text-[12px] text-muted-foreground mb-3">
                {agents.length} agent{agents.length === 1 ? "" : "s"} active — ask me anything about
                your fleet.
              </p>
            ) : (
              <div className="flex items-center justify-center gap-1.5 mb-3 flex-wrap">
                {DIRECTOR_CAPABILITIES.map((c, i) => (
                  <React.Fragment key={c.label}>
                    {i > 0 && (
                      <span className="w-0.5 h-0.5 rounded-full bg-brand/25" aria-hidden="true" />
                    )}
                    <span className="inline-flex items-center gap-1 px-1.5 text-brand/75">
                      <c.icon className="w-3 h-3" aria-hidden="true" />
                      <span className="font-mono text-[9px] uppercase tracking-[0.16em] font-semibold">
                        {c.label}
                      </span>
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Starter prompts — chip row, slimmer than the composer. */}
            <div className="flex flex-wrap justify-center gap-1.5 w-full">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="group inline-flex items-center gap-1 text-left text-[11px] text-ink/80 rounded-full border border-brand/15 bg-white/40 dark:bg-black/10 px-2.5 py-1 hover:border-brand/35 hover:bg-white/60 dark:hover:bg-black/25 transition-colors cursor-pointer"
                >
                  <span className="min-w-0">{p}</span>
                  <ArrowUpRight className="w-2.5 h-2.5 shrink-0 text-brand/40 group-hover:text-brand transition-colors" />
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "flex items-end gap-3",
                m.role === "operator" ? "justify-end" : "justify-start",
              )}
            >
              {/* Director avatar */}
              {m.role === "director" && (
                <span
                  className="shrink-0 flex w-8 h-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/20 mb-0.5"
                  aria-hidden="true"
                >
                  <Sparkles className="w-4 h-4" />
                </span>
              )}
              <div
                className={cn(
                  "max-w-[80%] min-w-0 flex flex-col",
                  m.role === "operator" && "items-end",
                )}
              >
                <div
                  className={cn(
                    "group rounded-2xl px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap break-words relative",
                    m.role === m.role && m.role === "operator"
                      ? "bg-gradient-to-br from-[#8B3FD6] to-[#5A2499] text-white rounded-br-none shadow-[0_4px_16px_-4px_rgba(139,63,214,0.3)] border border-brand/20"
                      : "bg-white/60 dark:bg-[#120F16]/60 backdrop-blur-sm border border-brand/12 dark:border-brand/20 text-ink dark:text-foreground rounded-bl-none shadow-[0_4px_20px_-6px_rgba(139,63,214,0.03)]",
                  )}
                >
                  {m.content}
                  {/* Subtle hover timestamp */}
                  {m.createdAt && (
                    <div className="mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex justify-end">
                      <time
                        dateTime={m.createdAt}
                        className={cn(
                          "text-[9px] font-mono tabular-nums",
                          m.role === "operator" ? "text-white/60" : "text-muted-foreground/60",
                        )}
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
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {m.suggestions.map((s, i) => {
                      const Icon = SUGGESTION_ICON[s.kind];
                      return (
                        <button
                          key={`${s.kind}-${i}`}
                          onClick={() => runSuggestion(s)}
                          className="group inline-flex items-center gap-1.5 text-[11px] font-medium text-brand rounded-full border border-brand/20 bg-brand/[0.04] px-3.5 py-1.5 hover:bg-brand/10 hover:border-brand/40 hover:-translate-y-px active:scale-95 transition-all duration-300 shadow-[0_2px_8px_-2px_rgba(139,63,214,0.06)] cursor-pointer"
                        >
                          <Icon className="w-3 h-3 text-brand" />
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
            transition={{ duration: 0.2 }}
            className="flex items-end gap-3 justify-start"
          >
            <span
              className="shrink-0 flex w-8 h-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/20 mb-0.5"
              aria-hidden="true"
            >
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="bg-white/60 dark:bg-[#120F16]/60 backdrop-blur-sm border border-brand/20 rounded-2xl rounded-bl-none px-4 py-3 shadow-[0_4px_20px_-6px_rgba(139,63,214,0.03)]">
              <div className="flex items-center gap-2 text-[12px] text-ink/80 dark:text-foreground/80">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
                </span>
                <span className="font-semibold tracking-wider font-mono uppercase text-[10px]">
                  Thinking…
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-brand/10 px-6 py-4 bg-background/20 backdrop-blur-md relative z-10">
        <div className="flex items-end gap-2.5 rounded-xl border border-brand/15 bg-white/70 dark:bg-black/30 backdrop-blur-sm px-4 py-2.5 transition-all duration-300 focus-within:border-brand/40 focus-within:ring-4 focus-within:ring-brand/5 focus-within:shadow-[0_0_24px_rgba(139,63,214,0.06)]">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask your Director anything…"
            className="flex-1 resize-none bg-transparent text-[14px] text-ink dark:text-foreground placeholder:text-muted-foreground/60 outline-none max-h-24 py-1"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || isSending}
            className="shrink-0 w-9 h-9 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-brand to-brand-deep text-on-brand flex items-center justify-center shadow-md shadow-brand/20 disabled:opacity-40 disabled:shadow-none enabled:active:scale-95 enabled:hover:shadow-lg enabled:hover:shadow-brand/20 transition-all duration-200 cursor-pointer"
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
