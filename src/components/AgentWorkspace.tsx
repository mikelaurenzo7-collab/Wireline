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
import { Send, Loader2, Trash2, MessageSquare, Sparkles, Paperclip } from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { cn } from "../lib/utils";

interface WorkspaceMessage {
  id: string;
  role: "operator" | "agent";
  content: string;
  createdAt: string;
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

  const loadMessages = useCallback(async () => {
    if (!agentId || isSharedView) return;
    setIsLoading(true);
    try {
      const r = await authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/messages`);
      if (!r.ok) throw new Error("Failed to load messages");
      const data = await r.json();
      setMessages(data.messages || []);
    } catch {
      toastError("Couldn't load workspace", "Check connection and refresh");
    } finally {
      setIsLoading(false);
    }
  }, [agentId, toastError]);

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
      const agentReply: WorkspaceMessage = {
        id: `agent-${Date.now()}`,
        role: "agent",
        content: data.reply || "(empty reply)",
        createdAt: new Date().toISOString(),
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
      </div>

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
                "How did calls go this week?",
                "Be warmer on price objections",
                "What's confusing callers most?",
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
            className="flex-1 resize-none rounded-2xl glass border border-black/10 px-3 py-2.5 text-[13px] text-ink placeholder:text-muted/50 outline-none focus:border-brand/40 transition-colors disabled:opacity-60 leading-relaxed"
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
        <p className="text-[9px] uppercase tracking-[0.22em] text-muted/55 mt-2 text-center">
          Messages persist · agent uses thread + last 5 calls + uploaded files as context
        </p>
      </div>
    </div>
  );
}
