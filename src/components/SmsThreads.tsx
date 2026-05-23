/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MessageSquare, Send, Loader2, RefreshCw, Inbox, Phone } from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { formatDate } from "../lib/safe-date";
import PageShell, { Panel } from "./PageShell";
import HubTabs, { CHANNELS_HUB } from "./HubTabs";
import { useToast } from "../contexts/ToastContext";
import EmptyState from "./EmptyState";

interface SmsThread {
  id: string;
  customer_number: string;
  status: string;
  unread_count: number;
  last_message_at: string;
  created_at: string;
}

interface SmsMessage {
  id: string;
  direction: "in" | "out";
  body: string;
  created_at: string;
  twilio_sid?: string | null;
}

/**
 * Two-way SMS inbox. Lists threads on the left, opens a chat-style
 * detail on the right. Operator can type + send replies which go out
 * via the tenant's Twilio sender. Reuses the same send path as the
 * agent action engine, so opt-out enforcement applies automatically.
 *
 * Mounted at /inbox under a "SMS" tab alongside the existing email
 * inbox — see AppRoutes.tsx + EmailInbox.tsx for the surrounding
 * tab layout.
 */
export default function SmsThreads() {
  const { success, error: toastError } = useToast();
  const [threads, setThreads] = useState<SmsThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SmsMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchThreads = async () => {
    try {
      const r = await authFetch("/api/sms/threads");
      const d = await r.json();
      setThreads(d.threads || []);
    } catch (e: any) {
      toastError("Failed to load SMS inbox", e?.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (threadId: string) => {
    setMessagesLoading(true);
    try {
      const r = await authFetch(`/api/sms/threads/${threadId}/messages`);
      const d = await r.json();
      setMessages(d.messages || []);
      // Clear unread on open
      await authFetch(`/api/sms/threads/${threadId}/mark-read`, { method: "POST" }).catch(() => {});
      setThreads((prev) => prev.map((t) => (t.id === threadId ? { ...t, unread_count: 0 } : t)));
    } catch (e: any) {
      toastError("Failed to load thread", e?.message);
    } finally {
      setMessagesLoading(false);
    }
  };

  useEffect(() => {
    fetchThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time fetch on mount
  }, []);

  useEffect(() => {
    if (activeId) fetchMessages(activeId);
    else setMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-keyed on active thread id
  }, [activeId]);

  // Auto-scroll to newest message on open + after send.
  useEffect(() => {
    if (messagesEndRef.current && messages.length > 0) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = async () => {
    if (!activeId || !reply.trim() || sending) return;
    setSending(true);
    try {
      const r = await authFetch(`/api/sms/threads/${activeId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim() }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.reason || "Send failed");
      setReply("");
      success("SMS sent", "Message delivered to customer.");
      await fetchMessages(activeId);
      await fetchThreads();
    } catch (e: any) {
      toastError("SMS send failed", e?.message || "Try again.");
    } finally {
      setSending(false);
    }
  };

  const activeThread = threads.find((t) => t.id === activeId);

  return (
    <div className="h-full flex flex-col min-h-0">
      <HubTabs tabs={CHANNELS_HUB} label="Channels sub-navigation" />
      <div className="flex-1 min-h-0">
        <PageShell
          eyebrow="Channels · Messaging"
          title="SMS Inbox"
          subtitle="Two-way text conversations with customers — outbound from your agents, inbound replies routed here."
          actions={
            <button
              onClick={fetchThreads}
              disabled={loading}
              className="h-9 px-3 rounded-full glass border border-white/10 text-[10px] uppercase tracking-[0.28em] text-muted hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Refresh
            </button>
          }
        >
          <div className="h-full grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3 min-h-0">
            <Panel title="Threads" hint={`${threads.length} total`} icon={Inbox} scroll>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted" />
                </div>
              ) : threads.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title="No SMS yet"
                  description="Conversations land here when an agent sends a text or a customer replies to your number."
                  accent="#4F1E7B"
                />
              ) : (
                <div className="space-y-1.5">
                  <AnimatePresence>
                    {threads.map((t) => (
                      <motion.button
                        key={t.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => setActiveId(t.id)}
                        className={cn(
                          "w-full text-left rounded-xl p-3 border transition-all",
                          activeId === t.id
                            ? "bg-brand/8 border-brand/30"
                            : "bg-white/[0.02] border-white/10 hover:border-white/20",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-mono text-sm text-ink truncate">
                              {t.customer_number}
                            </p>
                            <p className="text-[10px] text-muted/70 mt-0.5">
                              {formatDate(
                                t.last_message_at,
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                                "—",
                                "en-US",
                              )}
                            </p>
                          </div>
                          {t.unread_count > 0 && (
                            <span className="shrink-0 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-brand text-on-brand text-[10px] font-bold">
                              {t.unread_count}
                            </span>
                          )}
                        </div>
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </Panel>

            <Panel
              title={activeThread ? activeThread.customer_number : "Select a thread"}
              hint={activeThread ? "SMS · TWO-WAY" : ""}
              icon={Phone}
            >
              {!activeThread ? (
                <EmptyState
                  icon={MessageSquare}
                  title="Pick a conversation"
                  description="Select a thread on the left to see the full SMS history and reply."
                  accent="#4F1E7B"
                />
              ) : (
                <div className="h-full flex flex-col">
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pb-3">
                    {messagesLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-5 h-5 animate-spin text-muted" />
                      </div>
                    ) : (
                      messages.map((m) => (
                        <div
                          key={m.id}
                          className={cn(
                            "max-w-[78%] rounded-2xl px-3.5 py-2.5 border",
                            m.direction === "out"
                              ? "ml-auto bg-brand/12 border-brand/30 text-ink"
                              : "mr-auto bg-white/[0.04] border-white/10 text-ink",
                          )}
                        >
                          <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                            {m.body}
                          </p>
                          <p className="text-[9px] uppercase tracking-[0.25em] text-muted/60 mt-1.5">
                            {m.direction === "out" ? "You" : "Caller"} ·{" "}
                            {formatDate(
                              m.created_at,
                              { hour: "numeric", minute: "2-digit" },
                              "—",
                              "en-US",
                            )}
                          </p>
                        </div>
                      ))
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="shrink-0 border-t border-white/8 pt-3">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder="Type a reply…"
                        disabled={sending}
                        className="flex-1 text-sm bg-black/5 border border-black/10 rounded-lg px-3 py-2.5 outline-none focus:border-brand/50 text-ink placeholder:text-muted/50 disabled:opacity-50"
                      />
                      <button
                        onClick={handleSend}
                        disabled={sending || !reply.trim()}
                        aria-label="Send SMS reply"
                        className="shrink-0 w-11 h-11 rounded-lg bg-brand text-on-brand hover:bg-brand/90 transition-colors flex items-center justify-center disabled:opacity-40"
                      >
                        {sending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted/60 mt-1.5 leading-relaxed">
                      Sent from your Twilio sender · TCPA opt-out applies · STOP keyword
                      auto-honored.
                    </p>
                  </div>
                </div>
              )}
            </Panel>
          </div>
        </PageShell>
      </div>
    </div>
  );
}
