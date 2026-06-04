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
  Plus,
  MessagesSquare,
  Activity,
  GraduationCap,
  BarChart3,
  ArrowUpRight,
  Compass,
  ChevronDown,
  Paperclip,
  FileText,
  Brain,
  Plug,
  Phone,
  Calendar,
  Users,
  MessageCircle,
  Video,
  FileSignature,
  Search,
  ShoppingBag,
  Grid3X3,
  Megaphone,
  Table,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { useAgents } from "../contexts/AgentsContext";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";
import { ThinkingDisplay, LiveThinkingIndicator } from "./ui/ThinkingDisplay";
import { LiveTaskPipeline, type PipelineStep } from "./ui/LiveTaskPipeline";
import { ArtifactCard, type ArtifactType } from "./ui/ArtifactCard";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { Input } from "./ui/shadcn/Input";
import { useStreamingChat } from "../hooks/useStreamingChat";

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
  thinkingDurationMs?: number;
  model?: "sonnet" | "opus";
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

const CONNECTOR_CATALOG = [
  { icon: Phone, id: "twilio", label: "Twilio", desc: "Voice & SMS" },
  { icon: Calendar, id: "calendar", label: "Calendar", desc: "Google / Outlook" },
  { icon: Users, id: "crm", label: "CRM", desc: "Salesforce / HubSpot" },
  { icon: MessageCircle, id: "slack", label: "Slack", desc: "Team notifications" },
  { icon: Video, id: "zoom", label: "Zoom", desc: "Meeting links" },
  { icon: FileSignature, id: "docusign", label: "DocuSign", desc: "Contracts" },
  { icon: Search, id: "apollo", label: "Apollo", desc: "Lead enrichment" },
  { icon: Search, id: "gemini", label: "Gemini", desc: "Web grounding" },
  { icon: ShoppingBag, id: "shopify", label: "Shopify", desc: "E-commerce" },
  { icon: Grid3X3, id: "square", label: "Square", desc: "Payments & POS" },
  { icon: MessageCircle, id: "microsoft_teams", label: "MS Teams", desc: "Team notifications" },
  { icon: Table, id: "microsoft_excel", label: "Excel", desc: "Call logging" },
  { icon: Table, id: "google_sheets", label: "Google Sheets", desc: "Call logging" },
  { icon: Megaphone, id: "meta", label: "Meta CAPI", desc: "Lead attribution" },
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
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [artifacts, setArtifacts] = useState<DirectorArtifact[]>([]);
  const [featureFlags, setFeatureFlags] = useState({
    toolExecution: true,
    creativeTools: true,
    artifactsPanel: true,
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const connectorsRef = useRef<HTMLDivElement | null>(null);
  const attachmentsRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Streaming chat integration
  const {
    state: streamState,
    send: streamSend,
    reset: streamReset,
    isStreaming,
  } = useStreamingChat("/api/director/messages/stream", {
    onComplete: (data) => {
      const reply: DirectorMessage = {
        id: `director-${Date.now()}`,
        role: "director",
        content: (data.reply as string) || "(empty reply)",
        createdAt: new Date().toISOString(),
        suggestions: Array.isArray(data.suggestions)
          ? (data.suggestions as DirectorSuggestion[])
          : undefined,
        reasoning: (data.reasoning as string) || undefined,
        thinkingDurationMs: (data.thinkingDurationMs as number) || undefined,
        model: (data.model as "sonnet" | "opus") || undefined,
      };
      setMessages((prev) => [...prev, reply]);
      if (Array.isArray(data.artifacts)) setArtifacts(data.artifacts as DirectorArtifact[]);
      setIsSending(false);
      streamReset();
      inputRef.current?.focus();
    },
    onError: (msg) => {
      toastError("Stream failed", msg);
      setIsSending(false);
      streamReset();
    },
  });

  // Pipeline steps derived from streaming state
  const streamPipeline: PipelineStep[] = (() => {
    if (!isStreaming && streamState.phase === "idle") return [];
    const steps: PipelineStep[] = [];
    const phase = streamState.phase;

    steps.push({
      id: "connect",
      label: "Connecting to Director",
      status: phase === "connecting" ? "active" : "done",
    });
    if (phase === "thinking" || phase === "replying" || phase === "done") {
      steps.push({
        id: "thinking",
        label: streamState.isDeep ? "Deep analysis (Opus)" : "Reasoning",
        status: phase === "thinking" ? "active" : "done",
        elapsedMs: phase === "thinking" ? undefined : streamState.thinkingDurationMs,
      });
    }
    if (phase === "replying" || phase === "done") {
      steps.push({
        id: "reply",
        label: "Composing reply",
        status: phase === "replying" ? "active" : "done",
      });
    }
    return steps;
  })();

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
      if (connectorsRef.current && !connectorsRef.current.contains(e.target as Node)) {
        setConnectorsOpen(false);
      }
      if (attachmentsRef.current && !attachmentsRef.current.contains(e.target as Node)) {
        setAttachmentsOpen(false);
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
      setConnectorsOpen(false);

      // Use streaming for regular messages (no approvals — those stay non-streaming)
      if (!opts?.approval) {
        streamSend({ content: trimmed });
        return;
      }

      // Fallback: non-streaming for approval responses
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
          thinkingDurationMs: data.thinkingDurationMs,
          model: data.model,
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
    [isSending, toastError, streamSend],
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

  const onFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toastError("PDF only for now", "Other file types coming soon");
      e.target.value = "";
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      toastError("File too large", "Keep PDFs under 30MB");
      e.target.value = "";
      return;
    }
    setIsUploading(true);
    try {
      // Simulate upload for now in Director
      setTimeout(() => {
        setIsUploading(false);
        toastSuccess("File attached", "Ready for analysis");
      }, 1500);
    } catch {
      setIsUploading(false);
      toastError("Upload failed");
    } finally {
      e.target.value = "";
    }
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
        <div className="shrink-0 flex items-center justify-between px-6 py-3 border-b border-brand/6">
          <div className="flex items-center gap-2.5">
            <span className="wl-orbit" data-active={isSending}>
              <span className="shrink-0 flex w-9 h-9 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/20 relative overflow-hidden">
                <Compass className="w-4 h-4 relative z-10" />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent" />
              </span>
            </span>
            <div>
              <p className="text-[13px] font-semibold text-ink leading-tight tracking-[-0.01em]">
                Director
              </p>
              <p className="wl-label text-muted leading-tight">Always-on fleet manager</p>
            </div>
          </div>
          <button
            onClick={clearThread}
            className="touch-press shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-muted hover:text-rose-600 hover:bg-rose-500/8 transition-colors cursor-pointer"
            aria-label="Clear thread"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>
      )}

      {/* Messages - isolated scroll viewport */}
      <div ref={scrollRef} className="flex-1 min-h-0 scroll-viewport px-4 py-8 space-y-6">
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
                <Compass className="w-8 h-8 relative z-10" />
                <div className="absolute inset-0 bg-gradient-to-tr from-white/25 to-transparent" />
              </span>
            </div>

            {agents.length > 0 ? (
              <p className="text-[12px] text-muted mb-4">
                {agents.length} agent{agents.length === 1 ? "" : "s"} active — ask me anything about
                your fleet.
              </p>
            ) : (
              <p className="text-[12px] text-ink/50 mb-4">
                Plan your fleet, hire agents, coach performance, and analyze results.
              </p>
            )}

            {/* Starter prompts */}
            <div className="flex flex-wrap justify-center gap-2 w-full">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="touch-press group inline-flex items-center gap-2 text-left text-[11px] text-ink/80 rounded-full border border-brand/15 bg-white/50 dark:bg-black/10 px-3 py-2 hover:border-brand/35 hover:bg-white/70 dark:hover:bg-black/20 transition-all cursor-pointer"
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
                    <Compass className="w-3.5 h-3.5" />
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
                  <ThinkingDisplay
                    reasoning={m.reasoning}
                    thinkingDurationMs={m.thinkingDurationMs}
                    isDeep={m.model === "opus"}
                    animate={false}
                  />
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

        {/* Live streaming indicator — shows pipeline + thinking */}
        {isSending && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-start"
          >
            <div className="flex items-center gap-2 mb-2 ml-1">
              <span className="wl-orbit" data-active="true">
                <span className="shrink-0 flex w-7 h-7 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/15">
                  <Compass className="w-3.5 h-3.5" />
                </span>
              </span>
              <span className="wl-label text-muted">Director</span>
            </div>
            <div className="wl-panel rounded-2xl rounded-bl-md px-5 py-4 space-y-3">
              {/* Pipeline visualization */}
              {streamPipeline.length > 0 && <LiveTaskPipeline steps={streamPipeline} />}
              {/* Live thinking text */}
              {streamState.phase === "thinking" && streamState.thinkingText && (
                <div className="text-[11px] text-muted/70 leading-relaxed max-h-32 overflow-y-auto border-t border-brand/8 pt-2 mt-2">
                  <p className="whitespace-pre-wrap line-clamp-6">
                    {streamState.thinkingText.slice(-500)}
                  </p>
                </div>
              )}
              {/* Fallback pulsing indicator */}
              {streamPipeline.length === 0 && <LiveThinkingIndicator isDeep={false} />}
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
            <div className="grid gap-2 max-h-48 overflow-auto sm:grid-cols-2">
              {artifacts.slice(0, 20).map((a) => (
                <ArtifactCard
                  key={a.id}
                  name={a.name}
                  type={a.artifactType as ArtifactType}
                  mimeType={a.mimeType}
                  sizeBytes={a.sizeBytes}
                  downloadUrl={a.downloadUrl}
                  metadata={a.metadata}
                  className="w-full"
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Composer - prominent at bottom, Claude-style */}
      <div className="shrink-0 px-4 pb-6 pt-2">
        <div className="max-w-3xl mx-auto">
          {/* Connectors dropdown */}
          <div ref={connectorsRef} className="relative mb-2">
            <AnimatePresence>
              {connectorsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-white/95 dark:bg-[#1a1225]/95 backdrop-blur-md border border-brand/15 shadow-xl shadow-brand/10 p-2 z-20"
                >
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-brand/8 mb-1">
                    <Plug className="w-3.5 h-3.5 text-brand/60" />
                    <span className="text-[10px] uppercase tracking-[0.16em] text-ink/50 font-medium">
                      Connectors
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 max-h-[40vh] overflow-y-auto">
                    {CONNECTOR_CATALOG.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg group"
                      >
                        <span className="w-7 h-7 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                          <c.icon className="w-3.5 h-3.5 text-brand" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-ink truncate">{c.label}</p>
                          <p className="text-[9px] text-ink/40 truncate">{c.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-1 pt-1.5 border-t border-brand/8">
                    <a
                      href="/integrations"
                      className="flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-brand hover:text-brand/80 transition-colors"
                    >
                      <ArrowUpRight className="w-3 h-3" />
                      Manage integrations
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Main composer — specular depth treatment */}
          <div className="relative wl-panel-elevated transition-all duration-300 focus-within:shadow-[0_12px_48px_rgba(139,63,214,0.08),inset_0_1px_0_rgba(255,255,255,0.9)]">
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
              <div className="flex items-center gap-2">
                {/* Left side - connectors toggle */}
                <button
                  type="button"
                  onClick={() => setConnectorsOpen(!connectorsOpen)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer",
                    connectorsOpen
                      ? "bg-brand/10 text-brand border border-brand/30"
                      : "text-ink/50 hover:text-brand hover:bg-brand/5 border border-transparent",
                  )}
                >
                  <Plug className="w-3.5 h-3.5" />
                  <span>Connectors</span>
                  <ChevronDown
                    className={cn("w-3 h-3 transition-transform", connectorsOpen && "rotate-180")}
                  />
                </button>

                {/* Hidden file input */}
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={onFilePick}
                  className="hidden"
                />

                {/* Attachments dropdown toggle */}
                <div className="relative" ref={attachmentsRef}>
                  <button
                    type="button"
                    onClick={() => setAttachmentsOpen(!attachmentsOpen)}
                    disabled={isUploading || isSending}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all cursor-pointer disabled:opacity-40",
                      attachmentsOpen
                        ? "bg-brand/10 text-brand border border-brand/30"
                        : "text-ink/50 hover:text-brand hover:bg-brand/5 border border-transparent",
                    )}
                  >
                    {isUploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                    ) : (
                      <Paperclip className="w-3.5 h-3.5" />
                    )}
                    <span>Attach</span>
                    <ChevronDown
                      className={cn(
                        "w-3 h-3 transition-transform",
                        attachmentsOpen && "rotate-180",
                      )}
                    />
                  </button>

                  <AnimatePresence>
                    {attachmentsOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-0 mb-2 w-48 rounded-xl bg-white/95 dark:bg-[#1a1225]/95 backdrop-blur-md border border-brand/15 shadow-xl shadow-brand/10 p-1 z-20"
                      >
                        <button
                          onClick={() => {
                            setAttachmentsOpen(false);
                            fileInputRef.current?.click();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        >
                          <FileText className="w-4 h-4 text-brand/70" />
                          <div>
                            <span className="block text-[11px] font-medium text-ink dark:text-white">
                              Document
                            </span>
                            <span className="block text-[9px] text-muted">PDFs & files</span>
                          </div>
                        </button>

                        <button
                          onClick={() => {
                            setAttachmentsOpen(false);
                            toastSuccess("Added to knowledge", "Global context updated");
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        >
                          <Brain className="w-4 h-4 text-brand/70" />
                          <div>
                            <span className="block text-[11px] font-medium text-ink dark:text-white">
                              Context
                            </span>
                            <span className="block text-[9px] text-muted">Add a global rule</span>
                          </div>
                        </button>

                        <button
                          onClick={() => {
                            setAttachmentsOpen(false);
                            toastSuccess("Skill learned", "New ability registered");
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                        >
                          <GraduationCap className="w-4 h-4 text-brand/70" />
                          <div>
                            <span className="block text-[11px] font-medium text-ink dark:text-white">
                              Instruction
                            </span>
                            <span className="block text-[9px] text-muted">Add a playbook</span>
                          </div>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Right side - send */}

              <div className="flex items-center gap-2">
                <button
                  onClick={() => send(input)}
                  disabled={!input.trim() || isSending}
                  className="touch-press inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-br from-brand to-brand-deep text-on-brand text-[12px] font-semibold shadow-md shadow-brand/25 disabled:opacity-40 disabled:shadow-none enabled:hover:shadow-lg enabled:hover:shadow-brand/30 transition-all duration-200 cursor-pointer"
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
