/* eslint-disable @typescript-eslint/no-explicit-any -- agent-config + overview rows aren't shared as client types yet. */
/**
 * AgentMemoryPanel — the "Memory" tab inside an agent's chat workspace.
 */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Brain, Sparkles, Phone, ShieldAlert, Trash2, ArrowUpRight } from "lucide-react";
import { authFetch } from "../lib/api";
import { formatDate } from "../lib/safe-date";
import ClientRouteLoading from "./layout/ClientRouteLoading";
import { ShadButton } from "./ui/shadcn/ShadButton";

interface AgentMemoryPanelProps {
  agentId: string;
  agentName: string;
  messageCount: number;
  onClearMemory: () => void;
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
  positive: "text-brand bg-brand/10 border-brand/30",
  neutral: "text-muted bg-black/5 border-border",
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
      <ClientRouteLoading
        icon={<Brain className="w-6 h-6" />}
        label="Loading memory"
        className="py-16"
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <section className="rounded-md wl-panel-elevated border border-border p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-md wl-panel border border-brand/30 text-brand flex items-center justify-center shrink-0">
              <Brain className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display italic lowercase text-xl text-ink leading-tight">
                what {agentName} remembers
              </h3>
              <p className="text-[10px] uppercase tracking-[0.28em] text-ink/40">
                Carried between every call
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md wl-panel border border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md wl-panel border border-brand/30 text-brand flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-display italic lowercase text-lg text-ink leading-none">
                persistent thread
              </h4>
              <p className="text-[10px] uppercase tracking-[0.3em] text-ink/40 mt-0.5">
                {messageCount} message{messageCount === 1 ? "" : "s"} · the thread is the memory
              </p>
            </div>
          </div>
          {messageCount > 0 && (
            <ShadButton
              type="button"
              variant="ghost"
              size="sm"
              disableAnimations
              onClick={onClearMemory}
              className="shrink-0 min-h-9 text-[10px] uppercase tracking-[0.18em] text-muted hover:text-rose-600 hover:bg-rose-500/8"
              title="Clear this agent's memory thread"
            >
              <Trash2 className="w-3 h-3" />
              Clear memory
            </ShadButton>
          )}
        </div>
        <p className="mt-3 text-[12px] text-muted leading-relaxed">
          Everything you discuss in the Chat tab persists here and is read back to {agentName} on
          every call, alongside the recent calls and learned patterns below.
        </p>
      </section>

      <section className="rounded-md wl-panel border border-border p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-md wl-panel border border-brand/30 text-brand flex items-center justify-center shrink-0">
            <Phone className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-display italic lowercase text-lg text-ink leading-none">
              recent calls it recalls
            </h4>
            <p className="text-[10px] uppercase tracking-[0.3em] text-ink/40 mt-0.5">
              Last {recentCalls.length || "few"} conversations
            </p>
          </div>
        </div>
        {recentCalls.length === 0 ? (
          <p className="py-6 text-center text-ink/40 text-[11px] leading-relaxed">
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
                className="rounded-md bg-black/[0.03] border border-border p-3"
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

      {lessons.length > 0 && (
        <section className="rounded-md wl-panel border border-border p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-md bg-brand flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-on-brand" strokeWidth={2.5} />
            </div>
            <div>
              <h4 className="font-display italic lowercase text-lg text-ink leading-none">
                patterns learned from calls
              </h4>
              <p className="text-[10px] uppercase tracking-[0.3em] text-brand mt-0.5">
                Auto-calibration
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {lessons.map((lesson) => (
              <div key={lesson.id} className="rounded-md bg-brand/8 border border-brand/20 p-3">
                <p className="text-[13px] text-ink/90 leading-relaxed">{lesson.lesson}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-md wl-panel border border-border p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md wl-panel border border-rose-500/30 text-rose-500 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-display italic lowercase text-lg text-ink leading-none">
                rules, facts &amp; personality
              </h4>
              <p className="text-[10px] uppercase tracking-[0.3em] text-ink/40 mt-0.5">
                {directives.length} rule{directives.length === 1 ? "" : "s"} · {knowledge.length}{" "}
                fact{knowledge.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <ShadButton
            type="button"
            variant="ghost"
            size="sm"
            disableAnimations
            onClick={onOpenTraining}
            className="shrink-0 min-h-9 text-[10px] uppercase tracking-[0.18em] text-brand hover:bg-brand/10"
          >
            <ArrowUpRight className="w-3 h-3" />
            <span className="hidden sm:inline">Manage in Training</span>
            <span className="sm:hidden">Train</span>
          </ShadButton>
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
