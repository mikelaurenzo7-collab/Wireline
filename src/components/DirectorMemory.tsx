/**
 * DirectorMemory — the "Memory" tab inside the Director workspace.
 *
 * The Director's recall, account-wide. Where an agent's Memory shows what THAT
 * agent carries between calls, the Director's shows what it carries about the
 * whole operation: the persistent strategy thread, the fleet it manages, the
 * last-7-day activity, the latest calls across every agent, and the business
 * brief that grounds its advice. Read-mostly — the only write is "clear
 * memory" (delegated to the parent) and a jump to Training to edit the brief.
 */
import { motion } from "motion/react";
import {
  Brain,
  Sparkles,
  Users,
  Activity,
  Phone,
  Trash2,
  ArrowUpRight,
  Loader2,
  GraduationCap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDate } from "../lib/safe-date";
import type {
  DirectorFleetItem,
  DirectorProfileData,
  DirectorRecentCall,
} from "./DirectorWorkspace";

interface Props {
  fleet: DirectorFleetItem[];
  stats: { calls7d: number; bookings7d: number } | null;
  profile: DirectorProfileData | null;
  recentCalls: DirectorRecentCall[];
  messageCount: number;
  loading: boolean;
  onClearMemory: () => void;
  onOpenTraining: () => void;
}

const SENTIMENT_TONE: Record<string, string> = {
  positive: "text-emerald-700 bg-emerald-500/10 border-emerald-500/30",
  neutral: "text-muted bg-black/5 border-black/10",
  negative: "text-rose-700 bg-rose-500/10 border-rose-500/30",
};

function roleLabel(role: string | null): string {
  if (!role) return "Agent";
  return role.replace(/_/g, " ");
}

export default function DirectorMemory({
  fleet,
  stats,
  profile,
  recentCalls,
  messageCount,
  loading,
  onClearMemory,
  onOpenTraining,
}: Props) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const briefFilled = !!(
    profile?.businessName ||
    profile?.industry ||
    profile?.offerings ||
    profile?.primaryGoal ||
    profile?.notes
  );

  return (
    <div className="p-4 space-y-4">
      {/* Hero */}
      <section className="rounded-2xl glass border border-white/10 p-4 relative overflow-hidden">
        <div
          className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, #4F1E7B, transparent)" }}
        />
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl glass border border-brand/30 text-brand flex items-center justify-center shrink-0">
            <Brain className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display italic lowercase text-xl text-ink leading-tight">
              what your Director remembers
            </h3>
            <p className="text-[10px] uppercase tracking-[0.28em] text-muted/70">
              Across your whole operation
            </p>
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
                strategy thread
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
              title="Clear the Director's memory thread"
            >
              <Trash2 className="w-3 h-3" />
              Clear memory
            </button>
          )}
        </div>
        <p className="mt-3 text-[12px] text-muted leading-relaxed">
          Everything you discuss in the Chat tab persists here and is read back to your Director on
          every turn, alongside the brief, fleet and activity below.
        </p>
      </section>

      {/* 7-day activity */}
      <section className="rounded-2xl glass border border-white/10 p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-xl glass border border-emerald-500/30 text-emerald-600 flex items-center justify-center shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <h4 className="font-display italic lowercase text-lg text-ink leading-none">
            last 7 days
          </h4>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Calls" value={stats?.calls7d ?? 0} />
          <Stat label="Bookings" value={stats?.bookings7d ?? 0} />
          <Stat label="Agents" value={fleet.length} />
        </div>
      </section>

      {/* Fleet snapshot */}
      <section className="rounded-2xl glass border border-white/10 p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl glass border border-brand/30 text-brand flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <h4 className="font-display italic lowercase text-lg text-ink leading-none">
              the fleet it manages
            </h4>
          </div>
          <button
            onClick={() => navigate("/agents")}
            className="shrink-0 inline-flex items-center gap-1.5 text-[11px] text-brand hover:text-brand/80 transition-colors"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Manage
          </button>
        </div>
        {fleet.length === 0 ? (
          <p className="py-4 text-center text-muted/70 text-[11px] leading-relaxed">
            No agents yet. Ask your Director who to hire first — it&apos;ll help you stand one up.
          </p>
        ) : (
          <div className="space-y-1.5">
            {fleet.map((a) => (
              <button
                key={a.id}
                onClick={() => navigate(`/chat/${a.id}`)}
                className="w-full flex items-center gap-2.5 rounded-xl border border-black/8 bg-paper/50 px-3 py-2 text-left hover:border-brand/30 transition-colors"
              >
                <span className="shrink-0 w-7 h-7 rounded-full bg-paper border border-black/12 text-ink text-[11px] font-semibold flex items-center justify-center">
                  {(a.name || "A").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-ink truncate">
                    {a.name || "Unnamed agent"}
                  </span>
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-muted/70">
                    {roleLabel(a.role)}
                  </span>
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted/60 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Recent calls across the fleet */}
      <section className="rounded-2xl glass border border-white/10 p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl glass border border-brand/30 text-brand flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4" />
            </div>
            <h4 className="font-display italic lowercase text-lg text-ink leading-none">
              latest calls
            </h4>
          </div>
          <button
            onClick={() => navigate("/logs")}
            className="shrink-0 inline-flex items-center gap-1.5 text-[11px] text-brand hover:text-brand/80 transition-colors"
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            All call logs
          </button>
        </div>
        {recentCalls.length === 0 ? (
          <p className="py-4 text-center text-muted/70 text-[11px] leading-relaxed">
            No calls yet. Once your fleet starts taking calls, the latest land here.
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
                  {c.summary || c.outcome || "Call handled — no summary captured."}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {c.intent && c.intent !== "none" && (
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

      {/* Business brief summary → edit in Training */}
      <section className="rounded-2xl glass border border-white/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl glass border border-brand/30 text-brand flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-display italic lowercase text-lg text-ink leading-none">
                business brief
              </h4>
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted/70 mt-0.5">
                {briefFilled ? "Grounds every reply" : "Not filled in yet"}
              </p>
            </div>
          </div>
          <button
            onClick={onOpenTraining}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 min-h-9 rounded-lg text-[10px] uppercase tracking-[0.18em] text-brand hover:bg-brand/10 transition-colors"
          >
            <ArrowUpRight className="w-3 h-3" />
            Edit
          </button>
        </div>
        {briefFilled ? (
          <dl className="mt-3 space-y-1.5">
            {profile?.businessName && <BriefRow label="Business" value={profile.businessName} />}
            {profile?.industry && <BriefRow label="Industry" value={profile.industry} />}
            {profile?.primaryGoal && <BriefRow label="Goal" value={profile.primaryGoal} />}
          </dl>
        ) : (
          <p className="mt-3 text-[12px] text-muted leading-relaxed">
            Tell your Director about your business so its advice is specific to you.
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-black/8 bg-paper/50 px-2 py-3 flex flex-col items-center text-center">
      <span className="text-[20px] font-display leading-none text-ink tabular-nums">{value}</span>
      <span className="mt-1 text-[9px] uppercase tracking-[0.16em] text-muted/70">{label}</span>
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-[12px] leading-relaxed">
      <dt className="shrink-0 text-muted/70 w-16">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink/90">{value}</dd>
    </div>
  );
}
