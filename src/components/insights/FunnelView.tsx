import { WL_APP_CLASSES } from "../../lib/wireline-design-system";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { TrendingUp } from "lucide-react";
import type { InsightsFunnelResponse } from "../../types/api";
import { fetchInsight, InsightSkeleton, ErrCard, InsightEmpty } from "./shared";
import { cn } from "../../lib/utils";

export default function FunnelView({ days }: { days: number }) {
  const [data, setData] = useState<InsightsFunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);
    fetchInsight<InsightsFunnelResponse>(`/api/insights/funnel?days=${days}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setErr(e instanceof Error ? e.message : "Request failed");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [days, reloadKey]);

  if (loading) return <InsightSkeleton />;
  if (err) return <ErrCard error={err} onRetry={() => setReloadKey((k) => k + 1)} />;
  if (!data) return null;

  const stages = data.stages || [];
  const max = Math.max(1, ...stages.map((s) => s.count));

  if (stages.length === 0 || stages.every((s) => s.count === 0)) {
    return <InsightEmpty configKey="funnel" icon={TrendingUp} />;
  }

  return (
    <div className={cn(WL_APP_CLASSES.panelFrame, "p-5 md:p-6 space-y-3")}>
      <div className="mb-2">
        <p className="wl-insight-label text-brand/70">Conversion · {data.window_days}d</p>
        <h3 className="font-display italic text-2xl text-foreground leading-tight">Funnel</h3>
      </div>
      {stages.map((s, i) => {
        const pct = (s.count / max) * 100;
        const prev = i > 0 ? stages[i - 1].count : null;
        const drop = prev !== null && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : null;
        return (
          <motion.div
            key={s.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="space-y-1.5"
          >
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-display italic text-2xl text-foreground">{s.name}</span>
              <span className="font-display italic text-3xl text-brand-display tabular-nums">
                {s.count.toLocaleString()}
              </span>
            </div>
            <div className="relative h-3 rounded-full bg-black/10 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: i * 0.06 }}
                className="absolute inset-y-0 left-0 rounded-full bg-brand"
              />
            </div>
            {drop !== null && drop > 0 && (
              <div className="app-section-title text-right text-muted/80">
                {drop === 100 && s.count === 0
                  ? "None progressed from previous stage"
                  : `↓ ${drop}% drop-off from previous stage`}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
