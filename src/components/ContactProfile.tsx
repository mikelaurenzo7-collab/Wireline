import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  Phone, PhoneIncoming, PhoneOutgoing, Calendar, Mic, Clock, DollarSign,
  Activity, ChevronLeft, Loader2, ArrowUpRight, Sparkles, User, Target,
  TrendingUp, AlertOctagon
} from "lucide-react";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";
import { ClaudeRecipeButton } from "./ClaudeRecipes";
import { formatDate, formatDateTime } from "../lib/safe-date";

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
  }>;
  leads: any[];
  appointments: any[];
}

export default function ContactProfile() {
  const { number } = useParams();
  const [data, setData] = useState<ContactData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!number) return;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const r = await authFetch(`/api/contacts/${encodeURIComponent(number)}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setData(d);
      } catch (e: any) { setErr(e.message); } finally { setLoading(false); }
    })();
  }, [number]);

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="w-10 h-10 animate-spin text-brand" />
    </div>
  );

  if (err || !data) return (
    <div className="h-full flex flex-col items-center justify-center gap-4">
      <AlertOctagon className="w-12 h-12 text-rose-500/60" />
      <p className="text-[11px] uppercase tracking-[0.4em] text-rose-500">{err || "Contact not found"}</p>
      <Link to="/" className="text-[11px] uppercase tracking-[0.3em] text-muted hover:text-brand">← Back to Atlas</Link>
    </div>
  );

  const displayName = data.customer_name || data.number;
  const lastTouch = formatDate(data.stats.last_touch);

  return (
    <div className="h-full overflow-y-auto scrollbar-hide w-full max-w-[1500px] mx-auto space-y-4">
      <Link to="/" className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-muted hover:text-brand transition-colors">
        <ChevronLeft className="w-3.5 h-3.5" /> Back
      </Link>

      <motion.header
        initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        className="space-y-6"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="px-3 py-1.5 rounded-full glass border border-white/8 flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-brand" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-ink/80">Contact Profile</span>
          </div>
          {data.stats.avg_lead_score >= 70 && (
            <div className="px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-rose-500" />
              <span className="text-[10px] uppercase tracking-[0.3em] text-rose-500">High intent</span>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-[10px] uppercase tracking-[0.6em] text-muted">{data.number}</p>
          <h1 className="font-display italic text-6xl md:text-7xl lg:text-[6.5rem] leading-[0.9] tracking-tight text-ink">
            {displayName}
          </h1>
          <p className="text-ink/55 text-sm">Last touch · {lastTouch}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ClaudeRecipeButton
            recipe="brief"
            initial={{
              customerName: data.customer_name,
              customerNumber: data.number,
              reasonForCall: data.timeline.find((e) => e.summary)?.summary || "Re-engage existing contact.",
              pastInteractionSummary: data.timeline.slice(0, 3).map((e) => e.summary).filter(Boolean).join(" · "),
            }}
            label="Pre-Call Brief"
          />
          {data.timeline.find((e) => e.type === "call_in" || e.type === "call_out") && (
            <ClaudeRecipeButton
              recipe="qualify"
              callId={data.timeline.find((e) => e.type === "call_in" || e.type === "call_out")!.id}
              label="Qualify"
            />
          )}
        </div>
      </motion.header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Calls"       value={String(data.stats.total_calls)}            icon={Phone}      accent="#0AC8D4" />
        <StatCard label="Minutes"     value={String(data.stats.total_minutes)}          icon={Clock}      accent="#9B59F5" />
        <StatCard label="Avg Score"   value={String(data.stats.avg_lead_score)}         icon={Target}     accent="#E040C0" />
        <StatCard label="Spend"       value={`$${data.stats.total_cost.toFixed(2)}`}    icon={DollarSign} accent="#10B981" />
      </div>

      {/* Timeline */}
      <div className="relative aurora-ring rounded-3xl">
        <div className="relative rounded-3xl glass overflow-hidden">
          <div className="px-7 py-5 border-b border-white/8 flex items-center justify-between">
            <h2 className="font-display italic text-3xl flex items-center gap-3">
              <Activity className="w-5 h-5 text-brand" />
              Timeline
            </h2>
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted">{data.timeline.length} events</span>
          </div>
          {data.timeline.length === 0 ? (
            <div className="p-16 text-center text-muted/60 text-[11px] uppercase tracking-[0.4em]">No interactions on file.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {data.timeline.map((e) => <TimelineRow key={`${e.type}-${e.id}`} event={e} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent: string }) {
  return (
    <div className="relative aurora-ring rounded-2xl">
      <div className="relative rounded-2xl glass border border-white/10 p-5 overflow-hidden">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-20 blur-3xl pointer-events-none" style={{ background: `radial-gradient(circle, ${accent}, transparent)` }} />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-[0.3em] text-muted">{label}</p>
            <Icon className="w-4 h-4" style={{ color: accent }} />
          </div>
          <p className="font-display italic text-4xl text-ink leading-none">{value}</p>
        </div>
      </div>
    </div>
  );
}

const TimelineRow: React.FC<{ event: ContactData["timeline"][number] }> = ({ event }) => {
  const isCall = event.type === "call_in" || event.type === "call_out";
  const Icon = event.type === "call_in" ? PhoneIncoming :
               event.type === "call_out" ? PhoneOutgoing :
               Calendar;
  return (
    <Link
      to={isCall ? "/logs" : "/appointments"}
      className="group relative px-7 py-5 flex items-start gap-5 hover:bg-white/2 transition-all overflow-hidden"
    >
      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-brand/0 to-transparent group-hover:via-brand/60 transition-all" />
      <div className={cn(
        "shrink-0 w-12 h-12 rounded-2xl glass border flex items-center justify-center transition-all",
        event.type === "call_in" && "border-brand/30 text-brand",
        event.type === "call_out" && "border-brand-2/30 text-brand-2",
        event.type === "appointment" && "border-emerald-500/30 text-emerald-500",
      )}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.3em] text-muted">
            {event.type === "call_in" ? "Inbound call" : event.type === "call_out" ? "Outbound call" : "Appointment"}
          </span>
          {event.lead_score !== undefined && event.lead_score > 0 && (
            <span className={cn(
              "px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.25em]",
              event.lead_score >= 70 ? "bg-rose-500/15 text-rose-500 border border-rose-500/30" :
              event.lead_score >= 50 ? "bg-brand/15 text-brand border border-brand/30" :
              "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
            )}>{event.lead_score}/100</span>
          )}
          <span className="text-[10px] text-muted">{formatDateTime(event.ts)}</span>
        </div>
        <p className="text-sm text-ink/85 mt-2 line-clamp-2">{event.summary}</p>
        {isCall && (
          <div className="flex items-center gap-3 mt-2 text-[10px] uppercase tracking-[0.3em] text-muted">
            {event.duration_seconds !== undefined && (
              <span>{Math.floor((event.duration_seconds || 0) / 60)}m {(event.duration_seconds || 0) % 60}s</span>
            )}
            {event.cost !== undefined && event.cost > 0 && (
              <><span>·</span><span>${Number(event.cost).toFixed(3)}</span></>
            )}
            {event.intent_label && <><span>·</span><span>{event.intent_label} intent</span></>}
          </div>
        )}
      </div>
      <ArrowUpRight className="w-4 h-4 text-muted shrink-0 group-hover:text-brand group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
    </Link>
  );
}
