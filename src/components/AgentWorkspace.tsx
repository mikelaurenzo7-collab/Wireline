/**
 * AgentWorkspace — the self-contained surface for one owned agent.
 *
 * Each agent has its own workspace with four tabs, one verb each:
 *   - Chat       — coach/direct the agent; persistent thread (the memory)
 *   - Training   — teach it: knowledge, voice, pronunciation, flow, test calls
 *   - Connectors — wire it to the world: capabilities + integrations
 *   - Memory     — what it carries between calls (thread + recall + lessons)
 *
 * This is the Slack-DM-with-each-employee pattern. The standalone /train page
 * was retired — everything you do to an agent now happens here, scoped by
 * agentId. The active tab (and Training's sub-tab) live in the URL so each
 * view is deep-linkable: /chat/:id?tab=connectors, ?tab=training&sub=simulator.
 */
import React, { useEffect, useRef, useState, useCallback, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Send,
  Loader2,
  Trash2,
  MessageSquare,
  MessagesSquare,
  Sparkles,
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
  ArrowUpRight,
  Copy,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";
import IntegrationActivityCard, {
  type IntegrationActivityCardProps,
} from "./IntegrationActivityCard";
import { Skeleton } from "./ui/shadcn/Skeleton";
import { Switch } from "./ui/shadcn/Switch";
import { Badge } from "./ui/shadcn/Badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/shadcn/Tooltip";

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const AgentTrainingInline = lazy(() => import("./AgentTraining"));
const AgentConnectorsInline = lazy(() => import("./AgentActionEngine"));
const AgentMemoryPanel = lazy(() => import("./AgentMemoryPanel"));

/**
 * Each owned agent's workspace is a self-contained surface with four tabs —
 * one verb each: talk (Chat), teach (Training), wire to the world
 * (Connectors), and recall (Memory). All four are scoped to this agentId, so
 * everything the operator does to an agent happens in one place. The standalone
 * /train page was retired in favour of this model.
 */
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

// Touch phones have no Cmd/Ctrl+Enter, so the shortcut hint is noise there.
// `navigator.platform` is deprecated; key off userAgent + pointer type instead.
const IS_TOUCH =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;
const IS_APPLE =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

interface LiveStep {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  status: "pending" | "active" | "done";
}

/** Mirrors the planner's WorkspacePlan proposal shapes (server/lib/workspace-planner). */
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
  /** Attached to agent replies only — actionable proposals awaiting approval. */
  proposals?: MessageProposals;
}

interface AgentWorkspaceProps {
  agentId: string;
  agentName?: string;
  /** Notifies the parent when the agent's resolved capabilities change, so a
   *  surrounding dock can mirror live on/off state without a second fetch. */
  onToolsChange?: (tools: string[]) => void;
  /** When `nonce` changes, the composer is seeded with `text` and focused.
   *  Lets the mission-control dock launch a structured prompt (call, email,
   *  text, booking, capability request) the operator reviews before sending. */
  composerSeed?: { text: string; nonce: number };
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
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [integrationActivities, setIntegrationActivities] = useState<
    IntegrationActivityCardProps[]
  >([]);
  // The active tab + (for Training) its sub-tab live in the URL so every view
  // is deep-linkable as /chat/:id?tab=connectors or ?tab=training&sub=simulator
  // — and survives a refresh or a shared link. Switching agents drops the query
  // (the rail navigates to a bare /chat/:id), so each agent opens on Chat.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = isWorkspaceTab(tabParam) ? tabParam : "chat";
  const trainingSub = searchParams.get("sub") || undefined;
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
  // Tracks proposal cards the operator has acted on so they collapse to a
  // resolved state instead of re-firing. Keyed by `${messageId}:${kind}:${id}`.
  const [resolved, setResolved] = useState<Record<string, "done" | "dismissed">>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string>("");
  // Scroll viewport (chat transcript), composer textarea, and the hidden PDF
  // file input. Declared here so the auto-scroll/seed/upload effects can reach them.
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Per-card TCPA consent ticks. A call card can only dial once the operator
  // explicitly attests prior express written consent for that number.
  const [consentKeys, setConsentKeys] = useState<Record<string, boolean>>({});
  // Panel overlay state — on mobile these open as bottom-sheet overlays
  // over the always-visible chat. On desktop (md+) they still use full tabs.
  // Initialized from URL so deep-links like ?tab=training open the panel on load.
  const [panelOpen, setPanelOpen] = useState<WorkspaceTab | null>(
    activeTab === "chat" ? null : activeTab,
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

  // Auto-scroll to bottom when messages change.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Mirror the agent's live capabilities up to the mission-control dock.
  useEffect(() => {
    onToolsChange?.(enabledTools);
  }, [enabledTools, onToolsChange]);

  // The dock launches structured prompts into the composer. We seed (not
  // send) so the operator can edit/confirm before the planner drafts the
  // approval cards — nothing fires automatically.
  const seedNonce = composerSeed?.nonce;
  useEffect(() => {
    if (seedNonce === undefined) return;
    const text = composerSeed?.text ?? "";
    setInput(text);
    const el = inputRef.current;
    if (el) {
      el.focus();
      // Place the caret at the first bracketed placeholder so the operator
      // can immediately fill in specifics (e.g. [name], [+1...]).
      const ph = text.indexOf("[");
      requestAnimationFrame(() => {
        if (ph >= 0) el.setSelectionRange(ph, text.indexOf("]", ph) + 1 || ph);
        else el.setSelectionRange(text.length, text.length);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seedNonce is the trigger; text is read at fire time.
  }, [seedNonce]);

  // Live reasoning visualization — steps are generic and driven by the agent's
  // actual enabledTools list. No fabricated integration results; integration
  // activity cards are populated by real streamed tool-call data in production.
  useEffect(() => {
    if (!isSending) {
      setLiveSteps([]);
      setIntegrationActivities([]);
      return;
    }

    const hasTools = enabledTools.length > 0;

    const steps: LiveStep[] = [
      {
        id: "1",
        icon: <Brain className="w-3.5 h-3.5" />,
        title: "Recalling workspace memory",
        subtitle: "Thread history • Relevant lessons • Instructions loaded",
        status: "pending",
      },
      ...(hasTools
        ? [
            {
              id: "2",
              icon: <Plug className="w-3.5 h-3.5" />,
              title: "Running tool calls",
              subtitle: `${enabledTools.length} tool${enabledTools.length !== 1 ? "s" : ""} available`,
              status: "pending" as const,
            },
          ]
        : []),
      {
        id: hasTools ? "3" : "2",
        icon: <Sparkles className="w-3.5 h-3.5" />,
        title: "Applying persona & instructions",
        subtitle: "Voice, tone rules, and flow applied",
        status: "pending",
      },
    ];

    setLiveSteps(steps.map((s) => ({ ...s, status: "pending" })));

    // Collect all timer IDs so cleanup can cancel them if isSending flips
    // before the full cycle completes (prevents stale callbacks interleaving
    // with a subsequent send's console state).
    const timers: ReturnType<typeof setTimeout>[] = [];

    steps.forEach((_, index) => {
      timers.push(
        setTimeout(
          () => {
            setLiveSteps((prev) =>
              prev.map((s, i) =>
                i === index
                  ? { ...s, status: "active" as const }
                  : i < index
                    ? { ...s, status: "done" as const }
                    : s,
              ),
            );
          },
          420 * (index + 1),
        ),
      );
    });

    // Clear after full cycle; real impl drives this from stream completion.
    timers.push(
      setTimeout(() => {
        setLiveSteps([]);
        setIntegrationActivities([]);
      }, 4200),
    );

    return () => timers.forEach(clearTimeout);
  }, [isSending, enabledTools]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;
    const optimisticOperator: WorkspaceMessage = {
      id: `tmp-${Date.now()}`,
      role: "operator",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticOperator]);
    setInput("");
    setIsSending(true);
    try {
      const r = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!r.ok) throw new Error("Send failed");
      const data = await r.json();
      const proposals: MessageProposals = {
        changes: Array.isArray(data.changes) ? data.changes : [],
        toolToggles: Array.isArray(data.toolToggles) ? data.toolToggles : [],
        actions: Array.isArray(data.actions) ? data.actions : [],
      };
      const hasProposals =
        proposals.changes.length > 0 ||
        proposals.toolToggles.length > 0 ||
        proposals.actions.length > 0;
      const agentReply: WorkspaceMessage = {
        id: `agent-${Date.now()}`,
        role: "agent",
        content: data.reply || "(empty reply)",
        createdAt: new Date().toISOString(),
        proposals: hasProposals ? proposals : undefined,
      };
      setMessages((prev) => [...prev, agentReply]);
    } catch {
      // Roll back the optimistic operator message and surface error.
      setMessages((prev) => prev.filter((m) => m.id !== optimisticOperator.id));
      setInput(text);
      toastError("Couldn't send", "Try again in a moment");
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [input, isSending, agentId, toastError]);

  const clearThread = useCallback(async () => {
    if (!confirm("Clear this entire chat thread? This can't be undone.")) return;
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

  // PDF upload — read as base64 client-side, POST to the workspace
  // /files endpoint, then re-load messages so the agent's
  // acknowledgement appears in the thread.

  // ── Proposal approval handlers ───────────────────────────────────────
  // Each agent reply may carry proposed config changes, capability toggles,
  // and external actions. Nothing fires automatically — the operator taps
  // Approve, which routes through the gated workspace endpoints.
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
              // Operator-attested via the consent checkbox on the call card.
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

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter sends; plain Enter inserts newline. Mirrors Slack /
    // most modern chat patterns.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      send();
    }
  };

  if (isSharedView) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col h-full min-h-0 items-center justify-center py-16 text-center px-6"
      >
        <div className="relative mb-5">
          <span
            aria-hidden="true"
            className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150"
          />
          <span className="relative flex w-14 h-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-lg shadow-brand/25 aurora-ring">
            <MessageSquare className="w-6 h-6" />
          </span>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70 mb-3">
          Workspace
        </p>
        <h3 className="font-display italic text-2xl text-ink mb-3">Select an agent above</h3>
        <p className="text-[13px] text-muted leading-relaxed max-w-sm">
          Each agent has its own private workspace. Pick one from the rail to open its chat thread,
          training, connectors, and memory.
        </p>
      </motion.div>
    );
  }

  const openPanel = (tab: WorkspaceTab) => {
    if (tab === "chat") {
      setPanelOpen(null);
      setActiveTab("chat");
    } else {
      setPanelOpen(tab);
      setActiveTab(tab);
    }
  };
  const closePanel = () => {
    setPanelOpen(null);
    setActiveTab("chat");
  };

  return (
    <TooltipProvider delayDuration={400}>
    <div className="flex flex-col h-full min-h-0 relative">
      {/* Identity header — agent presence (medallion + name + live status) */}
      <div className="shrink-0 border-b border-black/8">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="shrink-0 flex w-8 h-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-deep text-on-brand text-[12px] font-semibold shadow-sm shadow-brand/25">
              {agentName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink leading-tight truncate">
                {agentName}
              </p>
              <p className="flex items-center gap-1.5 text-[10px] text-muted leading-tight">
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full" style={{ background: "rgba(16,185,129,0.60)" }} />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "#10b981" }} />
                </span>
                Your agent
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={clearThread}
                  className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] uppercase tracking-[0.22em] text-muted hover:text-rose-600 hover:bg-rose-500/8 transition-colors"
                  aria-label="Clear conversation thread"
                >
                  <Trash2 className="w-3 h-3" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">Clear conversation thread</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Chat always renders */}
      <div id="workspace-panel-chat" role="tabpanel" className="flex-1 min-h-0 flex flex-col">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
          {isLoading && messages.length === 0 ? (
            <div className="space-y-3 py-4">
              {/* Skeleton loading states — premium feel */}
              <div className="flex justify-end">
                <div className="max-w-[80%] space-y-2">
                  <Skeleton className="h-10 w-48 rounded-2xl bg-brand/10" />
                </div>
              </div>
              <div className="flex justify-start">
                <div className="max-w-[85%] space-y-2">
                  <Skeleton className="h-14 w-full rounded-2xl" />
                  <Skeleton className="h-8 w-3/4 rounded-2xl" />
                </div>
              </div>
              <div className="flex justify-end">
                <div className="max-w-[75%] space-y-2">
                  <Skeleton className="h-12 w-64 rounded-2xl bg-brand/10" />
                </div>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center justify-center py-10 text-center max-w-sm mx-auto px-3"
            >
              <div className="relative mb-5">
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 rounded-full bg-brand/30 blur-2xl scale-150"
                />
                <span className="relative flex w-14 h-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-deep text-on-brand text-xl font-semibold shadow-lg shadow-brand/25 aurora-ring">
                  {agentName.slice(0, 1).toUpperCase()}
                </span>
              </div>
              <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70 mb-3">
                Direct line
              </p>
              <h3 className="font-display italic text-2xl text-ink mb-2.5">
                Chat with {agentName}
              </h3>
              <p className="text-[12px] text-muted leading-relaxed max-w-xs">
                Coach it, give context, ask how calls went, or direct changes in plain language —
                {agentName} remembers everything in this thread.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-1.5">
                {[
                  "Update your greeting",
                  "Turn on texting",
                  "How did calls go?",
                  "Set tone to authoritative",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="group inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] glass border border-black/10 hover:border-brand/30 hover:-translate-y-px text-ink/75 hover:text-ink transition-all duration-300"
                  >
                    {suggestion}
                    <ArrowUpRight className="w-3 h-3 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 text-brand transition-all duration-200" />
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className={cn(
                    "group flex gap-2",
                    m.role === "operator" ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  <div
                    className={cn(
                      "shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-semibold self-end mb-5",
                      m.role === "operator"
                        ? "bg-brand/15 text-brand border border-brand/30"
                        : "bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/20",
                    )}
                    aria-hidden="true"
                  >
                    {m.role === "operator" ? "You" : agentName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className={cn("flex flex-col max-w-[82%]", m.role === "operator" ? "items-end" : "items-start")}>
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed transition-all duration-200",
                        m.role === "operator"
                          ? "bg-gradient-to-br from-brand to-brand-deep text-on-brand rounded-tr-md shadow-sm shadow-brand/20"
                          : "glass border border-black/8 text-ink rounded-tl-md hover:border-brand/20 hover:shadow-sm relative overflow-hidden",
                      )}
                    >
                      {m.role === "agent" && (
                        <div
                          className="absolute inset-0 bg-gradient-to-br from-brand/[0.02] to-transparent pointer-events-none rounded-2xl"
                          aria-hidden="true"
                        />
                      )}
                      <p className="whitespace-pre-wrap break-words relative z-10">{m.content}</p>
                      {m.role === "agent" && m.proposals && (
                        <div className="mt-2.5 space-y-2">
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
                                tone="emerald"
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
                                tone="amber"
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
                    {/* Hover actions: timestamp + copy */}
                    <div className={cn(
                      "flex items-center gap-2 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200",
                      m.role === "operator" ? "flex-row-reverse" : "flex-row",
                    )}>
                      <time className="text-[10px] text-muted/50 font-mono tabular-nums">
                        {fmtTime(m.createdAt)}
                      </time>
                      <button
                        onClick={() => navigator.clipboard?.writeText(m.content)}
                        className="inline-flex items-center gap-1 text-[10px] text-muted/50 hover:text-muted transition-colors"
                        title="Copy message"
                      >
                        <Copy className="w-2.5 h-2.5" />
                        Copy
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
              {isSending && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className="flex gap-2"
                >
                  {/* Agent avatar with thinking glow ring */}
                  <div className="shrink-0 relative mt-0.5">
                    <motion.div
                      className="absolute -inset-1 rounded-xl"
                      animate={{
                        boxShadow: [
                          "0 0 0 0px rgba(139,63,214,0)",
                          "0 0 0 3px rgba(139,63,214,0.22)",
                          "0 0 0 0px rgba(139,63,214,0)",
                        ],
                      }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <div className="relative w-6 h-6 rounded-lg bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-sm shadow-brand/20 flex items-center justify-center text-[9px] font-semibold z-10">
                      {agentName.slice(0, 1).toUpperCase()}
                    </div>
                  </div>

                  {/* Live Execution Console */}
                  <div className="glass border border-brand/25 rounded-2xl rounded-tl-md overflow-hidden min-w-[200px] max-w-[88%]">

                    {/* Console header bar */}
                    <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-brand/10 bg-brand/[0.03]">
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/55" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
                      </span>
                      <span className="text-[12px] font-medium text-ink flex-1">{agentName} is thinking</span>
                      <motion.span
                        animate={{ opacity: [0.35, 0.9, 0.35] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="inline-flex items-center gap-1 text-[9px] uppercase tracking-[0.18em] text-brand/60 font-mono"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        live
                      </motion.span>
                    </div>

                    {/* Execution timeline — compact rows */}
                    {liveSteps.length > 0 && (
                      <div className="px-3.5 py-2.5 space-y-0">
                        <AnimatePresence>
                          {liveSteps.map((step, index) => (
                            <motion.div
                              key={step.id}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{
                                opacity: step.status === "pending" ? 0.28 : 1,
                                x: 0,
                                transition: { delay: index * 0.04, duration: 0.3 },
                              }}
                              exit={{ opacity: 0 }}
                              className={cn(
                                "flex items-start gap-2.5 py-1.5",
                                index < liveSteps.length - 1 && "border-b border-black/[0.05]",
                              )}
                            >
                              {/* Step status dot */}
                              <div className="shrink-0 mt-[3px] w-3.5 h-3.5 flex items-center justify-center">
                                {step.status === "active" && (
                                  <motion.span
                                    className="block w-2 h-2 rounded-full bg-brand"
                                    animate={{ scale: [1, 1.5, 1], opacity: [1, 0.6, 1] }}
                                    transition={{ duration: 1.2, repeat: Infinity }}
                                  />
                                )}
                                {step.status === "done" && (
                                  <Check className="w-3 h-3" style={{ color: "#10b981" }} />
                                )}
                                {step.status === "pending" && (
                                  <span className="block w-1.5 h-1.5 rounded-full bg-black/20" />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className={cn(
                                      "text-[11px] font-medium leading-tight",
                                      step.status === "pending" ? "text-muted/60" : "text-ink",
                                    )}
                                  >
                                    {step.title}
                                  </span>
                                  {step.status === "active" && (
                                    <span
                                      className="shrink-0 text-[9px] font-mono tracking-widest"
                                      style={{ color: "#8B3FD6" }}
                                    >
                                      ···
                                    </span>
                                  )}
                                </div>
                                <p
                                  className="text-[10px] leading-tight mt-0.5 truncate"
                                  style={{
                                    fontFamily: "var(--font-mono, monospace)",
                                    color: "rgba(26,22,20,0.42)",
                                  }}
                                >
                                  {step.subtitle}
                                </p>
                              </div>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* Integration activity drop-in grid — the Claude.ai moment */}
                    <AnimatePresence>
                      {integrationActivities.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div
                            className="px-3 pb-3 pt-2 grid gap-2"
                            style={{
                              gridTemplateColumns:
                                integrationActivities.length > 1 ? "1fr 1fr" : "1fr",
                              borderTop: "1px solid rgba(139,63,214,0.10)",
                            }}
                          >
                            {integrationActivities.map((activity, idx) => (
                              <motion.div
                                key={activity.integration}
                                initial={{ opacity: 0, y: 10, scale: 0.94 }}
                                animate={{
                                  opacity: 1,
                                  y: 0,
                                  scale: 1,
                                  transition: { delay: idx * 0.14, duration: 0.38, ease: [0.23, 1, 0.32, 1] },
                                }}
                              >
                                <IntegrationActivityCard {...activity} />
                              </motion.div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* No live steps yet — show typing dots */}
                    {liveSteps.length === 0 && integrationActivities.length === 0 && (
                      <div className="px-3.5 pb-3 pt-1 flex items-center gap-1">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="w-1.5 h-1.5 rounded-full bg-brand/50"
                            animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>

        {/* Panel toggle pills — inline above the composer.
            Design rule (owner standard):
            - Mobile (first impression for most users): 36-40px min tap targets, 10-11px text, generous thumb padding.
            - Desktop/laptop: Elegant, slightly larger breathing room, refined hierarchy, no cramped feeling.
            Both must feel flawless. */}
        <div className="shrink-0 flex items-center gap-1.5 px-3 pt-2 pb-1 overflow-x-auto scrollbar-hide">
          {WORKSPACE_TABS.filter((t) => t.id !== "chat").map((tab) => {
            const isOpen = panelOpen === tab.id;
            return (
              <Tooltip key={tab.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => (isOpen ? closePanel() : openPanel(tab.id))}
                    className={cn(
                      "shrink-0 inline-flex items-center gap-1.5 px-3 sm:px-2.5 py-2 sm:py-1.5 rounded-full text-[11px] sm:text-[10px] font-medium transition-all min-h-[36px] sm:min-h-[32px]",
                      isOpen
                        ? "bg-brand/10 text-brand border border-brand/30"
                        : "glass border border-black/10 text-muted hover:text-ink hover:border-brand/25",
                    )}
                    aria-expanded={isOpen}
                    aria-controls={`workspace-panel-${tab.id}`}
                  >
                    <tab.icon className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                    <span>{tab.label}</span>
                    {tab.id === "connectors" && enabledTools.length > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-4 min-w-4 px-1 text-[9px] font-mono leading-none"
                      >
                        {enabledTools.length}
                      </Badge>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{tab.help}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Composer — flawless on mobile (thumb-first) and refined on desktop/laptop.
            Mobile: 40-44px easy thumb targets, slightly larger hit areas, tight but comfortable.
            Desktop: Elegant proportions, better visual weight, generous but not wasteful spacing. */}
        <div className="shrink-0 px-3 py-2.5 sm:py-2 border-t border-black/8 bg-paper/50">
          <div className="flex items-end gap-2 sm:gap-1.5">
            {/* Hidden file input — paperclip button triggers it */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={onFilePick}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isSending}
              className="shrink-0 w-10 h-10 sm:w-9 sm:h-9 rounded-xl glass border border-black/10 flex items-center justify-center text-muted hover:text-ink hover:border-brand/40 transition-all disabled:opacity-40 active:scale-[0.985]"
              aria-label="Attach PDF"
              title="Attach a PDF — the agent will read it and add to its knowledge"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin text-brand" />
              ) : (
                <Paperclip className="w-4 h-4" />
              )}
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                IS_TOUCH
                  ? `Message ${agentName}…`
                  : `Message ${agentName}…  (${IS_APPLE ? "⌘" : "Ctrl"}+Enter to send)`
              }
              rows={1}
              disabled={isSending || isUploading}
              className="flex-1 resize-none rounded-2xl glass border border-black/10 px-3.5 py-2.5 sm:py-2 text-[14px] sm:text-[13px] text-ink placeholder:text-muted/70 outline-none focus:border-brand/40 transition-colors disabled:opacity-60 leading-relaxed max-h-24"
            />
            <button
              onClick={send}
              disabled={!input.trim() || isSending || isUploading}
              className="shrink-0 w-10 h-10 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-brand to-brand-deep text-on-brand flex items-center justify-center shadow-sm shadow-brand/20 hover:opacity-95 active:scale-95 transition-all duration-200 disabled:opacity-30 disabled:shadow-none"
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

      {/* Slide-up panel overlay for Training / Connectors / Memory */}
      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={closePanel}
              className="absolute inset-0 z-20 bg-black/30 backdrop-blur-[2px] rounded-2xl"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 32, stiffness: 340, mass: 0.8 }}
              className="absolute inset-x-0 bottom-0 z-30 max-h-[75%] flex flex-col bg-background border-t border-border shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.18)]"
            >
              {/* Drag handle */}
              <div className="shrink-0 flex justify-center pt-2 pb-1">
                <div className="w-8 h-1 rounded-full bg-muted/50" />
              </div>

              {/* Panel header */}
              <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                  <span className="flex w-6 h-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                    {panelOpen === "training" && <GraduationCap className="w-3.5 h-3.5" />}
                    {panelOpen === "connectors" && <Plug className="w-3.5 h-3.5" />}
                    {panelOpen === "memory" && <Brain className="w-3.5 h-3.5" />}
                  </span>
                  <span className="text-[13px] font-semibold text-foreground">
                    {panelOpen === "training"
                      ? "Training"
                      : panelOpen === "connectors"
                        ? "Connectors"
                        : "Memory"}
                  </span>
                </div>
                <button
                  onClick={closePanel}
                  className="w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Close panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Panel content */}
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
                {panelOpen === "training" && (
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
                )}
                {panelOpen === "connectors" && (
                  <>
                    <div className="px-3 pt-2.5">
                      <a
                        href="/integrations"
                        className="inline-flex items-center gap-1.5 text-[11px] text-brand hover:text-brand/80 transition-colors"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        Manage email &amp; calendar connections
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
                  </>
                )}
                {panelOpen === "memory" && (
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
                      onOpenTraining={() => openPanel("training")}
                    />
                  </Suspense>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
    </TooltipProvider>
  );
}

interface ProposalCardProps {
  icon: React.ReactNode;
  tone: "brand" | "emerald" | "amber";
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

// Semantic tone styles using inline values — bypasses the design system's
// color remapping so each proposal type has a visually distinct identity:
//   brand  → purple  (configuration changes)
//   emerald → green  (capability toggles — "go" actions)
//   amber  → amber   (external actions — calls/emails requiring caution)
const TONE_STYLES: Record<
  ProposalCardProps["tone"],
  { border: string; bg: string; iconBg: string; iconColor: string }
> = {
  brand: {
    border: "rgba(139,63,214,0.25)",
    bg: "rgba(139,63,214,0.04)",
    iconBg: "rgba(139,63,214,0.10)",
    iconColor: "#8B3FD6",
  },
  emerald: {
    border: "rgba(16,185,129,0.25)",
    bg: "rgba(16,185,129,0.04)",
    iconBg: "rgba(16,185,129,0.10)",
    iconColor: "#059669",
  },
  amber: {
    border: "rgba(245,158,11,0.28)",
    bg: "rgba(245,158,11,0.04)",
    iconBg: "rgba(245,158,11,0.10)",
    iconColor: "#d97706",
  },
};

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
  const ts = TONE_STYLES[tone];
  return (
    <motion.div
      layout
      whileHover={!state ? { scale: 1.01 } : {}}
      whileTap={!state ? { scale: 0.99 } : {}}
      animate={
        state ? { scale: 0.98, opacity: state === "dismissed" ? 0.5 : 1 } : { scale: 1, opacity: 1 }
      }
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      style={
        !state
          ? { borderColor: ts.border, backgroundColor: ts.bg }
          : { borderColor: "rgba(0,0,0,0.08)", backgroundColor: "rgba(0,0,0,0.03)" }
      }
      className={cn(
        "rounded-xl border px-3 py-2.5 text-ink transition-all duration-200",
        !state && "hover:shadow-md cursor-default",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 shrink-0 flex w-6 h-6 items-center justify-center rounded-lg"
          style={
            state === "dismissed"
              ? { background: "rgba(0,0,0,0.05)", color: "rgba(0,0,0,0.30)" }
              : { background: ts.iconBg, color: ts.iconColor }
          }
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
      {/* Live execution progress bar */}
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
            style={{ width: "40%" }}
          />
        </motion.div>
      )}
      {state ? (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "mt-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em]",
            state !== "done" && "text-muted/70",
          )}
          style={state === "done" ? { color: "#059669" } : undefined}
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
            <div className="mt-2.5 flex items-start gap-2.5">
              <Switch
                checked={consent.checked}
                onCheckedChange={consent.onChange}
                className="mt-0.5 shrink-0 scale-75 origin-left"
                aria-label="I confirm we have prior express written consent to call this number (TCPA)."
              />
              <span
                className="text-[11px] text-muted leading-snug cursor-pointer"
                onClick={() => consent.onChange(!consent.checked)}
              >
                I confirm we have prior express written consent to call this number (TCPA).
              </span>
            </div>
          )}
          <div className="mt-2.5 flex items-center gap-2">
            <button
              onClick={onApprove}
              disabled={approveDisabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-brand to-brand-deep text-on-brand text-[11px] font-medium shadow-sm shadow-brand/20 hover:opacity-95 active:scale-95 transition-all duration-200 disabled:opacity-40 disabled:shadow-none"
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
            </button>
            <button
              onClick={onDismiss}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-muted hover:text-ink hover:bg-black/5 transition-colors disabled:opacity-40"
            >
              <X className="w-3 h-3" />
              Dismiss
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
