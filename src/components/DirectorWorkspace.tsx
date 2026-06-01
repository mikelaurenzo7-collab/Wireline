/**
 * DirectorWorkspace — the account-level "manager" chat surface.
 *
 * Redesigned to be the main show — Claude-style:
 * - Massive chat area with spacious message bubbles
 * - Prominent composer at bottom, centered, always visible
 * - Capability toggles as clever dropdown menus near composer
 * - Agent reasoning displayed prominently with lots of breathing room
 *
 * The Director sits ABOVE the individual agents: it's always available (even
 * before the operator owns a single agent) and acts as the strategist that
 * helps plan the fleet, decide what agents to hire, and coach them.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
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
  ChevronDown,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { useAgents } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";
import { ShadButton } from "./ui/shadcn/ShadButton";

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

interface DirectorApproval {
  callId: string;
  name: "generate_logo" | "vectorize_logo" | "brand_pack_export";
  label: string;
  requiresApproval: boolean;
  approved?: boolean;
  input: Record<string, unknown>;
}

interface DirectorPreview {
  conceptId: string;
  title: string;
  rationale: string;
  previewDataUrl: string;
  svg?: string;
}

interface DirectorArtifact {
  id: string;
  name: string;
  toolName: string;
  artifactType: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
  downloadUrl: string;
}

interface DirectorMessage {
  id: string;
  role: "operator" | "director";
  content: string;
  createdAt: string;
  suggestions?: DirectorSuggestion[];
  approvals?: DirectorApproval[];
  previews?: DirectorPreview[];
  reasoning?: string;
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

const DIRECTOR_CAPABILITIES = [
  { icon: Compass, label: "Plan", prompt: "Help me plan my agent fleet." },
  { icon: Plus, label: "Hire", prompt: "What kind of agent should I hire next?" },
  {
    icon: GraduationCap,
    label: "Coach",
    prompt: "Coach me on improving my agents' performance.",
  },
  { icon: BarChart3, label: "Analyze", prompt: "Analyze my fleet's recent performance." },
] as const;

export default function DirectorWorkspace() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { agents } = useAgents();
  const { error: toastError, success: toastSuccess } = useToast();
  const [messages, setMessages] = useState<DirectorMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [capabilityOpen, setCapabilityOpen] = useState(false);
  const [artifacts, setArtifacts] = useState<DirectorArtifact[]>([]);
  const [featureFlags, setFeatureFlags] = useState({
    toolExecution: true,
    creativeTools: true,
    artifactsPanel: true,
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const capabilityRef = useRef<HTMLDivElement | null>(null);

  const loadMessages = useCallback(async () => {
    if (authLoading) return;
    if (!user) {
      setMessages([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const r = await authFetch("/api/director/messages");
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        throw new Error("Failed to load messages");
      }
      const data = await r.json();
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      setArtifacts(Array.isArray(data.artifacts) ? data.artifacts : []);
      if (data.featureFlags && typeof data.featureFlags === "object") {
        setFeatureFlags({
          toolExecution: data.featureFlags.toolExecution !== false,
          creativeTools: data.featureFlags.creativeTools !== false,
          artifactsPanel: data.featureFlags.artifactsPanel !== false,
        });
      }
    } catch {
      toastError("Couldn't load the Director", "Check connection and refresh");
    } finally {
      setIsLoading(false);
    }
  }, [authLoading, toastError, user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setMessages([]);
      return;
    }
    loadMessages();
  }, [authLoading, loadMessages, user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (capabilityRef.current && !capabilityRef.current.contains(e.target as Node)) {
        setCapabilityOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    async (text: string, opts?: { approval?: DirectorApproval }) => {
      const trimmed = text.trim();
      if ((!trimmed && !opts?.approval) || isSending) return;
      const optimistic: DirectorMessage | null = trimmed
        ? {
            id: `tmp-${Date.now()}`,
            role: "operator",
            content: trimmed,
            createdAt: new Date().toISOString(),
          }
        : null;
      if (optimistic) setMessages((prev) => [...prev, optimistic]);
      if (trimmed) setInput("");
      setIsSending(true);
      setCapabilityOpen(false);
      try {
        const r = await authFetch("/api/director/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed, approval: opts?.approval }),
        });
        if (!r.ok) throw new Error("Send failed");
        const data = await r.json();
        const reply: DirectorMessage = {
          id: `director-${Date.now()}`,
          role: "director",
          content: data.reply || "(empty reply)",
          createdAt: new Date().toISOString(),
          suggestions: Array.isArray(data.suggestions) ? data.suggestions : undefined,
          approvals: Array.isArray(data.approvals) ? data.approvals : undefined,
          previews: Array.isArray(data.previews) ? data.previews : undefined,
          reasoning: data.reasoning,
        };
        setMessages((prev) => [...prev, reply]);
        if (Array.isArray(data.artifacts)) setArtifacts(data.artifacts);
      } catch {
        if (optimistic) setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        if (trimmed) setInput(trimmed);
        toastError("Couldn't send", "Try again in a moment");
      } finally {
        setIsSending(false);
        inputRef.current?.focus();
      }
    },
    [isSending, toastError],
  );

  const clearThread = useCallback(async () => {
    if (!confirm("Clear your entire conversation with the Director?")) return;
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

  const selectCapability = (prompt: string) => {
    setInput(prompt);
    setCapabilityOpen(false);
    inputRef.current?.focus();
  };

  const respondToApproval = (approval: DirectorApproval, approved: boolean) => {
    send("", {
      approval: {
        ...approval,
        approved,
      },
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-transparent">
      {/* Minimal header - just identity */}
      {messages.length > 0 && (
        <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-brand/8">
          <div className="flex items-center gap-2.5">
            <span className="shrink-0 flex w-8 h-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/20 relative overflow-hidden">
              <Sparkles className="w-4 h-4 relative z-10" />
              <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-ink leading-tight">Director</p>
              <p className="text-[10px] text-muted leading-tight">Always-on fleet manager</p>
            </div>
          </div>
          <button
            onClick={clearThread}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.18em] text-muted hover:text-rose-600 hover:bg-rose-500/8 transition-colors cursor-pointer"
            aria-label="Clear thread"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      )}

      {/* Messages - expansive chat area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-8 space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand/20 to-brand/10 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-brand" />
            </div>
            <p className="text-[11px] text-muted uppercase tracking-[0.2em]">Loading thread</p>
          </div>
        ) : messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center pt-8 pb-4 max-w-lg mx-auto"
          >
            {/* Hero identity */}
            <div className="relative mb-6">
              <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-brand/20 to-brand/5 blur-2xl scale-125" />
              <span className="flex w-16 h-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-xl shadow-brand/30 relative overflow-hidden">
                <Sparkles className="w-8 h-8 relative z-10" />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/25 to-transparent" />
              </span>
            </div>

            {agents.length > 0 ? (
              <p className="text-[12px] text-muted mb-4">
                {agents.length} agent{agents.length === 1 ? "" : "s"} active — ask me anything about
                your fleet.
              </p>
            ) : (
              <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
                {DIRECTOR_CAPABILITIES.map((c, i) => (
                  <React.Fragment key={c.label}>
                    {i > 0 && <span className="w-0.5 h-0.5 rounded-full bg-brand/25" />}
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-brand/70">
                      <c.icon className="w-3 h-3" />
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] font-semibold">
                        {c.label}
                      </span>
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Starter prompts */}
            <div className="flex flex-wrap justify-center gap-2 w-full">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="group inline-flex items-center gap-2 text-left text-[11px] text-ink/80 rounded-full border border-brand/15 bg-white/50 dark:bg-black/10 px-3 py-2 hover:border-brand/35 hover:bg-white/70 dark:hover:bg-black/20 transition-all cursor-pointer"
                >
                  <span className="min-w-0">{p}</span>
                  <ArrowUpRight className="w-3 h-3 shrink-0 text-brand/50 group-hover:text-brand transition-colors" />
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className={cn("flex flex-col", m.role === "operator" ? "items-end" : "items-start")}
            >
              {/* Director avatar for assistant */}
              {m.role === "director" && (
                <div className="flex items-center gap-2 mb-2 ml-1">
                  <span className="shrink-0 flex w-7 h-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/15">
                    <Sparkles className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-[10px] text-muted uppercase tracking-[0.14em] font-medium">
                    Director
                  </span>
                </div>
              )}

              {/* Message bubble */}
              <div
                className={cn(
                  "max-w-[75%] min-w-[200px] rounded-2xl px-5 py-4 whitespace-pre-wrap break-words relative",
                  m.role === "operator"
                    ? "bg-gradient-to-br from-[#8B3FD6] to-[#5A2499] text-white rounded-br-md shadow-lg shadow-brand/20"
                    : "bg-white/80 dark:bg-[#1a1225]/60 backdrop-blur-sm border border-brand/12 text-ink dark:text-foreground rounded-bl-md shadow-sm",
                )}
              >
                {/* Reasoning display - Claude style */}
                {m.role === "director" && m.reasoning && (
                  <div className="mb-3 pb-3 border-b border-brand/10">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sparkles className="w-3 h-3 text-brand/60" />
                      <span className="text-[9px] uppercase tracking-[0.16em] text-brand/60 font-medium">
                        Reasoning
                      </span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed italic">{m.reasoning}</p>
                  </div>
                )}

                <p className="text-[14px] leading-relaxed">{m.content}</p>

                {/* Timestamp */}
                {m.createdAt && (
                  <div className="mt-2 pt-1 border-t border-black/5 flex justify-end">
                    <time
                      dateTime={m.createdAt}
                      className={cn(
                        "text-[9px] font-mono tabular-nums",
                        m.role === "operator" ? "text-white/50" : "text-muted/50",
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

              {/* Suggestions */}
              {m.suggestions && m.suggestions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 ml-1">
                  {m.suggestions.map((s, i) => {
                    const Icon = SUGGESTION_ICON[s.kind];
                    return (
                      <button
                        key={`${s.kind}-${i}`}
                        onClick={() => runSuggestion(s)}
                        className="group inline-flex items-center gap-1.5 text-[11px] font-medium text-brand rounded-full border border-brand/20 bg-brand/[0.04] px-3 py-1.5 hover:bg-brand/10 hover:border-brand/40 hover:-translate-y-px active:scale-95 transition-all duration-300 cursor-pointer"
                      >
                        <Icon className="w-3 h-3" />
                        {s.label}
                        <ArrowUpRight className="w-2.5 h-2.5 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200" />
                      </button>
                    );
                  })}
                </div>
              )}

              {m.approvals && m.approvals.length > 0 && (
                <div className="mt-3 ml-1 space-y-2 w-full max-w-[560px]">
                  {m.approvals.map((a) => (
                    <div
                      key={a.callId}
                      className="rounded-[12px] border border-brand/20 bg-brand/[0.04] px-3 py-2"
                    >
                      <p className="text-[11px] text-muted mb-2">{a.label}</p>
                      <div className="flex items-center gap-2">
                        <ShadButton
                          onClick={() => respondToApproval(a, true)}
                          className="px-3 py-1.5 rounded-[10px] text-[11px] font-semibold bg-brand text-white"
                          disabled={isSending}
                        >
                          Approve
                        </ShadButton>
                        <ShadButton
                          onClick={() => respondToApproval(a, false)}
                          className="px-3 py-1.5 rounded-[10px] text-[11px] font-semibold border border-brand/20 text-muted"
                          disabled={isSending}
                        >
                          Decline
                        </ShadButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {m.previews && m.previews.length > 0 && (
                <div className="mt-3 ml-1 grid gap-2 sm:grid-cols-2 w-full max-w-[680px]">
                  {m.previews.map((p) => (
                    <div
                      key={p.conceptId}
                      className="rounded-[12px] border border-brand/15 bg-white/75 dark:bg-black/10 p-2 space-y-2"
                    >
                      <img
                        src={p.previewDataUrl}
                        alt={p.title}
                        className="w-full rounded-[10px] border border-brand/10 bg-white"
                      />
                      <div>
                        <p className="text-[11px] font-semibold text-ink">{p.title}</p>
                        <p className="text-[10px] text-muted line-clamp-2">{p.rationale}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {p.svg && (
                          <ShadButton
                            onClick={() =>
                              respondToApproval(
                                {
                                  callId: `vectorize-${p.conceptId}`,
                                  name: "vectorize_logo",
                                  label: "Vectorize concept",
                                  requiresApproval: true,
                                  input: { concept_id: p.conceptId, svg: p.svg },
                                },
                                true,
                              )
                            }
                            className="px-2 py-1 rounded-[8px] text-[10px] border border-brand/20"
                          >
                            Vectorize
                          </ShadButton>
                        )}
                        {p.svg && (
                          <ShadButton
                            onClick={() =>
                              respondToApproval(
                                {
                                  callId: `pack-${p.conceptId}`,
                                  name: "brand_pack_export",
                                  label: "Export brand pack",
                                  requiresApproval: true,
                                  input: {
                                    concept_id: p.conceptId,
                                    concept_name: p.title,
                                    svg: p.svg,
                                  },
                                },
                                true,
                              )
                            }
                            className="px-2 py-1 rounded-[8px] text-[10px] border border-brand/20"
                          >
                            Export pack
                          </ShadButton>
                        )}
                        <ShadButton
                          onClick={() =>
                            setInput(
                              `Refine concept ${p.title}: keep the core shape but adjust typography.`,
                            )
                          }
                          className="px-2 py-1 rounded-[8px] text-[10px] border border-brand/20"
                        >
                          Edit
                        </ShadButton>
                        <ShadButton
                          onClick={() =>
                            setInput(
                              `Regenerate 3 new options from ${p.title} with stronger contrast.`,
                            )
                          }
                          className="px-2 py-1 rounded-[8px] text-[10px] border border-brand/20"
                        >
                          Regenerate
                        </ShadButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))
        )}

        {/* Thinking indicator */}
        {isSending && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-start"
          >
            <div className="flex items-center gap-2 mb-2 ml-1">
              <span className="shrink-0 flex w-7 h-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/15">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              <span className="text-[10px] text-muted uppercase tracking-[0.14em] font-medium">
                Director
              </span>
            </div>
            <div className="bg-white/80 dark:bg-[#1a1225]/60 backdrop-blur-sm border border-brand/12 rounded-2xl rounded-bl-md px-5 py-4 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
                </span>
                <span className="text-[12px] text-muted font-medium">Thinking…</span>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {featureFlags.artifactsPanel && artifacts.length > 0 && (
        <div className="shrink-0 px-4 pb-2">
          <div className="max-w-3xl mx-auto rounded-[12px] border border-brand/15 bg-white/75 dark:bg-black/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Artifacts</p>
              <p className="text-[10px] text-muted">{artifacts.length} files</p>
            </div>
            <div className="grid gap-2 max-h-36 overflow-auto">
              {artifacts.slice(0, 20).map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 rounded-[10px] border border-brand/10 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-ink truncate">{a.name}</p>
                    <p className="text-[10px] text-muted">
                      {a.artifactType} · v{Number(a.metadata?.version || 1)} ·{" "}
                      {(a.sizeBytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={a.downloadUrl}
                      className="px-2.5 py-1.5 rounded-[8px] text-[10px] border border-brand/20"
                    >
                      Download
                    </a>
                    <ShadButton
                      onClick={() =>
                        setInput(
                          `Regenerate ${a.name} with a fresh variation and keep brand style.`,
                        )
                      }
                      className="px-2.5 py-1.5 rounded-[8px] text-[10px] border border-brand/20"
                    >
                      Regenerate
                    </ShadButton>
                    <ShadButton
                      onClick={() =>
                        setInput(`Edit ${a.name}: keep layout but adjust color contrast.`)
                      }
                      className="px-2.5 py-1.5 rounded-[8px] text-[10px] border border-brand/20"
                    >
                      Edit
                    </ShadButton>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Composer - prominent at bottom, Claude-style */}
      <div className="shrink-0 px-4 pb-6 pt-2">
        <div className="max-w-3xl mx-auto">
          {/* Capability dropdown - clever positioning */}
          <div ref={capabilityRef} className="relative mb-2">
            <AnimatePresence>
              {capabilityOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-white/95 dark:bg-[#1a1225]/95 backdrop-blur-md border border-brand/15 shadow-xl shadow-brand/10 p-2 z-20"
                >
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-brand/8 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-brand/60" />
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted font-medium">
                      Quick Actions
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {DIRECTOR_CAPABILITIES.map((c) => (
                      <button
                        key={c.label}
                        onClick={() => selectCapability(c.prompt)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-left hover:bg-brand/8 transition-colors cursor-pointer"
                      >
                        <span className="w-7 h-7 rounded-lg bg-brand/10 flex items-center justify-center">
                          <c.icon className="w-3.5 h-3.5 text-brand" />
                        </span>
                        <div>
                          <p className="text-[12px] font-medium text-ink">{c.label}</p>
                          <p className="text-[10px] text-muted line-clamp-1">{c.prompt}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Main composer */}
          <div className="relative rounded-2xl border border-brand/20 bg-white/90 dark:bg-[#1a1225]/80 backdrop-blur-md shadow-lg shadow-brand/5 transition-all duration-300 focus-within:border-brand/40 focus-within:shadow-xl focus-within:shadow-brand/10">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={3}
              placeholder="Message Director…"
              className="w-full resize-none bg-transparent text-[14px] text-ink dark:text-foreground placeholder:text-muted/50 outline-none px-5 py-4 leading-relaxed"
            />

            {/* Bottom bar with actions */}
            <div className="flex items-center justify-between px-4 pb-3">
              {/* Left side - capability toggle */}
              <button
                type="button"
                onClick={() => setCapabilityOpen(!capabilityOpen)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer",
                  capabilityOpen
                    ? "bg-brand/10 text-brand border border-brand/30"
                    : "text-muted hover:text-brand hover:bg-brand/5 border border-transparent",
                )}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Quick Actions</span>
                <ChevronDown
                  className={cn("w-3 h-3 transition-transform", capabilityOpen && "rotate-180")}
                />
              </button>

              {/* Right side - send */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || isSending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-brand to-brand-deep text-on-brand text-[12px] font-semibold shadow-md shadow-brand/25 disabled:opacity-40 disabled:shadow-none enabled:hover:shadow-lg enabled:hover:shadow-brand/30 enabled:active:scale-95 transition-all duration-200 cursor-pointer"
                  aria-label="Send message"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Send</span>
                </button>
              </div>
            </div>
          </div>

          {/* Subtle hint */}
          <p className="text-center text-[9px] text-muted/60 mt-2 uppercase tracking-[0.12em]">
            Press Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
    </div>
  );
}
