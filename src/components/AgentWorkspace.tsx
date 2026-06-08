/**
 * AgentWorkspace — legacy per-agent chat surface.
 *
 * @deprecated Use `/chat` with Director Coach mode (`?agent=<id>`). Kept for
 * internal/founder tooling until fully removed.
 *
 * Redesigned Claude-style:
 * - Massive chat area with spacious message bubbles
 * - Prominent composer at bottom, always visible
 * - Tools/Connectors as clever dropdown menus near composer
 * - Tab switching via pill toggles, not a slide-up panel
 * - Agent reasoning displayed prominently
 *
 * Each agent has its own workspace with four verb tabs:
 *   - Chat       — coach/direct the agent; persistent thread (the memory)
 *   - Training   — teach it: knowledge, voice, pronunciation, flow, test calls
 *   - Connectors — wire it to the world: capabilities + integrations
 *   - Memory     — what it carries between calls (thread + recall + lessons)
 */
import React, { useEffect, useRef, useState, useCallback, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { asStyle } from "@/src/lib/css-style";
import {
  Send,
  Loader2,
  Trash2,
  MessageSquare,
  MessagesSquare,
  Paperclip,
  Check,
  X,
  SlidersHorizontal,
  Power,
  Mail,
  Phone,
  MessageCircle,
  Plug,
  GraduationCap,
  Brain,
  FileText,
  ArrowUpRight,
  ChevronDown,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";
import {
  AGENT_WORKSPACE_STARTER_PROMPTS,
  WL_DIRECTOR_CLASSES,
} from "../lib/wireline-director-design";
import { ThinkingDisplay, LiveThinkingIndicator } from "./ui/ThinkingDisplay";
import { LiveTaskPipeline, type PipelineStep } from "./ui/LiveTaskPipeline";
import { Skeleton } from "./ui/shadcn/Skeleton";
import { Checkbox } from "./ui/shadcn/Checkbox";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";
import { EmptyState } from "./ui/EmptyState";
import { AgentActivityIndicator } from "./ui/AgentActivityIndicator";
import { useStreamingChat } from "../hooks/useStreamingChat";

const AgentTrainingInline = lazy(() => import("./AgentTraining"));
const AgentConnectorsInline = lazy(() => import("./AgentActionEngine"));
const AgentMemoryPanel = lazy(() => import("./AgentMemoryPanel"));

type WorkspaceTab = "chat" | "training" | "connectors" | "memory";

const WORKSPACE_TABS: {
  id: WorkspaceTab;
  label: string;
  icon: typeof MessageSquare;
  help: string;
}[] = [
  { id: "chat", label: "Chat", icon: MessagesSquare, help: "Coach and direct this agent" },
  {
    id: "training",
    label: "Training",
    icon: GraduationCap,
    help: "Knowledge, voice, flow & test calls",
  },
  { id: "connectors", label: "Connectors", icon: Plug, help: "Capabilities & integrations" },
  { id: "memory", label: "Memory", icon: Brain, help: "What this agent remembers" },
];

function isWorkspaceTab(v: string | null): v is WorkspaceTab {
  return v === "chat" || v === "training" || v === "connectors" || v === "memory";
}

const IS_TOUCH =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;
const IS_APPLE =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

interface ProposedChange {
  field: string;
  label: string;
  value: string;
  summary: string;
}
interface ProposedToolToggle {
  tool: string;
  enable: boolean;
  label: string;
  reason: string;
}
interface ProposedAction {
  kind: "send_email" | "send_text_message" | "make_call";
  label: string;
  to?: string;
  customerName?: string;
  subject?: string;
  body?: string;
  context?: string;
}
interface MessageProposals {
  changes: ProposedChange[];
  toolToggles: ProposedToolToggle[];
  actions: ProposedAction[];
}

interface WorkspaceMessage {
  id: string;
  role: "operator" | "agent";
  content: string;
  createdAt: string;
  proposals?: MessageProposals;
  reasoning?: string;
  thinkingDurationMs?: number;
}

interface AgentWorkspaceProps {
  agentId: string;
  agentName?: string;
  onToolsChange?: (tools: string[]) => void;
  composerSeed?: { text: string; nonce: number };
}

const TONE_CLASSES: Record<string, string> = {
  brand: "border-brand/25 bg-brand/[0.04]",
  success: "border-brand/25 bg-brand/[0.04]",
  caution: "border-rose-500/25 bg-rose-500/[0.04]",
};

const TONE_ICON_CLASSES: Record<string, string> = {
  brand: "bg-brand/10 text-brand",
  success: "bg-brand/10 text-brand",
  caution: "bg-rose-500/12 text-rose-600",
};

interface ProposalCardProps {
  icon: React.ReactNode;
  tone: "brand" | "success" | "caution";
  title: string;
  detail?: string;
  state?: "done" | "dismissed";
  busy: boolean;
  busyLabel?: string;
  approveLabel: string;
  consent?: { checked: boolean; onChange: (v: boolean) => void };
  onApprove: () => void;
  onDismiss: () => void;
}

function ProposalCard({
  icon,
  tone,
  title,
  detail,
  state,
  busy,
  busyLabel,
  approveLabel,
  consent,
  onApprove,
  onDismiss,
}: ProposalCardProps) {
  const approveDisabled = busy || (!!consent && !consent.checked);
  return (
    <motion.div
      layout
      whileHover={!state ? { scale: 1.01 } : {}}
      whileTap={!state ? { scale: 0.99 } : {}}
      animate={
        state ? { scale: 0.98, opacity: state === "dismissed" ? 0.5 : 1 } : { scale: 1, opacity: 1 }
      }
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "rounded-md border px-3 py-2.5 text-ink transition-all duration-200",
        state === "dismissed" ? "border-black/8 bg-black/3" : TONE_CLASSES[tone],
        !state && "hover:shadow-md cursor-default",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 shrink-0 flex w-6 h-6 items-center justify-center rounded-md",
            state === "dismissed" ? "bg-black/5 text-muted/60" : TONE_ICON_CLASSES[tone],
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium leading-snug">{title}</p>
          {detail && (
            <p className="mt-0.5 text-[11px] text-muted whitespace-pre-wrap break-words leading-relaxed">
              {detail}
            </p>
          )}
        </div>
      </div>
      {busy && (
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          className="mt-2 h-0.5 rounded-full bg-brand/20 overflow-hidden origin-left"
        >
          <motion.div
            className="h-full bg-brand rounded-full"
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            style={asStyle({ width: "40%" })}
          />
        </motion.div>
      )}
      {state ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "mt-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em]",
            state === "done" ? "text-brand" : "text-muted/70",
          )}
        >
          {state === "done" ? (
            <>
              <Check className="w-3 h-3" />
              <span>Successfully executed</span>
            </>
          ) : (
            <span>Dismissed</span>
          )}
        </motion.div>
      ) : (
        <>
          {consent && (
            <label className="mt-2.5 flex items-start gap-2 text-[11px] text-muted leading-snug cursor-pointer">
              <Checkbox
                checked={consent.checked}
                onChange={(e) => consent.onChange(e.target.checked)}
                className="mt-0.5 accent-brand"
              />
              <span>
                I confirm we have prior express written consent to call this number (TCPA).
              </span>
            </label>
          )}
          <div className="mt-2.5 flex items-center gap-2">
            <ShadButton
              type="button"
              variant="editorial"
              size="sm"
              disableAnimations
              onClick={onApprove}
              disabled={approveDisabled}
              className="rounded-md text-[11px]"
            >
              {busy ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {busyLabel || "Executing…"}
                </>
              ) : (
                <>
                  <Check className="w-3 h-3" />
                  {approveLabel}
                </>
              )}
            </ShadButton>
            <ShadButton
              type="button"
              variant="ghost"
              size="sm"
              disableAnimations
              onClick={onDismiss}
              disabled={busy}
              className="rounded-md text-[11px]"
            >
              <X className="w-3 h-3" />
              Dismiss
            </ShadButton>
          </div>
        </>
      )}
    </motion.div>
  );
}

export default function AgentWorkspace({
  agentId,
  agentName = "agent",
  onToolsChange,
  composerSeed,
}: AgentWorkspaceProps) {
  const { error: toastError, success: toastSuccess } = useToast();
  const isSharedView = !agentId || agentId === "default-agent";
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = isWorkspaceTab(tabParam) ? tabParam : "chat";
  const trainingSub = searchParams.get("sub") || undefined;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [resolved, setResolved] = useState<Record<string, "done" | "dismissed">>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [consentKeys, setConsentKeys] = useState<Record<string, boolean>>({});
  const toolsRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef<HTMLDivElement>(null);

  // Streaming chat integration
  const streamEndpoint = `/api/agents/${encodeURIComponent(agentId)}/workspace/messages/stream`;
  const {
    state: streamState,
    send: streamSend,
    reset: streamReset,
    isStreaming,
  } = useStreamingChat(streamEndpoint, {
    onComplete: (data) => {
      const proposals: MessageProposals = {
        changes: Array.isArray(data.changes) ? (data.changes as ProposedChange[]) : [],
        toolToggles: Array.isArray(data.toolToggles)
          ? (data.toolToggles as ProposedToolToggle[])
          : [],
        actions: Array.isArray(data.actions) ? (data.actions as ProposedAction[]) : [],
      };
      const hasProposals =
        proposals.changes.length > 0 ||
        proposals.toolToggles.length > 0 ||
        proposals.actions.length > 0;
      const agentReply: WorkspaceMessage = {
        id: `agent-${Date.now()}`,
        role: "agent",
        content: (data.reply as string) || "(empty reply)",
        createdAt: new Date().toISOString(),
        proposals: hasProposals ? proposals : undefined,
        reasoning: (data.reasoning as string) || undefined,
        thinkingDurationMs: (data.thinkingDurationMs as number) || undefined,
      };
      setMessages((prev) => [...prev, agentReply]);
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

  // Pipeline steps for live streaming state
  const streamPipeline: PipelineStep[] = (() => {
    if (!isStreaming && streamState.phase === "idle") return [];
    const steps: PipelineStep[] = [];
    const phase = streamState.phase;
    steps.push({
      id: "connect",
      label: "Connecting",
      status: phase === "connecting" ? "active" : "done",
    });
    if (phase === "thinking" || phase === "replying" || phase === "done") {
      steps.push({
        id: "thinking",
        label: streamState.isDeep ? "Deep reasoning" : "Thinking",
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

  const setActiveTab = useCallback(
    (next: WorkspaceTab) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === "chat") p.delete("tab");
          else p.set("tab", next);
          if (next !== "training") p.delete("sub");
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const setTrainingSub = useCallback(
    (sub: string) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set("tab", "training");
          if (sub === "database") p.delete("sub");
          else p.set("sub", sub);
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const loadMessages = useCallback(async () => {
    if (!agentId || isSharedView) return;
    setIsLoading(true);
    try {
      const r = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/messages`);
      if (!r.ok) throw new Error("Failed to load messages");
      const data = await r.json();
      setMessages(data.messages || []);
      if (Array.isArray(data.agent?.enabledTools)) setEnabledTools(data.agent.enabledTools);
    } catch {
      toastError("Couldn't load workspace", "Check connection and refresh");
    } finally {
      setIsLoading(false);
    }
  }, [agentId, toastError, isSharedView]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    onToolsChange?.(enabledTools);
  }, [enabledTools, onToolsChange]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setToolsOpen(false);
      }
      if (attachmentsRef.current && !attachmentsRef.current.contains(e.target as Node)) {
        setAttachmentsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const seedNonce = composerSeed?.nonce;
  useEffect(() => {
    if (seedNonce === undefined) return;
    const text = composerSeed?.text ?? "";
    setInput(text);
    const el = inputRef.current;
    if (el) {
      el.focus();
      const ph = text.indexOf("[");
      requestAnimationFrame(() => {
        if (ph >= 0) el.setSelectionRange(ph, text.indexOf("]", ph) + 1 || ph);
        else el.setSelectionRange(text.length, text.length);
      });
    }
  }, [seedNonce, composerSeed?.text]);

  const triggerCommand = useCallback(
    (text: string) => {
      if (!text || isSending) return;
      const optimisticOperator: WorkspaceMessage = {
        id: `tmp-${Date.now()}`,
        role: "operator",
        content: text,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticOperator]);
      setIsSending(true);
      setToolsOpen(false);
      setAttachmentsOpen(false);
      streamSend({ content: text });
    },
    [isSending, streamSend],
  );

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    triggerCommand(text);
    setInput("");
  }, [input, triggerCommand]);

  const clearThread = useCallback(async () => {
    if (!confirm("Clear this entire chat thread?")) return;
    try {
      const r = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/messages`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error("Clear failed");
      setMessages([]);
      toastSuccess("Thread cleared", "Fresh start with this agent");
    } catch {
      toastError("Couldn't clear thread");
    }
  }, [agentId, toastError, toastSuccess]);

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
      const buf = await file.arrayBuffer();
      const base64 = btoa(new Uint8Array(buf).reduce((acc, b) => acc + String.fromCharCode(b), ""));
      const r = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64: base64, fileName: file.name }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Upload failed");
      await loadMessages();
      toastSuccess(
        `Ingested ${data.inserted} item${data.inserted === 1 ? "" : "s"}`,
        `${agentName} will reference them on future calls`,
      );
    } catch (err) {
      toastError("Upload failed", err instanceof Error ? err.message : "Try again");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const markResolved = (key: string, state: "done" | "dismissed") =>
    setResolved((prev) => ({ ...prev, [key]: state }));

  const approveChange = useCallback(
    async (key: string, change: ProposedChange) => {
      setBusyKey(key);
      setBusyLabel("Applying configuration…");
      try {
        const r = await authFetch(
          `/api/agents/${encodeURIComponent(agentId)}/workspace/apply-change`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ field: change.field, value: change.value }),
          },
        );
        if (!r.ok) throw new Error("Apply failed");
        markResolved(key, "done");
        toastSuccess("Updated", `${change.label} saved`);
      } catch {
        toastError("Couldn't apply change", "Try again in a moment");
      } finally {
        setBusyKey(null);
      }
    },
    [agentId, toastSuccess, toastError],
  );

  const approveToggle = useCallback(
    async (key: string, toggle: ProposedToolToggle) => {
      setBusyKey(key);
      setBusyLabel(toggle.enable ? "Connecting capability…" : "Disconnecting…");
      try {
        const r = await authFetch(
          `/api/agents/${encodeURIComponent(agentId)}/workspace/toggle-tool`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tool: toggle.tool, enable: toggle.enable }),
          },
        );
        if (!r.ok) throw new Error("Toggle failed");
        const data = await r.json();
        if (Array.isArray(data.enabledTools)) setEnabledTools(data.enabledTools);
        markResolved(key, "done");
        toastSuccess(toggle.enable ? "Capability on" : "Capability off", toggle.label);
      } catch {
        toastError("Couldn't update capability", "Try again in a moment");
      } finally {
        setBusyKey(null);
      }
    },
    [agentId, toastSuccess, toastError],
  );

  const approveAction = useCallback(
    async (key: string, action: ProposedAction) => {
      setBusyKey(key);
      setBusyLabel(
        action.kind === "make_call"
          ? "Connecting call…"
          : action.kind === "send_text_message"
            ? "Sending text…"
            : "Sending email…",
      );
      try {
        if (action.kind === "make_call") {
          const r = await authFetch("/api/outbound/dial", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId,
              customerNumber: action.to,
              customerName: action.customerName,
              context: action.context || action.body,
              hasExpressWrittenConsent: !!consentKeys[key],
            }),
          });
          if (!r.ok) throw new Error("Call failed");
        } else {
          const r = await authFetch(
            `/api/agents/${encodeURIComponent(agentId)}/workspace/run-action`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kind: action.kind,
                to: action.to,
                subject: action.subject,
                body: action.body,
              }),
            },
          );
          if (!r.ok) throw new Error("Action failed");
        }
        markResolved(key, "done");
        toastSuccess("Sent", action.label);
      } catch {
        toastError("Couldn't run action", "Check details and try again");
      } finally {
        setBusyKey(null);
      }
    },
    [agentId, toastSuccess, toastError, consentKeys],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
  };

  if (isSharedView) {
    return (
      <div className="flex flex-col h-full min-h-0 items-center justify-center">
        <EmptyState
          icon={MessageSquare}
          eyebrow="Workspace"
          title="Select an agent above"
          description="Each agent has its own private workspace. Pick one from the rail to open its chat thread, training, connectors, and memory."
        />
      </div>
    );
  }

  const showChat = activeTab === "chat";
  const showTraining = activeTab === "training";
  const showConnectors = activeTab === "connectors";
  const showMemory = activeTab === "memory";

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Minimal header - identity + tabs inline */}
      <div className="shrink-0 border-b border-black/8">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="shrink-0 flex w-8 h-8 items-center justify-center rounded-md bg-gradient-to-br from-brand to-brand-deep text-on-brand text-[12px] font-semibold shadow-sm shadow-brand/25">
              {agentName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="text-[13px] font-semibold text-ink leading-tight">{agentName}</p>
              <p className="flex items-center gap-1.5 text-[10px] text-muted leading-tight">
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand" />
                </span>
                Your agent
              </p>
            </div>
          </div>

          {messages.length > 0 && (
            <ShadButton
              type="button"
              variant="ghost"
              size="sm"
              disableAnimations
              onClick={clearThread}
              className="shrink-0 rounded-md text-[10px] uppercase tracking-[0.18em] text-muted hover:text-rose-600 hover:bg-rose-500/8"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </ShadButton>
          )}
        </div>

        {/* Tab pills - horizontal scrollable */}
        <div className="flex items-center gap-1 px-4 pb-2 overflow-x-auto scrollbar-hide">
          {WORKSPACE_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <ShadButton
                key={tab.id}
                type="button"
                variant="ghost"
                size="sm"
                disableAnimations
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "shrink-0 rounded-md text-[11px] font-medium",
                  isActive
                    ? "bg-brand/10 text-brand border border-brand/30"
                    : "text-muted hover:text-ink hover:bg-black/5 border border-transparent",
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.id === "connectors" && enabledTools.length > 0 && (
                  <span className="text-[9px] text-muted/70">{enabledTools.length}</span>
                )}
              </ShadButton>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      {showChat && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 min-h-0 scroll-viewport px-4 py-6 space-y-5">
            {isLoading && messages.length === 0 ? (
              <div className="space-y-4 py-8">
                <div className="flex justify-end">
                  <Skeleton className="h-12 w-64 rounded-md bg-brand/10" />
                </div>
                <div className="flex justify-start">
                  <Skeleton className="h-24 w-full max-w-lg rounded-md" />
                </div>
              </div>
            ) : messages.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col items-center justify-center py-16 text-center"
              >
                {/* Hero avatar */}
                <div className="relative mb-5">
                  <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-brand/20 to-brand/5 blur-2xl scale-125" />
                  <span className="flex w-14 h-14 items-center justify-center rounded-md bg-gradient-to-br from-brand to-brand-deep text-on-brand text-xl font-semibold shadow-lg shadow-brand/25">
                    {agentName.slice(0, 1).toUpperCase()}
                  </span>
                </div>

                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-brand/70 mb-2">
                  Direct line
                </p>
                <h3 className="font-display italic text-2xl text-ink mb-2">
                  Chat with {agentName}
                </h3>
                <p className="text-[12px] text-muted leading-relaxed max-w-xs mb-5">
                  Coach it, give context, ask how calls went, or direct changes in plain language.
                </p>
                <div className="flex flex-wrap justify-center gap-2 max-w-sm">
                  {AGENT_WORKSPACE_STARTER_PROMPTS.map((p) => (
                    <ShadButton
                      key={p.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      disableAnimations
                      title={p.intent}
                      onClick={() => triggerCommand(p.label)}
                      disabled={isSending}
                      className={cn(
                        "touch-press group h-auto text-left text-[11px] text-ink/80 px-3 py-2 gap-2",
                        WL_DIRECTOR_CLASSES.starterChip,
                      )}
                    >
                      <span className="min-w-0">{p.label}</span>
                      <ArrowUpRight className="w-3 h-3 shrink-0 text-brand/50 group-hover:text-brand transition-colors" />
                    </ShadButton>
                  ))}
                </div>
              </motion.div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                      "flex flex-col",
                      m.role === "operator" ? "items-end" : "items-start",
                    )}
                  >
                    {/* Agent avatar */}
                    {m.role === "agent" && (
                      <div className="flex items-center gap-2 mb-2 ml-1">
                        <span className="shrink-0 flex w-7 h-7 items-center justify-center rounded-md bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/15 text-[10px] font-semibold">
                          {agentName.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="text-[10px] text-muted uppercase tracking-[0.14em] font-medium">
                          {agentName}
                        </span>
                      </div>
                    )}

                    {/* Message bubble */}
                    <div
                      className={cn(
                        "max-w-[78%] min-w-[180px] rounded-md px-5 py-4 whitespace-pre-wrap break-words relative",
                        m.role === "operator"
                          ? "bg-gradient-to-br from-brand to-brand-deep text-white rounded-br-sm shadow-lg shadow-brand/25"
                          : "bg-paper/95 dark:bg-black/40 backdrop-blur-sm border border-brand/10 text-ink dark:text-foreground rounded-bl-sm shadow-sm",
                      )}
                    >
                      {/* Reasoning - Claude style */}
                      {m.role === "agent" && m.reasoning && (
                        <ThinkingDisplay
                          reasoning={m.reasoning}
                          thinkingDurationMs={m.thinkingDurationMs}
                          isDeep={false}
                          animate={false}
                        />
                      )}

                      <p className="text-[14px] leading-relaxed">{m.content}</p>

                      {/* Proposals */}
                      {m.role === "agent" && m.proposals && (
                        <div className="mt-3 pt-3 border-t border-black/5 space-y-2">
                          {m.proposals.changes.map((c, i) => {
                            const key = `${m.id}:change:${i}`;
                            const state = resolved[key];
                            return (
                              <ProposalCard
                                key={key}
                                icon={<SlidersHorizontal className="w-3.5 h-3.5" />}
                                tone="brand"
                                title={c.label}
                                detail={c.summary || c.value}
                                state={state}
                                busy={busyKey === key}
                                busyLabel={busyKey === key ? busyLabel : undefined}
                                approveLabel="Apply"
                                onApprove={() => approveChange(key, c)}
                                onDismiss={() => markResolved(key, "dismissed")}
                              />
                            );
                          })}
                          {m.proposals.toolToggles.map((t, i) => {
                            const key = `${m.id}:toggle:${i}`;
                            const state = resolved[key];
                            return (
                              <ProposalCard
                                key={key}
                                icon={<Power className="w-3.5 h-3.5" />}
                                tone="success"
                                title={`${t.enable ? "Turn on" : "Turn off"} ${t.label}`}
                                detail={t.reason}
                                state={state}
                                busy={busyKey === key}
                                busyLabel={busyKey === key ? busyLabel : undefined}
                                approveLabel={t.enable ? "Enable" : "Disable"}
                                onApprove={() => approveToggle(key, t)}
                                onDismiss={() => markResolved(key, "dismissed")}
                              />
                            );
                          })}
                          {m.proposals.actions.map((a, i) => {
                            const key = `${m.id}:action:${i}`;
                            const state = resolved[key];
                            const aIcon =
                              a.kind === "make_call" ? (
                                <Phone className="w-3.5 h-3.5" />
                              ) : a.kind === "send_text_message" ? (
                                <MessageCircle className="w-3.5 h-3.5" />
                              ) : (
                                <Mail className="w-3.5 h-3.5" />
                              );
                            const detail = [
                              a.to
                                ? `To: ${a.customerName ? `${a.customerName} · ` : ""}${a.to}`
                                : "",
                              a.subject ? `Subject: ${a.subject}` : "",
                              a.body || a.context || "",
                            ]
                              .filter(Boolean)
                              .join("\n");
                            return (
                              <ProposalCard
                                key={key}
                                icon={aIcon}
                                tone="caution"
                                title={a.label}
                                detail={detail}
                                state={state}
                                busy={busyKey === key}
                                busyLabel={busyKey === key ? busyLabel : undefined}
                                approveLabel={a.kind === "make_call" ? "Call now" : "Send"}
                                consent={
                                  a.kind === "make_call"
                                    ? {
                                        checked: !!consentKeys[key],
                                        onChange: (v) =>
                                          setConsentKeys((prev) => ({ ...prev, [key]: v })),
                                      }
                                    : undefined
                                }
                                onApprove={() => approveAction(key, a)}
                                onDismiss={() => markResolved(key, "dismissed")}
                              />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}

                {/* Thinking indicator */}
                {isSending && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-start"
                  >
                    <div className="flex items-center gap-2 mb-2 ml-1">
                      <span className="shrink-0 flex w-7 h-7 items-center justify-center rounded-md bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/15 text-[10px] font-semibold">
                        {agentName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="text-[10px] text-muted uppercase tracking-[0.14em] font-medium">
                        {agentName}
                      </span>
                    </div>
                    <div className="bg-paper/90 dark:bg-velvet/60 backdrop-blur-sm border border-brand/12 rounded-md rounded-bl-md px-5 py-4 shadow-sm">
                      <div className="flex items-center gap-2.5 mb-2">
                        <AgentActivityIndicator active size={24} pose="on-call" />
                        <LiveThinkingIndicator isDeep={false} />
                      </div>

                      {/* SSE streaming pipeline */}
                      {streamPipeline.length > 0 && (
                        <div className="mb-2 border-b border-brand/8 pb-2">
                          <LiveTaskPipeline steps={streamPipeline} />
                        </div>
                      )}

                      {(streamState.phase === "thinking" || streamState.phase === "replying") &&
                        streamState.thinkingText && (
                          <div className="text-[11px] text-muted/70 leading-relaxed max-h-24 overflow-y-auto mb-2">
                            <p className="whitespace-pre-wrap line-clamp-6">
                              {streamState.thinkingText.slice(-600)}
                            </p>
                          </div>
                        )}

                      {streamState.phase === "replying" &&
                        typeof streamState.reply?.reply === "string" &&
                        streamState.reply.reply.trim() && (
                          <div className="text-[12px] text-ink/85 leading-relaxed max-h-28 overflow-y-auto border-t border-brand/8 pt-2 mt-1">
                            <p className="whitespace-pre-wrap line-clamp-8">
                              {streamState.reply.reply.slice(-800)}
                            </p>
                          </div>
                        )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            )}
          </div>

          {/* Tools dropdown - Claude-style */}
          <div ref={toolsRef} className="shrink-0 px-4 pb-2 relative">
            <AnimatePresence>
              {toolsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full left-4 right-4 mb-2 rounded-md bg-popover text-popover-foreground backdrop-blur-md border border-border shadow-2xl p-3 z-20"
                >
                  <div className="flex items-center gap-2 px-2 py-2 border-b border-border mb-2">
                    <Plug className="w-3.5 h-3.5 text-brand" />
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                      {enabledTools.length > 0
                        ? `${enabledTools.length} Active Tools`
                        : "No Tools Active"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {enabledTools.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground px-2 py-2">
                        No tools enabled yet. The agent will use its default capabilities.
                      </p>
                    ) : (
                      enabledTools.map((tool) => (
                        <div
                          key={tool}
                          className="flex items-center gap-2 px-2 py-2 rounded-md bg-muted/40"
                        >
                          <span className="w-2 h-2 rounded-full bg-brand" />
                          <span className="text-[12px] text-foreground font-medium capitalize">
                            {tool.replace(/_/g, " ")}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-2 pt-2 border-t border-border">
                    <a
                      href="/integrations"
                      className="flex items-center gap-2 px-2 py-2 text-[11px] text-brand hover:text-brand/80 transition-colors"
                    >
                      <ArrowUpRight className="w-3 h-3" />
                      Manage integrations
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Composer - prominent at bottom */}
          <div className="shrink-0 px-4 pb-6 pt-2">
            <div className="relative rounded-md border border-brand/20 bg-paper/95 dark:bg-velvet/80 backdrop-blur-md shadow-lg shadow-brand/5 transition-all duration-300 focus-within:border-brand/40 focus-within:shadow-xl focus-within:shadow-brand/10">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={3}
                placeholder={
                  IS_TOUCH
                    ? `Message ${agentName}…`
                    : `Message ${agentName}…  (${IS_APPLE ? "⌘" : "Ctrl"}+Enter to send)`
                }
                disabled={isSending || isUploading}
                className="w-full resize-none bg-transparent text-[14px] text-ink dark:text-foreground placeholder:text-muted/50 outline-none px-5 py-4 leading-relaxed"
              />

              {/* Bottom bar */}
              <div className="flex items-center justify-between px-4 pb-3">
                <div className="flex items-center gap-2">
                  {/* Tools dropdown toggle */}
                  <ShadButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    disableAnimations
                    onClick={() => setToolsOpen(!toolsOpen)}
                    className={cn(
                      "rounded-md text-[11px] font-medium",
                      toolsOpen
                        ? "bg-brand/10 text-brand border border-brand/30"
                        : "text-ink/50 hover:text-brand hover:bg-brand/5 border border-transparent",
                    )}
                  >
                    <Plug className="w-3.5 h-3.5" />
                    <span>Tools</span>
                    {enabledTools.length > 0 && (
                      <span className="text-[9px] text-ink/40">({enabledTools.length})</span>
                    )}
                    <ChevronDown
                      className={cn("w-3 h-3 transition-transform", toolsOpen && "rotate-180")}
                    />
                  </ShadButton>

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
                    <ShadButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disableAnimations
                      onClick={() => setAttachmentsOpen(!attachmentsOpen)}
                      disabled={isUploading || isSending}
                      className={cn(
                        "rounded-md text-[11px] font-medium",
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
                    </ShadButton>

                    <AnimatePresence>
                      {attachmentsOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                          className="absolute bottom-full left-0 mb-2 w-48 rounded-md bg-popover text-popover-foreground backdrop-blur-md border border-border shadow-2xl p-1 z-20"
                        >
                          <ShadButton
                            type="button"
                            variant="ghost"
                            disableAnimations
                            onClick={() => {
                              setAttachmentsOpen(false);
                              fileInputRef.current?.click();
                            }}
                            className="w-full h-auto justify-start gap-2 px-3 py-2 rounded-md hover:bg-muted/50"
                          >
                            <FileText className="w-4 h-4 text-brand" />
                            <div className="text-left">
                              <span className="block text-[11px] font-semibold text-foreground">
                                Document
                              </span>
                              <span className="block text-[9px] text-muted-foreground">
                                PDFs & files
                              </span>
                            </div>
                          </ShadButton>

                          <ShadButton
                            type="button"
                            variant="ghost"
                            disableAnimations
                            onClick={() => {
                              setAttachmentsOpen(false);
                              toastSuccess("Added to memory", "Memory panel updated with new fact");
                            }}
                            className="w-full h-auto justify-start gap-2 px-3 py-2 rounded-md hover:bg-muted/50"
                          >
                            <Brain className="w-4 h-4 text-brand" />
                            <div className="text-left">
                              <span className="block text-[11px] font-semibold text-foreground">
                                Memory
                              </span>
                              <span className="block text-[9px] text-muted">
                                Add a fact or preference
                              </span>
                            </div>
                          </ShadButton>

                          <ShadButton
                            type="button"
                            variant="ghost"
                            disableAnimations
                            onClick={() => {
                              setAttachmentsOpen(false);
                              toastSuccess("Skill learned", "New instruction added to prompt");
                            }}
                            className="w-full h-auto justify-start gap-2 px-3 py-2 rounded-md hover:bg-black/5 dark:hover:bg-white/5"
                          >
                            <GraduationCap className="w-4 h-4 text-brand/70" />
                            <div className="text-left">
                              <span className="block text-[11px] font-medium text-ink dark:text-white">
                                Instruction
                              </span>
                              <span className="block text-[9px] text-muted">
                                Add a skill to the prompt
                              </span>
                            </div>
                          </ShadButton>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <ShadButton
                  type="button"
                  variant="editorial"
                  disableAnimations
                  onClick={send}
                  disabled={!input.trim() || isSending || isUploading}
                  aria-label="Send message"
                  className="rounded-md text-[12px] font-semibold"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Send</span>
                </ShadButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Training tab */}
      {showTraining && (
        <div className="flex-1 min-h-0 scroll-viewport">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12 text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            }
          >
            <AgentTrainingInline
              embeddedAgentId={agentId}
              initialSubTab={trainingSub}
              onSubTabChange={setTrainingSub}
            />
          </Suspense>
        </div>
      )}

      {/* Connectors tab */}
      {showConnectors && (
        <div className="flex-1 min-h-0 scroll-viewport">
          <div className="px-4 pt-3">
            <a
              href="/integrations"
              className="inline-flex items-center gap-1.5 text-[11px] text-brand hover:text-brand/80 transition-colors"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Manage email & calendar connections
            </a>
          </div>
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12 text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            }
          >
            <AgentConnectorsInline agentId={agentId} />
          </Suspense>
        </div>
      )}

      {/* Memory tab */}
      {showMemory && (
        <div className="flex-1 min-h-0 scroll-viewport">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-12 text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            }
          >
            <AgentMemoryPanel
              agentId={agentId}
              agentName={agentName}
              messageCount={messages.length}
              onClearMemory={clearThread}
              onOpenTraining={() => setActiveTab("training")}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
