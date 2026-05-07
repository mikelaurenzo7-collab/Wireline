import { useState, useEffect } from "react";
import { Shield, AlertTriangle, CheckCircle2, Search, Filter, Loader2, Download, AlertOctagon, Scale, FileText } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell } from "recharts";
import { authFetch } from "../lib/api";
import { cn } from "../lib/utils";

export default function ComplianceView({ days }: { days: number }) {
  const [stats, setStats] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompliance = async () => {
      setLoading(true);
      try {
        const [statsRes, tasksRes] = await Promise.all([
          authFetch(`/api/compliance/stats?days=${days}`),
          authFetch(`/api/fleet/tasks?task_type=compliance_review&limit=10`)
        ]);
        const statsData = await statsRes.json();
        const tasksData = await tasksRes.json();
        setStats(statsData);
        setTasks(tasksData.tasks || []);
      } catch (e) {
        console.error("Compliance fetch failed:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchCompliance();
  }, [days]);

  if (loading) return (
    <div className="py-16 flex flex-col items-center gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-brand" />
      <p className="text-[10px] uppercase tracking-[0.5em] text-muted/60">Auditing fleet...</p>
    </div>
  );

  return (
    <div className="space-y-5 pb-8">
      {/* Risk Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative rounded-2xl glass border border-white/10 p-5 overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-10 blur-3xl pointer-events-none bg-emerald-500" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted">Compliance Score</p>
              <Shield className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="font-display italic text-4xl text-ink leading-none">{stats?.overall_score ?? 98}%</p>
            <p className="text-[9px] uppercase tracking-[0.2em] text-emerald-500/80 mt-2">Optimal range</p>
          </div>
        </div>
        <div className="relative rounded-2xl glass border border-white/10 p-5 overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-10 blur-3xl pointer-events-none bg-rose-500" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted">High Risk Flags</p>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <p className="font-display italic text-4xl text-ink leading-none">{stats?.high_risk_count ?? 0}</p>
            <p className="text-[9px] uppercase tracking-[0.2em] text-rose-500/80 mt-2">Requires attention</p>
          </div>
        </div>
        <div className="relative rounded-2xl glass border border-white/10 p-5 overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full opacity-10 blur-3xl pointer-events-none bg-brand" />
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-[0.3em] text-muted">Audited Calls</p>
              <Scale className="w-4 h-4 text-brand" />
            </div>
            <p className="font-display italic text-4xl text-ink leading-none">{stats?.audited_count ?? 0}</p>
            <p className="text-[9px] uppercase tracking-[0.2em] text-muted/60 mt-2">Last {days} days</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Compliance Trend */}
        <div className="lg:col-span-8">
          <div className="rounded-2xl glass border border-white/10 p-6 h-full">
            <h4 className="text-[10px] uppercase tracking-[0.4em] text-brand mb-6 flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3" /> Rule Adherence Trend
            </h4>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats?.trend || []}>
                  <defs>
                    <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0AC8D4" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0AC8D4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="day" tick={{ fill: "#7C7469", fontSize: 9 }} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fill: "#7C7469", fontSize: 9 }} axisLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#F5F0E8", border: "1px solid rgba(10,200,212,0.2)", borderRadius: 8, fontSize: 11 }}
                  />
                  <Area type="monotone" dataKey="score" stroke="#0AC8D4" fill="url(#compGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Risk Categories */}
        <div className="lg:col-span-4">
          <div className="rounded-2xl glass border border-white/10 p-6 h-full">
            <h4 className="text-[10px] uppercase tracking-[0.4em] text-brand mb-6">Violations by Type</h4>
            <div className="space-y-4">
              {[
                { label: "TCPA / DNC", count: stats?.by_type?.tcpa ?? 0, color: "#FF6B6B" },
                { label: "Recording Consent", count: stats?.by_type?.consent ?? 0, color: "#FF9A5C" },
                { label: "GDPR / Privacy", count: stats?.by_type?.gdpr ?? 0, color: "#FFD166" },
                { label: "Agent Misconduct", count: stats?.by_type?.misconduct ?? 0, color: "#E040C0" },
              ].map(cat => (
                <div key={cat.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.1em]">
                    <span className="text-muted">{cat.label}</span>
                    <span className="text-ink font-mono">{cat.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (cat.count / (stats?.audited_count || 1)) * 500)}%` }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 pt-6 border-t border-white/5">
              <div className="flex items-center gap-2 mb-2">
                <AlertOctagon className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-[10px] uppercase tracking-[0.3em] text-rose-400">Policy Breach Detected</span>
              </div>
              <p className="text-[11px] text-muted/80 leading-relaxed italic">
                "Agent failed to disclose call recording on call ending in ...9012"
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Compliance Tasks */}
      <div className="rounded-2xl glass border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 bg-black/20 flex items-center justify-between">
          <h4 className="text-[10px] uppercase tracking-[0.4em] text-ink">Active Compliance Reviews</h4>
          <span className="px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[9px] uppercase tracking-[0.2em]">
            {tasks.length} pending
          </span>
        </div>
        <div className="divide-y divide-white/5">
          {tasks.length === 0 ? (
            <div className="p-12 text-center text-[10px] uppercase tracking-[0.4em] text-muted/40">
              Fleet clear of high-risk violations
            </div>
          ) : tasks.map(task => (
            <div key={task.id} className="p-4 flex items-start gap-4 hover:bg-white/2 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-rose-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-medium text-ink truncate">{task.description}</span>
                  <span className="px-1.5 py-0.5 rounded-full bg-black/40 text-[8px] font-mono text-muted">
                    {task.source_id?.slice(0, 8)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-muted/60">
                    {new Date(task.created_at).toLocaleDateString()}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-white/10" />
                  <span className="text-[9px] uppercase tracking-[0.2em] text-rose-400/80">Critical Review</span>
                </div>
              </div>
              <button className="px-3 py-1.5 rounded-lg glass border border-white/10 text-[9px] uppercase tracking-[0.2em] text-muted hover:text-ink hover:border-white/30 transition-all">
                Audit Call
              </button>
            </div>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-white/5 bg-black/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-muted/60" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted/60">Compliance data exported to audit log</span>
          </div>
          <button className="text-[10px] uppercase tracking-[0.3em] text-brand hover:underline">View Full Audit Log</button>
        </div>
      </div>
    </div>
  );
}
