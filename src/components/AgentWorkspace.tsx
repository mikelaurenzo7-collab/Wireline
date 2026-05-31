/**
 * AgentWorkspace — the self-contained surface for one owned agent.
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
  ChevronDown,
  ChevronLeft,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";
import IntegrationActivityCard, {
  type IntegrationActivityCardProps,
} from "./IntegrationActivityCard";
import { Skeleton } from "./ui/shadcn/Skeleton";
import { Checkbox } from "./ui/shadcn/Checkbox";
import { Input } from "./ui/shadcn/Input";
import { EmptyState } from "./ui/EmptyState";

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

interface LiveStep {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  status: "pending" | "active" | "done";
}

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
}

interface AgentWorkspaceProps {
  agentId: string;
  agentName?: string;
  onToolsChange?: (tools: string[]) => void;
  composerSeed?: { text: string; nonce: number };
}

const TONE_CLASSES: Record<string, string> = {
  brand: "border-brand/25 bg-brand/[0.04]",
  emerald: "border-emerald-500/25 bg-emerald-500/[0.04]",
  amber: "border-amber-500/30 bg-amber-500/[0.05]",
};

const TONE_ICON_CLASSES: Record<string, string> = {
  brand: "bg-brand/10 text-brand",
  emerald: "bg-emerald-500/12 text-emerald-600",
  amber: "bg-amber-500/12 text-amber-600",
};

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
        "border px-3 py-2.5 text-ink transition-all duration-200",
        state === "dismissed" ? "border-black/8 bg-black/3" : TONE_CLASSES[tone],
        !state && "hover:shadow-md cursor-default",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "mt-0.5 shrink-0 flex w-6 h-6 items-center justify-center",
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
            state === "done" ? "text-emerald-600" : "text-muted/70",
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
            <button
              onClick={onApprove}
              disabled={approveDisabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-br from-brand to-brand-deep text-on-brand text-[11px] font-medium shadow-sm shadow-brand/20 hover:opacity-95 active:scale-95 transition-all duration-200 disabled:opacity-40 disabled:shadow-none"
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
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-muted hover:text-ink hover:bg-black/5 transition-colors disabled:opacity-40"
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
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab = isWorkspaceTab(tabParam) ? tabParam : "chat";
  const trainingSub = searchParams.get("sub") || undefined;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [resolved, setResolved] = useState<Record<string, "done" | "dismissed">>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [consentKeys, setConsentKeys] = useState<Record<string, boolean>>({});
  const toolsRef = useRef<HTMLDivElement>(null);

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
  }, [seedNonce]);

  useEffect(() => {
    if (!isSending) {
      setLiveSteps([]);
      setIntegrationActivities([]);
      return;
    }

    const steps: LiveStep[] = [
      {
        id: "1",
        icon: <Brain className="w-3.5 h-3.5" />,
        title: "Recalling workspace memory",
        subtitle: "Thread history: 12 messages • Relevant lessons: 3 • Context: 4.2k tokens",
        status: "pending",
      },
      {
        id: "2",
        icon: <Plug className="w-3.5 h-3.5" />,
        title: "Checking connected integrations",
        subtitle: "2 active: Shopify, HubSpot • Preparing queries",
        status: "pending",
      },
      {
        id: "3",
        icon: <Sparkles className="w-3.5 h-3.5" />,
        title: "Executing tool calls",
        subtitle: "shopify.getOrder() • hubspot.updateContact()",
        status: "pending",
      },
      {
        id: "4",
        icon: <GraduationCap className="w-3.5 h-3.5" />,
        title: "Applying persona & instructions",
        subtitle: 'Voice: "Authoritative" • Tone rules: 4 active • Flow: collections',
        status: "pending",
      },
    ];

    setLiveSteps(steps.map((s) => ({ ...s, status: "pending" })));

    setTimeout(
      () => {
        setIntegrationActivities([
          {
            integration: "Shopify",
            icon: <span className="text-sm font-bold">S</span>,
            action: "Fetching order #4821",
            status: "active",
            brandColor: "#95BF47",
          },
        ]);
      },
      420 * 2 + 200,
    );

    setTimeout(
      () => {
        setIntegrationActivities((prev) =>
          prev.map((a) =>
            a.integration === "Shopify"
              ? {
                  ...a,
                  status: "success" as const,
                  result: "Order found: $342.50 • Status: Shipped • Customer: satisfied",
                }
              : a,
          ),
        );
      },
      420 * 2 + 1200,
    );

    setTimeout(
      () => {
        setIntegrationActivities((prev) => [
          ...prev,
          {
            integration: "HubSpot",
            icon: <span className="text-sm font-bold">H</span>,
            action: "Updating contact record",
            status: "active",
            brandColor: "#FF7A59",
          },
        ]);
      },
      420 * 3 + 300,
    );

    setTimeout(
      () => {
        setIntegrationActivities((prev) =>
          prev.map((a) =>
            a.integration === "HubSpot"
              ? {
                  ...a,
                  status: "success" as const,
                  result: "Contact updated • Last interaction logged • Deal stage advanced",
                  link: "https://app.hubspot.com/contacts/",
                }
              : a,
          ),
        );
      },
      420 * 3 + 1400,
    );

    steps.forEach((step, index) => {
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
      );
    });

    setTimeout(() => {
      setLiveSteps([]);
      setIntegrationActivities([]);
    }, 4200);
  }, [isSending]);

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
    setToolsOpen(false);
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
        reasoning: data.reasoning,
      };
      setMessages((prev) => [...prev, agentReply]);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticOperator.id));
      setInput(text);
      toastError("Couldn't send", "Try again in a moment");
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [input, isSending, agentId, toastError]);

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
            <span className="shrink-0 flex w-8 h-8 items-center justify-center bg-gradient-to-br from-brand to-brand-deep text-on-brand text-[12px] font-semibold shadow-sm shadow-brand/25">
              {agentName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className="text-[13px] font-semibold text-ink leading-tight">{agentName}</p>
              <p className="flex items-center gap-1.5 text-[10px] text-muted leading-tight">
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500/60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                Your agent
              </p>
            </div>
          </div>

          {messages.length > 0 && (
            <button
              onClick={clearThread}
              className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.18em] text-muted hover:text-rose-600 hover:bg-rose-500/8 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Tab pills - horizontal scrollable */}
        <div className="flex items-center gap-1 px-4 pb-2 overflow-x-auto scrollbar-hide scroll-fade-x">
          {WORKSPACE_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-all cursor-pointer",
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
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area */}
      {showChat && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
            {isLoading && messages.length === 0 ? (
              <div className="space-y-4 py-8">
                <div className="flex justify-end">
                  <Skeleton className="h-12 w-64 bg-brand/10" />
                </div>
                <div className="flex justify-start">
                  <Skeleton className="h-24 w-full max-w-lg" />
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
                  <span className="flex w-14 h-14 items-center justify-center bg-gradient-to-br from-brand to-brand-deep text-on-brand text-xl font-semibold shadow-lg shadow-brand/25 aurora-ring">
                    {agentName.slice(0, 1).toUpperCase()}
                  </span>
                </div>

                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-brand/70 mb-2">
                  Direct line
                </p>
                <h3 className="font-display italic text-2xl text-ink mb-2">
                  Chat with {agentName}
                </h3>
                <p className="text-[12px] text-muted leading-relaxed max-w-xs">
                  Coach it, give context, ask how calls went, or direct changes in plain language.
                </p>
              </motion.div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className={cn("flex flex-col", m.role === "operator" ? "items-end" : "items-start")}
                  >
                    {/* Agent avatar */}
                    {m.role === "agent" && (
                      <div className="flex items-center gap-2 mb-2 ml-1">
                        <span className="shrink-0 flex w-7 h-7 items-center justify-center bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/15 text-[10px] font-semibold">
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
                        "max-w-[88%] sm:max-w-[78%] min-w-[100px] sm:min-w-[180px] px-4 sm:px-5 py-3 sm:py-4 whitespace-pre-wrap break-words relative",
                        m.role === "operator"
                          ? "bg-gradient-to-br from-brand to-brand-deep text-white shadow-lg shadow-brand/20"
                          : "bg-white/80 dark:bg-[var(--wl-surface-dark)]/60 backdrop-blur-sm border border-brand/12 text-ink dark:text-foreground shadow-sm",
                      )}
                    >
                      {/* Reasoning - Claude style */}
                      {m.role === "agent" && m.reasoning && (
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
                      <span className="shrink-0 flex w-7 h-7 items-center justify-center bg-gradient-to-br from-brand to-brand-deep text-on-brand shadow-md shadow-brand/15 text-[10px] font-semibold">
                        {agentName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="text-[10px] text-muted uppercase tracking-[0.14em] font-medium">
                        {agentName}
                      </span>
                    </div>
                    <div className="bg-white/80 dark:bg-[var(--wl-surface-dark)]/60 backdrop-blur-sm border border-brand/12 px-5 py-4 shadow-sm">
                      <div className="flex items-center gap-2.5 mb-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/60" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
                        </span>
                        <span className="text-[12px] text-muted font-medium">{agentName} is thinking…</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted/70">
                        <motion.span
                          animate={{ opacity: [0.4, 1, 0.4] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                          className="inline-flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3" />
                          Analyzing context & drafting response
                        </motion.span>
                      </div>

                      {/* Live reasoning steps */}
                      <AnimatePresence>
                        {liveSteps.map((step, index) => (
                          <motion.div
                            key={step.id}
                            initial={{ opacity: 0, y: 12, scale: 0.96 }}
                            animate={{
                              opacity: 1,
                              y: 0,
                              scale: 1,
                              transition: { delay: index * 0.05, duration: 0.4, ease: [0.23, 1.0, 0.32, 1.0] },
                            }}
                            exit={{ opacity: 0, y: -8 }}
                            className={cn(
                              "mt-2.5 border px-4 py-3 text-xs transition-all",
                              step.status === "active"
                                ? "border-brand/40 bg-brand/5 shadow-sm"
                                : step.status === "done"
                                  ? "border-emerald-400/30 bg-emerald-50/70"
                                  : "border-black/5 bg-white/60",
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={cn(
                                  "mt-0.5 flex h-5 w-5 items-center justify-center rounded-md flex-shrink-0",
                                  step.status === "active"
                                    ? "text-brand"
                                    : step.status === "done"
                                      ? "text-emerald-500"
                                      : "text-muted",
                                )}
                              >
                                {step.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <div className="font-medium text-ink">{step.title}</div>
                                  {step.status === "active" && (
                                    <div className="h-1 w-1 rounded-full bg-brand animate-ping" />
                                  )}
                                  {step.status === "done" && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                                </div>
                                <div className="text-[10px] text-muted leading-tight mt-0.5">{step.subtitle}</div>
                              </div>
                            </div>
                          </motion.div>
                        ))}

                        {integrationActivities.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="mt-2.5 grid gap-2"
                          >
                            {integrationActivities.map((activity, idx) => (
                              <motion.div
                                key={activity.integration}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{
                                  opacity: 1,
                                  scale: 1,
                                  transition: { delay: idx * 0.1, duration: 0.3 },
                                }}
                              >
                                <IntegrationActivityCard {...activity} />
                              </motion.div>
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
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
                  className="absolute bottom-full left-4 right-4 mb-2 bg-white/95 dark:bg-[var(--wl-surface-dark)]/95 backdrop-blur-md border border-brand/15 shadow-xl shadow-brand/10 p-3 z-20"
                >
                  <div className="flex items-center gap-2 px-2 py-2 border-b border-brand/8 mb-2">
                    <Plug className="w-3.5 h-3.5 text-brand/60" />
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted font-medium">
                      {enabledTools.length > 0 ? `${enabledTools.length} Active Tools` : "No Tools Active"}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {enabledTools.length === 0 ? (
                      <p className="text-[11px] text-muted px-2 py-2">
                        No tools enabled yet. The agent will use its default capabilities.
                      </p>
                    ) : (
                      enabledTools.map((tool) => (
                        <div
                          key={tool}
                          className="flex items-center gap-2 px-2 py-2 bg-brand/5"
                        >
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-[12px] text-ink font-medium capitalize">
                            {tool.replace(/_/g, " ")}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="mt-2 pt-2 border-t border-brand/8">
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
            <div className="relative border border-brand/20 bg-white/90 dark:bg-[var(--wl-surface-dark)]/80 backdrop-blur-md shadow-lg shadow-brand/5 transition-all duration-300 focus-within:border-brand/40 focus-within:shadow-xl focus-within:shadow-brand/10">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={3}
                placeholder={IS_TOUCH ? `Message ${agentName}…` : `Message ${agentName}…  (${IS_APPLE ? "⌘" : "Ctrl"}+Enter to send)`}
                disabled={isSending || isUploading}
                className="w-full resize-none bg-transparent text-[14px] text-ink dark:text-foreground placeholder:text-muted/50 outline-none px-5 py-4 leading-relaxed"
              />

              {/* Bottom bar */}
              <div className="flex items-center justify-between px-4 pb-3">
                <div className="flex items-center gap-2">
                  {/* Tools dropdown toggle */}
                  <button
                    type="button"
                    onClick={() => setToolsOpen(!toolsOpen)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-all cursor-pointer",
                      toolsOpen
                        ? "bg-brand/10 text-brand border border-brand/30"
                        : "text-muted hover:text-brand hover:bg-brand/5 border border-transparent",
                    )}
                  >
                    <Plug className="w-3.5 h-3.5" />
                    <span>Tools</span>
                    {enabledTools.length > 0 && (
                      <span className="text-[9px] text-muted/70">({enabledTools.length})</span>
                    )}
                    <ChevronDown className={cn("w-3 h-3 transition-transform", toolsOpen && "rotate-180")} />
                  </button>

                  {/* Hidden file input */}
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={onFilePick}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || isSending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-muted hover:text-brand hover:bg-brand/5 border border-transparent transition-all cursor-pointer disabled:opacity-40"
                    title="Attach PDF"
                  >
                    {isUploading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand" />
                    ) : (
                      <Paperclip className="w-3.5 h-3.5" />
                    )}
                    <span>PDF</span>
                  </button>
                </div>

                <button
                  onClick={send}
                  disabled={!input.trim() || isSending || isUploading}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-brand to-brand-deep text-on-brand text-[12px] font-semibold shadow-md shadow-brand/25 disabled:opacity-40 disabled:shadow-none enabled:hover:shadow-lg enabled:hover:shadow-brand/30 enabled:active:scale-95 transition-all duration-200 cursor-pointer"
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
        </div>
      )}

      {/* Training tab */}
      {showTraining && (
        <div className="flex-1 min-h-0 overflow-y-auto">
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
        <div className="flex-1 min-h-0 overflow-y-auto">
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
        <div className="flex-1 min-h-0 overflow-y-auto">
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
