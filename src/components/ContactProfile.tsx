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
import ClientToolbar from "./layout/ClientToolbar";
import AppPageIntro from "./layout/AppPageIntro";
import { EmptyState } from "./ui/EmptyState";
import { OPS_CHANNEL_EMPTY, OPS_CHANNEL_TOOLBAR } from "../lib/wireline-ops-design";
import { BRAND } from "../constants/brand-colors";

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
        <ClientRouteLoading
          icon={<Activity className="w-6 h-6" />}
          label={OPS_CHANNEL_TOOLBAR.contact.loading}
        />
      </ClientRouteViewport>
    );

  if (err || !data)
    return (
      <ClientRouteViewport className="items-center justify-center">
        <EmptyState
          icon={AlertOctagon}
          eyebrow={OPS_CHANNEL_EMPTY.contactNotFound.eyebrow}
          title={err || OPS_CHANNEL_EMPTY.contactNotFound.title}
          description={OPS_CHANNEL_EMPTY.contactNotFound.description}
          actions={[...OPS_CHANNEL_EMPTY.contactNotFound.actions]}
        />
      </ClientRouteViewport>
    );

  const displayName = data.customer_name || formatPhone(data.number);
  const lastTouch = formatDate(data.stats.last_touch);
  const timeline = Array.isArray(data.timeline) ? data.timeline : [];
  const highIntent = data.stats.avg_lead_score >= 70;

  return (
    <ClientRouteViewport scroll>
      <div className="max-w-[1200px] mx-auto space-y-4 sm:space-y-5 pb-6">
        <ClientToolbar
          left={
            <span className="app-toolbar-stat">
              {OPS_CHANNEL_TOOLBAR.contact.stat(timeline.length)}
            </span>
          }
        />

        <Link
          to="/pipeline"
          className="inline-flex items-center gap-2 wl-label-muted hover:text-brand transition-colors min-h-10"
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
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand/10 border border-brand/25">
            <Sparkles className="w-3.5 h-3.5 text-brand" aria-hidden />
            <span className="wl-label text-brand font-medium">High intent lead</span>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <StatCard
            label="Calls"
            value={String(data.stats.total_calls)}
            icon={Phone}
            accent={BRAND.purple}
            sparkData={callSpark.length >= 2 ? callSpark : undefined}
            gradientId={`${sparkUid}-calls`}
          />
          <StatCard
            label="Minutes"
            value={String(data.stats.total_minutes)}
            icon={Clock}
            accent={BRAND.purple}
            sparkData={minuteSpark.length >= 2 ? minuteSpark : undefined}
            gradientId={`${sparkUid}-minutes`}
          />
          <StatCard
            label="Avg Score"
            value={String(data.stats.avg_lead_score)}
            icon={Target}
            accent={BRAND.purple}
            gradientId={`${sparkUid}-score`}
          />
          <StatCard
            label="Spend"
            value={formatMoney(data.stats?.total_cost, 2)}
            icon={DollarSign}
            accent={BRAND.purple}
            gradientId={`${sparkUid}-spend`}
          />
        </div>

        <section className="wl-panel rounded-md sm:rounded-md overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between gap-3">
            <h2 className="font-display italic text-xl sm:text-2xl flex items-center gap-2 text-ink">
              <Activity className="w-5 h-5 text-brand shrink-0" />
              Timeline
            </h2>
            <span className="wl-label-muted shrink-0">{timeline.length} events</span>
          </div>
          {timeline.length === 0 ? (
            <div className="py-6">
              <EmptyState
                icon={Activity}
                eyebrow={OPS_CHANNEL_EMPTY.contactTimeline.eyebrow}
                title={OPS_CHANNEL_EMPTY.contactTimeline.title}
                description={OPS_CHANNEL_EMPTY.contactTimeline.description}
                actions={[...OPS_CHANNEL_EMPTY.contactTimeline.actions]}
                density="compact"
                withHalo={false}
              />
            </div>
          ) : (
            <div className="relative md:pl-8 md:before:absolute md:before:left-[1.65rem] md:before:top-4 md:before:bottom-4 md:before:w-px md:before:bg-border">
              <div className="divide-y divide-border md:divide-y-0 md:space-y-0">
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
    <div
      className="relative rounded-md sm:rounded-md wl-panel p-4 sm:p-5 overflow-hidden"
      data-accent={accent}
    >
      <div className="absolute -top-10 -right-10 w-28 h-28 rounded-full opacity-15 blur-3xl pointer-events-none wl-accent-halo" />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <p className="wl-label-muted">{label}</p>
          <Icon className="w-4 h-4 wl-accent-text" />
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
      className="group relative block px-4 sm:px-6 py-3 sm:py-3.5 md:pl-6 hover:bg-black/[0.02] transition-colors"
    >
      <div className="hidden md:block absolute left-[-1.35rem] top-6 w-2.5 h-2.5 rounded-full bg-paper border-2 border-brand/40 group-hover:border-brand transition-colors" />
      <div className="flex items-start gap-3 sm:gap-4">
        <div
          className={cn(
            "shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-md border flex items-center justify-center transition-all",
            event.type === "call_in" && "border-brand/30 bg-brand/8 text-brand",
            event.type === "call_out" && "border-brand-2/30 bg-brand-2/8 text-brand-deep",
            event.type === "appointment" && "wl-status-success wl-text-success",
          )}
        >
          <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="wl-label-muted">
              {event.type === "call_in"
                ? "Inbound call"
                : event.type === "call_out"
                  ? "Outbound call"
                  : "Appointment"}
            </span>
            {event.lead_score !== undefined && event.lead_score > 0 && (
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full wl-label",
                  event.lead_score >= 70
                    ? "bg-rose-500/15 text-rose-500 border border-rose-500/30"
                    : event.lead_score >= 50
                      ? "bg-brand/15 text-brand border border-brand/30"
                      : "bg-muted/20 text-muted border border-border",
                )}
              >
                {event.lead_score}/100
              </span>
            )}
            <span className="wl-micro-meta--muted">{formatDateTime(event.ts)}</span>
          </div>
          <p className="text-sm text-ink/85 mt-2 line-clamp-2">{event.summary}</p>
          {isCall && (
            <>
              <div className="flex items-center gap-3 mt-2 wl-label-muted">
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
                <span className="inline-block mt-1 wl-micro-badge px-1.5 py-0.5 rounded wl-status-success wl-text-success border border-[color-mix(in_srgb,var(--wl-signal)_20%,transparent)]">
                  Lesson captured
                </span>
              )}
              {event.recording_url && (
                <a
                  href={event.recording_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 mt-1.5 px-2 py-1 rounded-full bg-brand/8 border border-brand/20 text-brand wl-label hover:bg-brand/15 hover:border-brand/35 transition-all"
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
