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
import {
  Send,
  Loader2,
  Trash2,
  Compass,
  Sparkles,
  Plus,
  MessagesSquare,
  Activity,
  GraduationCap,
  BarChart3,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
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

export default function DirectorWorkspace() {
  const navigate = useNavigate();
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
        case "open_training":
          navigate("/train");
          break;
        case "open_insights":
          navigate("/insights");
          break;
      }
    },
    [navigate],
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
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-black/8">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-brand to-brand/70 text-on-brand flex items-center justify-center">
            <Compass className="w-4.5 h-4.5" />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink leading-tight">Director</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted/70">
              Your AI manager
            </div>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearThread}
            className="shrink-0 inline-flex items-center gap-1.5 text-[11px] text-muted hover:text-ink transition-colors"
            aria-label="Clear Director thread"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted" aria-busy="true">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center text-center py-10 px-2 max-w-md mx-auto">
            <span className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center mb-3">
              <Sparkles className="w-5 h-5 text-brand" />
            </span>
            <h2 className="font-display italic text-xl text-ink mb-1.5">Meet your Director</h2>
            <p className="text-[13px] text-muted leading-relaxed mb-5">
              I&apos;m your always-on manager. Tell me about your business and I&apos;ll help you
              hire the right agents, coach them, and read the room across every call. Ask me
              anything to get started.
            </p>
            <div className="flex flex-col gap-2 w-full">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="text-left text-[12.5px] text-ink rounded-xl border border-black/10 glass px-3.5 py-2.5 hover:border-brand/30 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn("flex", m.role === "operator" ? "justify-end" : "justify-start")}
            >
              <div className={cn("max-w-[85%] min-w-0", m.role === "operator" && "items-end")}>
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words",
                    m.role === "operator"
                      ? "bg-brand text-on-brand rounded-br-md"
                      : "glass border border-black/8 text-ink rounded-bl-md",
                  )}
                >
                  {m.content}
                </div>
                {m.suggestions && m.suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.suggestions.map((s, i) => {
                      const Icon = SUGGESTION_ICON[s.kind];
                      return (
                        <button
                          key={`${s.kind}-${i}`}
                          onClick={() => runSuggestion(s)}
                          className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-brand rounded-full border border-brand/30 bg-brand/[0.06] px-2.5 py-1 hover:bg-brand/10 transition-colors"
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {isSending && (
          <div className="flex justify-start">
            <div className="glass border border-black/8 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-black/8 p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-black/10 glass px-3 py-2 focus-within:border-brand/40 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="Ask your Director anything…"
            className="flex-1 resize-none bg-transparent text-[13px] text-ink placeholder:text-muted/60 outline-none max-h-32 py-1"
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || isSending}
            className="shrink-0 w-9 h-9 rounded-xl bg-brand text-on-brand flex items-center justify-center disabled:opacity-40 transition-opacity"
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
