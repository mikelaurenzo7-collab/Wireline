import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  LayoutGrid, Activity, ShieldCheck, RefreshCw, 
  Terminal, Zap, Globe, Cpu, Lock, Bell
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell
} from "recharts";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { log } from "../lib/server-context";
import { authFetch } from "../lib/api";
import { LiveMonitor } from "../components/CommandCenter/LiveMonitor";
import { ActionFeed } from "../components/CommandCenter/ActionFeed";
import { PageTransition } from "../components/layout/PageTransition";
import { clsx } from "clsx";

// ─── Types ───────────────────────────────────────────────────────────────────

type SignalPresence = {
  id: string;
  customer_number: string;
  label: string;
  urgency: number;
  status: "active" | "escalated";
  started_at: string;
};

type LiveCall = {
  id: string;
  customer_number: string;
  sentiment_label: string;
  urgency: number;
  status: "active" | "escalated";
  thought?: string;
};

type ActionItem = {
  id: string;
  type: "send_email" | "schedule_calendar" | "update_crm_lead" | "create_internal_task";
  priority: "high" | "medium" | "low";
  status: "pending" | "completed" | "failed";
  description: string;
  created_at: string;
  payload?: any;
  reasoning?: string;
};

type LeadDossier = {
  customer_number: string;
  full_name?: string;
  company?: string;
  job_title?: string;
  bio?: string;
  linked_in_url?: string;
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const SENTIMENT_COLORS = {
  positive: "#10b981", // emerald-500
  neutral: "#6366f1",  // indigo-500
  negative: "#f43f5e", // rose-500
};

// ─── Main Component ────────────────────────────────────────────────────────────

export default function CommandCenter() {
  const { user } = useAuth();
  const [calls, setCalls] = useState<LiveCall[]>([]);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [dossiers, setDossiers] = useState<Record<string, LeadDossier>>({});
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const fetchPresence = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("wireline_signal_presence")
      .select("*")
      .eq("user_id", user.id);

    if (error) {
      log.error("Failed to fetch live presence", { error });
      return;
    }

    if (mountedRef.current) {
      setCalls((data || []).map(s => ({
        id: s.id,
        customer_number: s.customer_number,
        sentiment_label: s.label || "Connected",
        urgency: s.urgency || 0,
        status: s.status === 'escalated' ? 'escalated' : 'active'
      })));
      
      // Fetch dossiers for new numbers
      const numbers = data?.map(s => s.customer_number).filter(n => !dossiers[n]) || [];
      if (numbers.length > 0) {
        const { data: dossData } = await supabase
          .from('wireline_lead_dossiers')
          .select('*')
          .in('customer_number', numbers);
        
        if (dossData) {
          const newDoss: Record<string, LeadDossier> = {};
          dossData.forEach(d => { newDoss[d.customer_number] = d; });
          setDossiers(prev => ({ ...prev, ...newDoss }));
        }
      }
    }
  }, [user, dossiers]);

  const fetchAll = useCallback(async () => {
    if (!user) return;
    try {
      const [actionsRes, statsRes] = await Promise.all([
        authFetch("/api/fleet/tasks"),
        authFetch("/api/fleet/stats"),
      ]);

      const actionsData = await actionsRes.json();
      const statsData = await statsRes.json();

      if (mountedRef.current) {
        setActions((actionsData || []).map((t: any) => ({
          id: t.id,
          type: t.task_type,
          priority: t.priority,
          status: t.status === "completed" ? "completed" : t.status === "cancelled" ? "failed" : "pending",
          description: t.description ?? t.task_type,
          created_at: t.created_at,
          payload: t.payload,
          reasoning: t.resolution_notes
        })));
        setStats(statsData);
      }
    } catch (err) {
      log.error("Command Center data fetch failed", { err });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    fetchAll();
    fetchPresence();

    const channel = supabase
      .channel("command-center-presence")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wireline_signal_presence",
          filter: `user_id=eq.${user?.id}`,
        },
        () => fetchPresence(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wireline_fleet_tasks",
          filter: `user_id=eq.${user?.id}`,
        },
        () => fetchAll(),
      )
      .subscribe();

    const slowTimer = setInterval(fetchAll, 60_000);
    
    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
      clearInterval(slowTimer);
    };
  }, [fetchAll, fetchPresence, user]);

  const refresh = async () => {
    setIsRefreshing(true);
    await fetchAll();
    await fetchPresence();
    setIsRefreshing(false);
  };

  const sentimentData = stats
    ? [
        { name: "Positive", value: stats.sentimentBreakdown?.positive ?? 0, color: SENTIMENT_COLORS.positive },
        { name: "Neutral", value: stats.sentimentBreakdown?.neutral ?? 0, color: SENTIMENT_COLORS.neutral },
        { name: "Negative", value: stats.sentimentBreakdown?.negative ?? 0, color: SENTIMENT_COLORS.negative },
      ].filter((d) => d.value > 0)
    : [];

  const totalSentiment = sentimentData.reduce((s, d) => s + d.value, 0);

  return (
    <PageTransition>
      <div className="max-w-[1600px] mx-auto space-y-8 pb-12">
        {/* Elite Command Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-black/5">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-2 w-2 rounded-full bg-brand animate-pulse" />
              <span className="text-[10px] uppercase tracking-[0.4em] font-bold text-muted">System Active</span>
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-ink flex items-baseline gap-3">
              Wireline OS
              <span className="text-sm font-mono font-medium text-muted/40 tracking-normal">v4.7.2-stable</span>
            </h1>
            <p className="text-sm text-muted max-w-lg leading-relaxed">
              Autonomous Omnichannel Command. Real-time telemetry and intelligence hub.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={async () => {
                try {
                  const res = await authFetch("/api/jobs/prospect", { method: 'POST' });
                  if (res.ok) alert("Autonomous Growth Engine Activated! Sourcing new leads...");
                } catch (e) {
                  alert("Failed to activate growth engine. Check network.");
                }
              }}
              className="flex items-center gap-2 px-6 py-3 bg-brand text-white rounded-2xl hover:bg-brand-2 transition-all shadow-xl shadow-brand/20 active:scale-95"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span className="text-xs font-black uppercase tracking-widest">Activate Growth</span>
            </button>

            <div className="hidden xl:flex items-center gap-6 px-6 py-3 bg-black/[0.02] border border-black/5 rounded-2xl">
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider text-muted font-bold">Network Load</span>
                <span className="text-xs font-mono font-bold text-brand">0.02ms Latency</span>
              </div>
              <div className="w-px h-6 bg-black/5" />
              <div className="flex flex-col">
                <span className="text-[9px] uppercase tracking-wider text-muted font-bold">Active Agents</span>
                <span className="text-xs font-mono font-bold text-brand">12 Online</span>
              </div>
            </div>

            <button
              onClick={refresh}
              disabled={isRefreshing || loading}
              className="brutal-btn !p-3 !rounded-2xl"
              aria-label="Refresh"
            >
              <RefreshCw className={clsx("w-5 h-5", isRefreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
          
          {/* Left Column: Live Monitor (8/12) */}
          <div className="xl:col-span-8 space-y-8">
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-brand/20 to-brand-2/20 rounded-[2.5rem] blur opacity-25 group-hover:opacity-40 transition duration-1000" />
              <div className="relative glass border-black/5 rounded-[2rem] p-8 min-h-[400px]">
                <LiveMonitor calls={calls} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Analytics: Sentiment */}
              <div className="glass border-black/5 rounded-[2rem] p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-[10px] uppercase tracking-[0.4em] font-medium text-muted flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-brand" />
                    Market Sentiment
                  </h3>
                </div>
                
                {sentimentData.length === 0 ? (
                  <div className="h-48 flex flex-col items-center justify-center gap-3 text-center border border-dashed border-black/8 rounded-2xl bg-black/[0.01]">
                    <Activity className="w-6 h-6 text-muted/20" />
                    <p className="text-[10px] text-muted uppercase tracking-[0.2em]">Awaiting Data</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-8">
                    <div className="w-1/2 h-[160px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={sentimentData}
                            innerRadius={50}
                            outerRadius={75}
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                          >
                            {sentimentData.map((entry) => (
                              <Cell key={entry.name} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ background: '#fff', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }} 
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-3">
                      {sentimentData.map((d) => (
                        <div key={d.name} className="flex items-center justify-between group">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                            <span className="text-[11px] font-medium text-muted group-hover:text-ink transition-colors">{d.name}</span>
                          </div>
                          <span className="text-[11px] font-mono font-bold text-ink">
                            {totalSentiment > 0 ? `${Math.round((d.value / totalSentiment) * 100)}%` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Analytics: Unit Economics */}
              <div className="glass border-black/5 rounded-[2rem] p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-[10px] uppercase tracking-[0.4em] font-medium text-muted flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-brand" />
                    Unit Economics
                  </h3>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 bg-brand/10 border border-brand/20 rounded-full">
                    <span className="text-[9px] font-bold text-brand uppercase tracking-wider">Efficiency: {stats?.unitEconomics?.efficiencyScore ?? 0}%</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/5">
                    <span className="text-[9px] font-medium text-muted uppercase tracking-wider block mb-1">Cost / Min</span>
                    <span className="text-xl font-bold text-ink">${stats?.unitEconomics?.costPerMinute ?? "0.00"}</span>
                  </div>
                  <div className="p-4 rounded-2xl bg-black/[0.02] border border-black/5">
                    <span className="text-[9px] font-medium text-muted uppercase tracking-wider block mb-1">Cost / Lead</span>
                    <span className="text-xl font-bold text-ink">${stats?.unitEconomics?.costPerLead ?? "0.00"}</span>
                  </div>
                </div>

                <div className="mt-6 p-4 rounded-2xl bg-brand/5 border border-brand/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-brand uppercase tracking-wider">Fleet ROI Projection</span>
                    <span className="text-[10px] font-mono font-bold text-brand">EXCELLENT</span>
                  </div>
                  <div className="h-1.5 w-full bg-brand/10 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${stats?.unitEconomics?.efficiencyScore ?? 0}%` }}
                      className="h-full bg-brand rounded-full"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Intelligence & Actions (4/12) */}
          <div className="xl:col-span-4 space-y-8">
            {/* Intelligence Hub (Action Feed) */}
            <div className="glass border-black/5 rounded-[2rem] p-8 h-full min-h-[600px] flex flex-col">
              <ActionFeed actions={actions} onRefresh={refresh} />
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
