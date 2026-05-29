/**
 * AgentWorkspace — per-agent operator chat surface.
 *
 * Each agent has its own persistent thread. The operator coaches, asks
 * questions, gives context. The agent replies in-character with
 * awareness of recent calls and prior thread history.
 *
 * Distinct from /train (configuration / pre-deployment setup) — this
 * is ONGOING. The Slack-DM-with-each-employee pattern.
 *
 * Selected via the existing AgentTraining agent picker so operators
 * don't have to navigate twice. Lives behind the "Workspace" tab.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Send,
  Loader2,
  Trash2,
  MessageSquare,
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
} from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";
import { AGENT_TOOL_CATALOG } from "../lib/agent-capabilities";

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
}

export default function AgentWorkspace({ agentId, agentName = "agent" }: AgentWorkspaceProps) {
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
  // Connectors / capabilities panel — built from the agent's resolved tools.
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [showConnectors, setShowConnectors] = useState(false);
  // Tracks proposal cards the operator has acted on so they collapse to a
  // resolved state instead of re-firing. Keyed by `${messageId}:${kind}:${id}`.
  const [resolved, setResolved] = useState<Record<string, "done" | "dismissed">>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
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
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-black/8">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-brand/12 flex items-center justify-center shrink-0">
            <MessageSquare className="w-4 h-4 text-brand" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ink truncate">Chat with {agentName}</p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted/70">
              Private workspace · persistent memory
            </p>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clearThread}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.22em] text-muted hover:text-rose-600 hover:bg-rose-500/8 transition-colors"
              title="Clear thread"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          )}
          <button
            onClick={() => setShowConnectors((v) => !v)}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] uppercase tracking-[0.22em] transition-colors",
              showConnectors
                ? "text-brand bg-brand/10"
                : "text-muted hover:text-ink hover:bg-black/5",
            )}
            title="Capabilities & connectors"
          >
            <Plug className="w-3 h-3" />
            {enabledTools.length} on
          </button>
        </div>
      </div>

      {/* Connectors / capabilities panel */}
      <AnimatePresence initial={false}>
        {showConnectors && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="shrink-0 overflow-hidden border-b border-black/8 bg-paper/40"
          >
            <div className="px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-muted/70 mb-2">
                Capabilities — ask in chat to turn these on or off
              </p>
              <div className="flex flex-wrap gap-1.5">
                {AGENT_TOOL_CATALOG.map((tool) => {
                  const on = enabledTools.includes(tool.name);
                  return (
                    <span
                      key={tool.name}
                      title={tool.description}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] border transition-colors",
                        on
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                          : "bg-black/3 border-black/8 text-muted/60",
                      )}
                    >
                      {on && <Check className="w-2.5 h-2.5" />}
                      {tool.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
              This is your ongoing private channel. Coach, give context, ask how recent calls went.
              The agent remembers everything you discuss here and references your recent call
              activity.
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
                          a.to ? `To: ${a.customerName ? `${a.customerName} · ` : ""}${a.to}` : "",
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
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full bg-paper border border-black/12 flex items-center justify-center text-[10px] font-semibold text-ink">
                  {agentName.slice(0, 1).toUpperCase()}
                </div>
                <div className="glass border border-black/8 rounded-2xl rounded-tl-md px-3.5 py-2.5 flex items-center gap-2 text-[12px] text-muted">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {agentName} is typing…
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
            placeholder={`Message ${agentName}…  (⌘+Enter to send)`}
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
  );
}

interface ProposalCardProps {
  icon: React.ReactNode;
  tone: "brand" | "emerald" | "amber";
  title: string;
  detail?: string;
  state?: "done" | "dismissed";
  busy: boolean;
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
  approveLabel,
  consent,
  onApprove,
  onDismiss,
}: ProposalCardProps) {
  const approveDisabled = busy || (!!consent && !consent.checked);
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 text-ink",
        state === "dismissed" ? "opacity-50 border-black/8 bg-black/3" : TONE_CLASSES[tone],
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
      {state ? (
        <p
          className={cn(
            "mt-2 text-[10px] uppercase tracking-[0.18em]",
            state === "done" ? "text-emerald-600" : "text-muted/70",
          )}
        >
          {state === "done" ? "✓ Applied" : "Dismissed"}
        </p>
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
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {approveLabel}
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
    </div>
  );
}
