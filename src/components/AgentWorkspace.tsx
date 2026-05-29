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
} from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";

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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // Resolved capabilities, mirrored up to the mission-control dock.
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  // The active tab + (for Training) its sub-tab live in the URL so every view
  // is deep-linkable as /chat/:id?tab=connectors or ?tab=training&sub=simulator
  // — and survives a refresh or a shared link. Switching agents drops the query
  // (the rail navigates to a bare /chat/:id), so each agent opens on Chat.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: WorkspaceTab = isWorkspaceTab(tabParam) ? tabParam : "chat";
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
  // Per-card TCPA consent ticks. A call card can only dial once the operator
  // explicitly attests prior express written consent for that number.
  const [consentKeys, setConsentKeys] = useState<Record<string, boolean>>({});

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
      if (!r.ok) {
        // Surface a useful reason instead of silently dropping the turn —
        // the most common causes are rate limiting and a transient backend
        // hiccup. The operator's text is restored below so nothing is lost.
        let detail = "Try again in a moment";
        if (r.status === 429) detail = "You're sending a bit fast — give it a few seconds";
        else {
          const body = await r.json().catch(() => null);
          if (body?.error) detail = String(body.error);
        }
        throw new Error(detail);
      }
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
    } catch (e) {
      // Roll back the optimistic operator message and surface error.
      setMessages((prev) => prev.filter((m) => m.id !== optimisticOperator.id));
      setInput(text);
      toastError("Couldn't send", e instanceof Error ? e.message : "Try again in a moment");
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
      <div className="flex flex-col h-full min-h-0 items-center justify-center py-16 text-center px-6">
        <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center mb-4 mx-auto">
          <MessageSquare className="w-5 h-5 text-brand" />
        </div>
        <h3 className="font-display italic text-xl text-ink mb-2">Select an agent above</h3>
        <p className="text-[12px] text-muted leading-relaxed max-w-xs">
          Each agent has its own private workspace. Pick one from the dropdown to open its chat
          thread.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header + tab strip */}
      <div className="shrink-0 border-b border-black/8">
        <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand/12 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-brand" />
            </div>
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-ink truncate">{agentName}</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted/70">
                Private workspace · persistent memory
              </p>
            </div>
          </div>
          {activeTab === "chat" && messages.length > 0 && (
            <button
              onClick={clearThread}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.22em] text-muted hover:text-rose-600 hover:bg-rose-500/8 transition-colors"
              title="Clear thread"
            >
              <Trash2 className="w-3 h-3" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
        {/* One verb per tab: talk · teach · wire · recall. Scrolls on narrow
            phones; the active pill glides between tabs. */}
        <div
          role="tablist"
          aria-label="Agent workspace sections"
          className="flex items-center gap-1 px-2 pb-2 overflow-x-auto scrollbar-hide"
        >
          {WORKSPACE_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={active}
                aria-controls={`workspace-panel-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                title={tab.help}
                className={cn(
                  "relative shrink-0 inline-flex items-center gap-1.5 px-3 min-h-9 rounded-lg text-[10px] uppercase tracking-[0.18em] transition-colors",
                  active ? "text-brand" : "text-muted hover:text-ink hover:bg-black/5",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="workspace-tab-pill"
                    aria-hidden="true"
                    className="absolute inset-0 rounded-lg bg-brand/10 border border-brand/30"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <tab.icon className="relative z-[1] w-3 h-3" />
                <span className="relative z-[1]">{tab.label}</span>
                {tab.id === "connectors" && enabledTools.length > 0 && (
                  <span className="relative z-[1] text-[9px] text-muted/70 normal-case tracking-normal">
                    {enabledTools.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab panels */}
      {activeTab === "training" ? (
        <div
          id="workspace-panel-training"
          role="tabpanel"
          className="flex-1 min-h-0 overflow-y-auto scrollbar-hide"
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16 text-muted">
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
      ) : activeTab === "connectors" ? (
        <div
          id="workspace-panel-connectors"
          role="tabpanel"
          className="flex-1 min-h-0 overflow-y-auto"
        >
          <div className="px-4 pt-3">
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
              <div className="flex items-center justify-center py-16 text-muted">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            }
          >
            <AgentConnectorsInline agentId={agentId} />
          </Suspense>
        </div>
      ) : activeTab === "memory" ? (
        <div id="workspace-panel-memory" role="tabpanel" className="flex-1 min-h-0 overflow-y-auto">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16 text-muted">
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
      ) : (
        <>
          <div id="workspace-panel-chat" role="tabpanel" className="contents">
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
              {isLoading && messages.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-muted">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading thread…
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto">
                  <div className="w-12 h-12 rounded-2xl bg-brand/10 flex items-center justify-center mb-4">
                    <Sparkles className="w-5 h-5 text-brand" />
                  </div>
                  <h3 className="font-display italic text-xl text-ink mb-2">
                    Start a chat with {agentName}
                  </h3>
                  <p className="text-[12px] text-muted leading-relaxed">
                    This is your ongoing private channel. Coach, give context, ask how recent calls
                    went. The agent remembers everything you discuss here and references your recent
                    call activity.
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {[
                      "Update your greeting to something warmer",
                      "Turn on text messaging",
                      "How did calls go this week?",
                      "Set your tone to authoritative",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => setInput(suggestion)}
                        className="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-[0.18em] glass border border-black/8 hover:border-brand/40 text-ink/70 hover:text-ink transition-all"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {messages.map((m) => (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                      className={cn(
                        "flex gap-3",
                        m.role === "operator" ? "flex-row-reverse" : "flex-row",
                      )}
                    >
                      <div
                        className={cn(
                          "shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold",
                          m.role === "operator"
                            ? "bg-brand/15 text-brand border border-brand/30"
                            : "bg-paper border border-black/12 text-ink",
                        )}
                        aria-hidden="true"
                      >
                        {m.role === "operator" ? "You" : agentName.slice(0, 1).toUpperCase()}
                      </div>
                      <div
                        className={cn(
                          "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed",
                          m.role === "operator"
                            ? "bg-brand text-on-brand rounded-tr-md"
                            : "glass border border-black/8 text-ink rounded-tl-md",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        {m.role === "agent" && m.proposals && (
                          <div className="mt-3 space-y-2">
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
                  {isSending && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="flex gap-3"
                    >
                      <div className="shrink-0 w-7 h-7 rounded-full bg-paper border border-black/12 flex items-center justify-center text-[10px] font-semibold text-ink">
                        {agentName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="glass border border-brand/20 rounded-2xl rounded-tl-md px-3.5 py-2.5 space-y-1.5">
                        <div className="flex items-center gap-2 text-[12px] text-ink/80">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand/60" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-brand" />
                          </span>
                          <span className="font-medium">{agentName} is thinking…</span>
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
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              )}
            </div>

            {/* Composer */}
            <div className="shrink-0 px-4 py-3 border-t border-black/8 bg-paper/50">
              <div className="flex items-end gap-2 max-w-3xl mx-auto">
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
                  className="shrink-0 w-10 h-10 rounded-2xl glass border border-black/10 flex items-center justify-center text-muted hover:text-ink hover:border-brand/40 transition-all disabled:opacity-40"
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
                  rows={2}
                  disabled={isSending || isUploading}
                  className="flex-1 resize-none rounded-2xl glass border border-black/10 px-3 py-2.5 text-[13px] text-ink placeholder:text-muted/70 outline-none focus:border-brand/40 transition-colors disabled:opacity-60 leading-relaxed"
                />
                <button
                  onClick={send}
                  disabled={!input.trim() || isSending || isUploading}
                  className="shrink-0 w-10 h-10 rounded-2xl bg-brand text-on-brand flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-30"
                  aria-label="Send message"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[9px] uppercase tracking-[0.22em] text-muted/70 mt-2 text-center">
                Messages persist · agent uses thread + last 5 calls + uploaded files as context
              </p>
            </div>
          </div>
        </>
      )}
    </div>
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

const TONE_CLASSES: Record<ProposalCardProps["tone"], string> = {
  brand: "border-brand/25 bg-brand/[0.04]",
  emerald: "border-emerald-500/25 bg-emerald-500/[0.04]",
  amber: "border-amber-500/30 bg-amber-500/[0.05]",
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
  return (
    <motion.div
      layout
      animate={
        state ? { scale: 0.98, opacity: state === "dismissed" ? 0.5 : 1 } : { scale: 1, opacity: 1 }
      }
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "rounded-xl border px-3 py-2.5 text-ink transition-colors",
        state === "dismissed" ? "border-black/8 bg-black/3" : TONE_CLASSES[tone],
      )}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-ink/70">{icon}</span>
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
              <input
                type="checkbox"
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
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand text-on-brand text-[11px] font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
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
