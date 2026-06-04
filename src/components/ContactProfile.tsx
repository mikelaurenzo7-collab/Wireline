/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useEffect, useState, useMemo, useId } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Calendar,
  Clock,
  DollarSign,
  Activity,
  ChevronLeft,
  ArrowUpRight,
  Sparkles,
  Target,
  AlertOctagon,
  Volume2,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import { formatDate, formatDateTime } from "../lib/safe-date";
import { formatMoney, safeFixed, formatPhone } from "../lib/safe-number";
import { ResponsiveContainer, AreaChart, Area } from "recharts";
import ClientRouteViewport from "./layout/ClientRouteViewport";
import ClientRouteLoading from "./layout/ClientRouteLoading";
import AppPageIntro from "./layout/AppPageIntro";
import { EmptyState } from "./ui/EmptyState";

interface ContactData {
  number: string;
  normalized: string;
  customer_name: string | null;
  stats: {
    total_calls: number;
    total_minutes: number;
    total_cost: number;
    avg_lead_score: number;
    last_touch: string | null;
    outbound_leads: number;
    appointments: number;
  };
  timeline: Array<{
    type: "call_in" | "call_out" | "appointment";
    id: string;
    ts: string;
    duration_seconds?: number;
    cost?: number;
    summary?: string;
    lead_score?: number;
    intent_label?: string;
    recording_url?: string;
    status?: string;
    agent_id?: string;
    sentiment?: string;
    coaching_note?: string;
    lesson_extracted?: boolean;
  }>;
  leads: any[];
  appointments: any[];
}

function computeSparkBuckets(
  events: ContactData["timeline"],
  key: "calls" | "minutes",
  numBuckets = 6,
): { v: number }[] {
  if (!events.length) return [];
  const now = Date.now();
  const oldest = new Date(events[events.length - 1].ts).getTime();
  const span = Math.max(now - oldest, 1);
  const bucketSize = span / numBuckets;
  const buckets = Array.from({ length: numBuckets }, () => ({ v: 0 }));
  events.forEach((e) => {
    const t = new Date(e.ts).getTime();
    const idx = Math.min(numBuckets - 1, Math.floor((t - oldest) / bucketSize));
    if (key === "calls") buckets[idx].v += 1;
    else buckets[idx].v += Math.round((e.duration_seconds || 0) / 60);
  });
  return buckets;
}

export default function ContactProfile() {
  const { number } = useParams();
  const sparkUid = useId();
  const [data, setData] = useState<ContactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!number) return;
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setErr(null);
    setData(null);
    (async () => {
      try {
        const r = await authFetch(`/api/contacts/${encodeURIComponent(number)}`, {
          signal: controller.signal,
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        if (active) setData(d);
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        if (active) setErr(e instanceof Error ? e.message : "Request failed");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [number]);

  const callSpark = useMemo(
    () => computeSparkBuckets(data?.timeline || [], "calls"),
    [data?.timeline],
  );
  const minuteSpark = useMemo(
    () => computeSparkBuckets(data?.timeline || [], "minutes"),
    [data?.timeline],
  );

  if (loading)
    return (
      <ClientRouteViewport className="items-center justify-center">
        <ClientRouteLoading icon={<Activity className="w-6 h-6" />} label="Loading contact" />
      </ClientRouteViewport>
    );

  if (err || !data)
    return (
      <ClientRouteViewport className="items-center justify-center">
        <EmptyState
          icon={AlertOctagon}
          eyebrow="Contact"
          title={err || "Contact not found"}
          description="This contact may have been merged or removed."
          actions={[{ label: "← Back to pipeline", to: "/pipeline" }]}
          accent="#e11d48"
        />
      </ClientRouteViewport>
    );

  const displayName = data.customer_name || formatPhone(data.number);
  const lastTouch = formatDate(data.stats.last_touch);
  const timeline = Array.isArray(data.timeline) ? data.timeline : [];
  const highIntent = data.stats.avg_lead_score >= 70;

  return (
    <ClientRouteViewport className="overflow-y-auto">
      <div className="max-w-[1200px] mx-auto space-y-4 sm:space-y-5 pb-6">
        <Link
          to="/pipeline"
          className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-muted hover:text-brand transition-colors min-h-10"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Pipeline
        </Link>

        <AppPageIntro
          eyebrow={`Contact · ${formatPhone(data.number)}`}
          title={displayName}
          subtitle={`Last touch · ${lastTouch}${highIntent ? " · High intent" : ""}`}
          actions={
            <>
              <ClaudeRecipeButton
                recipe="brief"
                initial={{
                  customerName: data.customer_name,
                  customerNumber: data.number,
                  reasonForCall:
                    timeline.find((e) => e.summary)?.summary || "Re-engage existing contact.",
                  pastInteractionSummary: timeline
                    .slice(0, 3)
                    .map((e) => e.summary)
                    .filter(Boolean)
                    .join(" · "),
                }}
                label="Pre-Call Brief"
              />
              {timeline.find((e) => e.type === "call_in" || e.type === "call_out") && (
                <ClaudeRecipeButton
                  recipe="qualify"
                  callId={timeline.find((e) => e.type === "call_in" || e.type === "call_out")!.id}
                  label="Qualify"
                />
              )}
            </>
          }
        />

        {highIntent && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/25">
            <Sparkles className="w-3.5 h-3.5 text-rose-600" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-rose-600 font-medium">
              High intent lead
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <StatCard
            label="Calls"
            value={String(data.stats.total_calls)}
            icon={Phone}
            accent="#8B3FD6"
            sparkData={callSpark.length >= 2 ? callSpark : undefined}
            gradientId={`${sparkUid}-calls`}
          />
          <StatCard
            label="Minutes"
            value={String(data.stats.total_minutes)}
            icon={Clock}
            accent="#8B3FD6"
            sparkData={minuteSpark.length >= 2 ? minuteSpark : undefined}
            gradientId={`${sparkUid}-minutes`}
          />
          <StatCard
            label="Avg Score"
            value={String(data.stats.avg_lead_score)}
            icon={Target}
            accent="#8B3FD6"
            gradientId={`${sparkUid}-score`}
          />
          <StatCard
            label="Spend"
            value={formatMoney(data.stats?.total_cost, 2)}
            icon={DollarSign}
            accent="#8B3FD6"
            gradientId={`${sparkUid}-spend`}
          />
        </div>

        <section className="wl-panel border border-black/8 rounded-md sm:rounded-md overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-black/6 flex items-center justify-between gap-3">
            <h2 className="font-display italic text-xl sm:text-2xl flex items-center gap-2 text-ink">
              <Activity className="w-5 h-5 text-brand shrink-0" />
              Timeline
            </h2>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted shrink-0">
              {timeline.length} events
            </span>
          </div>
          {timeline.length === 0 ? (
            <div className="py-6">
              <EmptyState
                icon={Activity}
                eyebrow="Timeline"
                title="No interactions yet"
                description="Calls and appointments will appear here."
              />
            </div>
          ) : (
            <div className="relative md:pl-8 md:before:absolute md:before:left-[1.65rem] md:before:top-4 md:before:bottom-4 md:before:w-px md:before:bg-black/8">
              <div className="divide-y divide-black/5 md:divide-y-0 md:space-y-0">
                {timeline.map((e) => (
                  <TimelineRow key={`${e.type}-${e.id}`} event={e} />
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </ClientRouteViewport>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  sparkData,
  gradientId,
}: {
  label: string;
  value: string;
  icon: any;
  accent: string;
  sparkData?: { v: number }[];
  gradientId: string;
}) {
  return (
    <div className="relative rounded-md sm:rounded-md wl-panel border border-black/8 p-4 sm:p-5 overflow-hidden">
      <div
        className="absolute -top-10 -right-10 w-28 h-28 rounded-full opacity-15 blur-3xl pointer-events-none"
        style={{ background: `radial-gradient(circle, ${accent}, transparent)` }}
      />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted">{label}</p>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        <p className="font-display italic text-2xl sm:text-3xl lg:text-4xl text-ink leading-none tabular-nums">
          {value}
        </p>
        {sparkData && (
          <div className="mt-2 -mx-1">
            <ResponsiveContainer width="100%" height={24}>
              <AreaChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={accent}
                  strokeWidth={1.5}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

const TimelineRow: React.FC<{ event: ContactData["timeline"][number] }> = ({ event }) => {
  const isCall = event.type === "call_in" || event.type === "call_out";
  const Icon =
    event.type === "call_in" ? PhoneIncoming : event.type === "call_out" ? PhoneOutgoing : Calendar;
  return (
    <Link
      to={isCall ? "/phone" : "/phone?tab=appointments"}
      className="group relative block px-4 sm:px-6 py-4 sm:py-5 md:pl-6 hover:bg-black/[0.02] transition-colors"
    >
      <div className="hidden md:block absolute left-[-1.35rem] top-6 w-2.5 h-2.5 rounded-full bg-paper border-2 border-brand/40 group-hover:border-brand transition-colors" />
      <div className="flex items-start gap-3 sm:gap-4">
        <div
          className={cn(
            "shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-md border flex items-center justify-center transition-all",
            event.type === "call_in" && "border-brand/30 bg-brand/8 text-brand",
            event.type === "call_out" && "border-brand-2/30 bg-brand-2/8 text-brand-deep",
            event.type === "appointment" &&
              "border-emerald-500/30 bg-emerald-500/8 text-emerald-600",
          )}
        >
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted">
              {event.type === "call_in"
                ? "Inbound call"
                : event.type === "call_out"
                  ? "Outbound call"
                  : "Appointment"}
            </span>
            {event.lead_score !== undefined && event.lead_score > 0 && (
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.25em]",
                  event.lead_score >= 70
                    ? "bg-rose-500/15 text-rose-500 border border-rose-500/30"
                    : event.lead_score >= 50
                      ? "bg-brand/15 text-brand border border-brand/30"
                      : "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
                )}
              >
                {event.lead_score}/100
              </span>
            )}
            <span className="text-[10px] text-muted">{formatDateTime(event.ts)}</span>
          </div>
          <p className="text-sm text-ink/85 mt-2 line-clamp-2">{event.summary}</p>
          {isCall && (
            <>
              <div className="flex items-center gap-3 mt-2 text-[10px] uppercase tracking-[0.3em] text-muted">
                {event.duration_seconds !== undefined && (
                  <span>
                    {Math.floor((event.duration_seconds || 0) / 60)}m{" "}
                    {(event.duration_seconds || 0) % 60}s
                  </span>
                )}
                {event.cost !== undefined && event.cost > 0 && (
                  <>
                    <span>·</span>
                    <span>${safeFixed(event.cost, 3)}</span>
                  </>
                )}
                {event.intent_label && (
                  <>
                    <span>·</span>
                    <span>{event.intent_label} intent</span>
                  </>
                )}
                {event.sentiment && (
                  <>
                    <span>·</span>
                    <span>{event.sentiment}</span>
                  </>
                )}
              </div>
              {event.coaching_note && (
                <p className="text-[11px] text-ink/40 mt-1 line-clamp-1">{event.coaching_note}</p>
              )}
              {event.lesson_extracted && (
                <span className="inline-block mt-1 text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                  Lesson captured
                </span>
              )}
              {event.recording_url && (
                <a
                  href={event.recording_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 mt-1.5 px-2 py-1 rounded-full bg-brand/8 border border-brand/20 text-brand text-[8px] uppercase tracking-[0.25em] hover:bg-brand/15 hover:border-brand/35 transition-all"
                >
                  <Volume2 className="w-2.5 h-2.5" /> Listen to recording
                </a>
              )}
            </>
          )}
        </div>
        <ArrowUpRight className="w-4 h-4 text-muted shrink-0 mt-1 group-hover:text-brand group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all hidden sm:block" />
      </div>
    </Link>
  );
};
