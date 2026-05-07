import { useState, useEffect } from "react";
import { DollarSign, TrendingUp, Users, Clock, Loader2, ArrowUpRight, BarChart3 } from "lucide-react";
import { motion } from "motion/react";
import { authFetch } from "../lib/api";

export default function ROIView({ days }: { days: number }) {
  const [roi, setRoi] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchROI = async () => {
      setLoading(true);
      try {
        const res = await authFetch(`/api/fleet/roi?days=${days}`);
        const data = await res.json();
        setRoi(data);
      } catch (e) {
        console.error("ROI fetch failed:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchROI();
  }, [days]);

  if (loading) return (
    <div className="py-16 flex flex-col items-center gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-brand" />
      <p className="text-[10px] uppercase tracking-[0.5em] text-muted/60">Calculating ROI...</p>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <ROICard label="Total AI Spend" value={`$${roi?.total_cost.toFixed(2)}`} icon={DollarSign} accent="#E040C0" />
        <ROICard label="Booking Value" value={`$${roi?.booking_value.toLocaleString()}`} icon={TrendingUp} accent="#0AC8D4" />
        <ROICard label="Human Hours Saved" value={`${Math.round(roi?.human_cost_saved / 0.5)}h`} icon={Clock} accent="#9B59F5" />
        <ROICard label="ROI Multiplier" value={`${roi?.roi_multiplier.toFixed(1)}x`} icon={BarChart3} accent="#10B981" />
      </div>

      <div className="relative aurora-ring rounded-3xl">
        <div className="relative rounded-3xl glass-strong border border-white/10 p-8 md:p-12 flex flex-col items-center text-center gap-6">
          <div className="w-20 h-20 rounded-full flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20">
            <TrendingUp className="w-10 h-10 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-display italic text-4xl text-ink mb-3">Efficiency Breakthrough</h3>
            <p className="text-ink/60 max-w-xl leading-relaxed">
              Based on your last {days} days of activity, Wireline agents have generated
              <strong className="text-emerald-400"> ${roi?.booking_value.toLocaleString()} </strong>
              in estimated pipeline value while costing only
              <strong className="text-rose-400"> ${roi?.total_cost.toFixed(2)} </strong>
              in autonomous compute.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-[9px] uppercase tracking-[0.3em] text-muted mb-1">Human Cost Equiv.</div>
              <div className="text-xl font-display italic text-ink">${roi?.human_cost_saved.toFixed(2)}</div>
            </div>
            <div className="px-6 py-3 rounded-2xl bg-brand/10 border border-brand/20">
              <div className="text-[9px] uppercase tracking-[0.3em] text-brand mb-1">Net Efficiency</div>
              <div className="text-xl font-display italic text-brand">+{Math.round((roi?.roi_multiplier - 1) * 100)}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ROICard({ label, value, icon: Icon, accent }: any) {
  return (
    <div className="rounded-2xl glass border border-white/10 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.3em] text-muted">{label}</span>
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div className="font-display italic text-3xl text-ink leading-none">{value}</div>
    </div>
  );
}
