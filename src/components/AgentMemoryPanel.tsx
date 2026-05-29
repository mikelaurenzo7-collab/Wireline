/* eslint-disable @typescript-eslint/no-explicit-any -- agent-config + overview rows aren't shared as client types yet. */
/**
 * AgentMemoryPanel — the "Memory" tab inside an agent's chat workspace.
 *
 * Until now an agent's memory was implicit ("the thread IS the memory"). This
 * surfaces it: a single window onto everything the agent carries between calls
 * — the persistent operator thread, the recent calls it can recall, the
 * patterns it has learned, and the rules/personality that shape every reply.
 *
 * It writes nothing of its own except "clear memory" (which wipes the thread,
 * delegated back to the workspace's existing clear handler). Knowledge, rules,
 * voice and flow are edited in the Training tab — "Manage in Training" jumps
 * there rather than duplicating those editors here.
 *
 * Data is read from endpoints that already exist:
 *   - GET /api/agents/:id/workspace/overview  → recent call recall
 *   - GET /api/agent-config/:id               → lessons, rules, personality, facts
 */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Brain, Sparkles, Phone, ShieldAlert, Trash2, ArrowUpRight, Loader2 } from "lucide-react";
import { authFetch } from "../lib/api";
import { formatDate } from "../lib/safe-date";

interface AgentMemoryPanelProps {
  agentId: string;
  agentName: string;
  /** Length of the persistent operator thread, owned by the parent workspace. */
  messageCount: number;
  /** Clears the persistent thread (the parent already confirms + toasts). */
  onClearMemory: () => void;
  /** Jump to the Training tab to edit the durable inputs. */
  onOpenTraining: () => void;
}

interface RecentCall {
  summary: string | null;
  sentiment: string | null;
  intent: string | null;
  outcome: string | null;
  createdAt: string | null;
}

const SENTIMENT_TONE: Record<string, string> = {
  positive: "text-emerald-700 bg-emerald-500/10 border-emerald-500/30",
  neutral: "text-muted bg-black/5 border-black/10",
  negative: "text-rose-700 bg-rose-500/10 border-rose-500/30",
};

export default function AgentMemoryPanel({
  agentId,
  agentName,
  messageCount,
  onClearMemory,
  onOpenTraining,
}: AgentMemoryPanelProps) {
  const [loading, setLoading] = useState(true);
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [directives, setDirectives] = useState<any[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [personality, setPersonality] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      authFetch(`/api/agents/${encodeURIComponent(agentId)}/workspace/overview`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      authFetch(`/api/agent-config/${encodeURIComponent(agentId)}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([overview, config]) => {
      if (!active) return;
      setRecentCalls(Array.isArray(overview?.recentCalls) ? overview.recentCalls : []);
      setLessons(Array.isArray(config?.lessons) ? config.lessons : []);
      setDirectives(Array.isArray(config?.directives) ? config.directives : []);
      setKnowledge(Array.isArray(config?.knowledge) ? config.knowledge : []);
      setPersonality(config?.personality || "");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Hero */}
      <section className="rounded-2xl glass border border-white/10 p-4 relative overflow-hidden">
        <div
          className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #4F1E7B, transparent)" }}
        />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl glass border border-brand/30 text-brand flex items-center justify-center shrink-0">
              <Brain className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display italic lowercase text-xl text-ink leading-tight">
                what {agentName} remembers
              </h3>
              <p className="text-[10px] uppercase tracking-[0.28em] text-muted/70">
                Carried between every call
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Persistent thread */}
      <section className="rounded-2xl glass border border-white/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl glass border border-brand/30 text-brand flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-display italic lowercase text-lg text-ink leading-none">
                persistent thread
              </h4>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-0.5">
                {messageCount} message{messageCount === 1 ? "" : "s"} · the thread is the memory
              </p>
            </div>
          </div>
          {messageCount > 0 && (
            <button
              onClick={onClearMemory}
              className="shrink-0 inline-flex items-center gap-1.5 px-2.5 min-h-9 rounded-lg text-[10px] uppercase tracking-[0.18em] text-muted hover:text-rose-600 hover:bg-rose-500/8 transition-colors"
              title="Clear this agent's memory thread"
            >
              <Trash2 className="w-3 h-3" />
              Clear memory
            </button>
          )}
        </div>
        <p className="mt-3 text-[12px] text-muted leading-relaxed">
          Everything you discuss in the Chat tab persists here and is read back to {agentName} on
          every call, alongside the recent calls and learned patterns below.
        </p>
      </section>

      {/* Recent call recall */}
      <section className="rounded-2xl glass border border-white/10 p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-xl glass border border-brand/30 text-brand flex items-center justify-center shrink-0">
            <Phone className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-display italic lowercase text-lg text-ink leading-none">
              recent calls it recalls
            </h4>
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-0.5">
              Last {recentCalls.length || "few"} conversations
            </p>
          </div>
        </div>
        {recentCalls.length === 0 ? (
          <p className="py-6 text-center text-muted/70 text-[11px] leading-relaxed">
            No calls yet — once {agentName} takes calls, their summaries appear here as recall
            context.
          </p>
        ) : (
          <div className="space-y-2">
            {recentCalls.map((c, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="rounded-xl bg-black/[0.03] border border-black/8 p-3"
              >
                <p className="text-[13px] text-ink/90 leading-relaxed">
                  {c.summary || "Call handled — no summary captured."}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {c.intent && (
                    <span className="px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.14em] border border-brand/30 bg-brand/8 text-brand">
                      {c.intent}
                    </span>
                  )}
                  {c.sentiment && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.14em] border ${
                        SENTIMENT_TONE[c.sentiment.toLowerCase()] || SENTIMENT_TONE.neutral
                      }`}
                    >
                      {c.sentiment}
                    </span>
                  )}
                  {c.createdAt && (
                    <span className="text-[9px] uppercase tracking-[0.18em] text-muted/60 ml-auto">
                      {formatDate(c.createdAt)}
                    </span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Learned patterns */}
      {lessons.length > 0 && (
        <section className="rounded-2xl glass border border-white/10 p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#4F1E7B" }}
            >
              <Sparkles className="w-4 h-4 text-on-brand" strokeWidth={2.5} />
            </div>
            <div>
              <h4 className="font-display italic lowercase text-lg text-ink leading-none">
                patterns learned from calls
              </h4>
              <p className="text-[10px] uppercase tracking-[0.3em] text-emerald-500 mt-0.5">
                Auto-calibration
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {lessons.map((lesson) => (
              <div
                key={lesson.id}
                className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-3"
              >
                <p className="text-[13px] text-ink/90 leading-relaxed">{lesson.lesson}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Durable inputs summary → edit in Training */}
      <section className="rounded-2xl glass border border-white/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl glass border border-rose-500/30 text-rose-500 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-display italic lowercase text-lg text-ink leading-none">
                rules, facts &amp; personality
              </h4>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-0.5">
                {directives.length} rule{directives.length === 1 ? "" : "s"} · {knowledge.length}{" "}
                fact{knowledge.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <button
            onClick={onOpenTraining}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 min-h-9 rounded-lg text-[10px] uppercase tracking-[0.18em] text-brand hover:bg-brand/10 transition-colors"
          >
            <ArrowUpRight className="w-3 h-3" />
            <span className="hidden sm:inline">Manage in Training</span>
            <span className="sm:hidden">Train</span>
          </button>
        </div>
        {personality && (
          <p className="mt-3 font-display italic text-base text-ink/90 leading-snug">
            “{personality}”
          </p>
        )}
      </section>
    </div>
  );
}
