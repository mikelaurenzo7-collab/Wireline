/**
 * DirectorWorkspace — the account-level "manager" chat surface.
 *
 * The Director sits ABOVE the individual agents: it's always available (even
 * before the operator owns a single agent) and acts as the strategist that
 * helps plan the fleet, decide what agents to hire, and coach them.
 *
 * Like each agent's own workspace, the Director is a self-contained surface
 * with four tabs — one verb each:
 *   - Chat        — talk to your manager; persistent account-level thread
 *   - Training    — the business brief that grounds every reply + behaviour
 *   - Connectors  — the account-level channels the whole fleet acts through
 *   - Memory      — what the Director carries: thread, fleet, activity, brief
 *
 * Backed by /api/director/* (one thread + one brief per operator). Normal turns
 * run on Sonnet; explicit deep-analysis requests (or the always-deep toggle)
 * escalate to Opus server-side. The tabbed shell mirrors AgentWorkspace so the
 * Director feels like "the manager you also DM", not a separate concept.
 */
import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
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
  Plug,
  Brain,
  Phone,
  Mail,
  MessageCircle,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { useAgents } from "../contexts/AgentsContext";
import { cn } from "../lib/utils";
import ProposalCard from "./ProposalCard";

const DirectorTraining = lazy(() => import("./DirectorTraining"));
const DirectorConnectors = lazy(() => import("./DirectorConnectors"));
const DirectorMemory = lazy(() => import("./DirectorMemory"));

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

type DelegationChannel = "call" | "email" | "text";

interface DirectorDelegation {
  agentId: string;
  agentName: string;
  channel: DelegationChannel;
  label: string;
  draft: string;
}

interface DirectorMessage {
  id: string;
  role: "operator" | "director";
  content: string;
  createdAt: string;
  suggestions?: DirectorSuggestion[];
  delegations?: DirectorDelegation[];
}

const DELEGATION_ICON: Record<DelegationChannel, React.ElementType> = {
  call: Phone,
  email: Mail,
  text: MessageCircle,
};

// ── Shared overview shapes (mirror /api/director/overview) ──────────────
export interface DirectorProfileData {
  businessName: string | null;
  industry: string | null;
  offerings: string | null;
  primaryGoal: string | null;
  notes: string | null;
  autoSuggestAgents: boolean;
  deepAnalysisDefault: boolean;
}

export interface DirectorConnectorsData {
  email: { connected: boolean; count: number };
  calendar: { connected: boolean };
  crm: { connected: boolean; type: string | null };
  sms: { connected: boolean };
  phone: { connected: boolean };
}

export interface DirectorFleetItem {
  id: string;
  name: string | null;
  role: string | null;
}

export interface DirectorRecentCall {
  summary: string | null;
  sentiment: string | null;
  intent: string | null;
  outcome: string | null;
  direction: string | null;
  customerNumber: string | null;
  durationSeconds: number | null;
  agentId: string | null;
  createdAt: string | null;
}

export interface DirectorOverview {
  fleet: DirectorFleetItem[];
  stats: { calls7d: number; bookings7d: number } | null;
  connectors: DirectorConnectorsData;
  profile: DirectorProfileData;
  recentCalls: DirectorRecentCall[];
  messageCount: number;
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

type DirectorTab = "chat" | "training" | "connectors" | "memory";

const DIRECTOR_TABS: {
  id: DirectorTab;
  label: string;
  icon: typeof MessagesSquare;
  help: string;
}[] = [
  { id: "chat", label: "Chat", icon: MessagesSquare, help: "Talk to your manager" },
  {
    id: "training",
    label: "Training",
    icon: GraduationCap,
    help: "Business brief & behaviour",
  },
  { id: "connectors", label: "Connectors", icon: Plug, help: "Account-level channels" },
  { id: "memory", label: "Memory", icon: Brain, help: "What the Director remembers" },
];

function isDirectorTab(v: string | null): v is DirectorTab {
  return v === "chat" || v === "training" || v === "connectors" || v === "memory";
}

interface DirectorWorkspaceProps {
  /** Account overview, fetched once by the parent and shared with the dock so
   *  the Director never double-fetches /api/director/overview. */
  overview: DirectorOverview | null;
  overviewLoading: boolean;
  /** Lets the workspace reflect local mutations (brief save, thread clear)
   *  back into the shared overview without a refetch. */
  onOverviewChange: React.Dispatch<React.SetStateAction<DirectorOverview | null>>;
}

export default function DirectorWorkspace({
  overview,
  overviewLoading,
  onOverviewChange: setOverview,
}: DirectorWorkspaceProps) {
  const navigate = useNavigate();
  const { agents } = useAgents();
  const { error: toastError, success: toastSuccess } = useToast();
  const [messages, setMessages] = useState<DirectorMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // The active tab lives in the URL (?tab=training) so each view is
  // deep-linkable and survives a refresh — exactly like AgentWorkspace.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: DirectorTab = isDirectorTab(tabParam) ? tabParam : "chat";
  const setActiveTab = useCallback(
    (next: DirectorTab) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === "chat") p.delete("tab");
          else p.set("tab", next);
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

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
    if (activeTab === "chat" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTab]);

  // Delegations the operator has waved off, keyed by `${messageId}:${index}`
  // so they collapse to a resolved state instead of lingering.
  const [dismissedDelegations, setDismissedDelegations] = useState<Record<string, boolean>>({});

  const handDelegation = useCallback(
    (d: DirectorDelegation) => {
      // Hand the drafted task to the purchased agent: open its chat with the
      // instruction pre-seeded into the composer. The agent then proposes and
      // executes it under its own gates (calls are paid-only) — the Director
      // directs, it never sends or dials itself.
      navigate(`/chat/${d.agentId}`, { state: { seed: d.draft } });
    },
    [navigate],
  );

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
          // Per-agent training lives inside each agent's chat. Open the
          // suggested agent's Training tab (or the first owned agent's); if the
          // operator has no agents yet, send them to create one.
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
        if (!r.ok) {
          // Surface a useful reason instead of silently dropping the turn —
          // the most common causes are rate limiting (429) and an
          // unconfigured key (handled server-side, but be defensive).
          let detail = "Try again in a moment";
          if (r.status === 429) detail = "You're sending a bit fast — give it a few seconds";
          else {
            const body = await r.json().catch(() => null);
            if (body?.error) detail = String(body.error);
          }
          throw new Error(detail);
        }
        const data = await r.json();
        const reply: DirectorMessage = {
          id: `director-${Date.now()}`,
          role: "director",
          content: data.reply || "(empty reply)",
          createdAt: new Date().toISOString(),
          suggestions: Array.isArray(data.suggestions) ? data.suggestions : undefined,
          delegations: Array.isArray(data.delegations) ? data.delegations : undefined,
        };
        setMessages((prev) => [...prev, reply]);
      } catch (e) {
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setInput(trimmed);
        toastError("Couldn't reach the Director", e instanceof Error ? e.message : undefined);
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
      setOverview((prev) => (prev ? { ...prev, messageCount: 0 } : prev));
      toastSuccess("Thread cleared", "Fresh start with your Director");
    } catch {
      toastError("Couldn't clear thread");
    }
  }, [toastError, toastSuccess, setOverview]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const tabFallback = (
    <div className="flex items-center justify-center py-16 text-muted">
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header + tab strip */}
      <div className="shrink-0 border-b border-black/8">
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-brand to-brand/70 text-on-brand flex items-center justify-center">
              <Compass className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-ink leading-tight">Director</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted/70">
                Your AI manager · account-level
              </div>
            </div>
          </div>
          {activeTab === "chat" && messages.length > 0 && (
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
        {/* One verb per tab: talk · teach · wire · recall — mirrors the
            per-agent workspace so the Director feels like "the manager you
            also DM". The active pill glides between tabs. */}
        <div
          role="tablist"
          aria-label="Director workspace sections"
          className="flex items-center gap-1 px-2 pb-2 overflow-x-auto scrollbar-hide"
        >
          {DIRECTOR_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                aria-controls={`director-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                title={tab.help}
                className={cn(
                  "relative shrink-0 inline-flex items-center gap-1.5 px-3 min-h-9 rounded-lg text-[10px] uppercase tracking-[0.18em] transition-colors",
                  active ? "text-brand" : "text-muted hover:text-ink hover:bg-black/5",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="director-tab-pill"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-lg bg-brand/10 border border-brand/30"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <tab.icon className="relative z-[1] w-3 h-3" />
                <span className="relative z-[1]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab panels */}
      {activeTab === "training" ? (
        <div
          id="director-panel-training"
          role="tabpanel"
          className="flex-1 min-h-0 overflow-y-auto"
        >
          <Suspense fallback={tabFallback}>
            <DirectorTraining
              profile={overview?.profile ?? null}
              loading={overviewLoading && !overview}
              onSaved={(profile) => setOverview((prev) => (prev ? { ...prev, profile } : prev))}
            />
          </Suspense>
        </div>
      ) : activeTab === "connectors" ? (
        <div
          id="director-panel-connectors"
          role="tabpanel"
          className="flex-1 min-h-0 overflow-y-auto"
        >
          <Suspense fallback={tabFallback}>
            <DirectorConnectors
              connectors={overview?.connectors ?? null}
              loading={overviewLoading && !overview}
            />
          </Suspense>
        </div>
      ) : activeTab === "memory" ? (
        <div id="director-panel-memory" role="tabpanel" className="flex-1 min-h-0 overflow-y-auto">
          <Suspense fallback={tabFallback}>
            <DirectorMemory
              fleet={overview?.fleet ?? []}
              stats={overview?.stats ?? null}
              profile={overview?.profile ?? null}
              recentCalls={overview?.recentCalls ?? []}
              messageCount={overview?.messageCount ?? messages.length}
              loading={overviewLoading && !overview}
              onClearMemory={clearThread}
              onOpenTraining={() => setActiveTab("training")}
            />
          </Suspense>
        </div>
      ) : (
        <div id="director-panel-chat" role="tabpanel" className="contents">
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
                  I&apos;m your always-on manager. Tell me about your business and I&apos;ll help
                  you hire the right agents, coach them, and read the room across every call. Ask me
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
                <button
                  onClick={() => setActiveTab("training")}
                  className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-brand hover:text-brand/80 transition-colors"
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  Or tell me about your business first
                </button>
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
                    {m.delegations && m.delegations.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {m.delegations.map((d, i) => {
                          const key = `${m.id}:${i}`;
                          const Icon = DELEGATION_ICON[d.channel];
                          return (
                            <ProposalCard
                              key={key}
                              icon={<Icon className="w-3.5 h-3.5" />}
                              tone="amber"
                              title={d.label}
                              detail={`Hand to ${d.agentName} · ${d.draft}`}
                              state={dismissedDelegations[key] ? "dismissed" : undefined}
                              busy={false}
                              approveLabel={`Open ${d.agentName}`}
                              onApprove={() => handDelegation(d)}
                              onDismiss={() =>
                                setDismissedDelegations((prev) => ({ ...prev, [key]: true }))
                              }
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {isSending && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex justify-start"
              >
                <div className="glass border border-brand/20 rounded-2xl rounded-bl-md px-3.5 py-2.5 space-y-1">
                  <div className="flex items-center gap-2 text-[12px] text-ink/80">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/60" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
                    </span>
                    <span className="font-medium">Director is thinking…</span>
                  </div>
                  <p className="text-[10px] text-muted/70 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Analyzing your fleet &amp; formulating strategy
                  </p>
                </div>
              </motion.div>
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
      )}
    </div>
  );
}
