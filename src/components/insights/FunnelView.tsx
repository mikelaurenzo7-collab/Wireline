/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { TrendingUp } from "lucide-react";
import { fetchInsight, Spinner, ErrCard } from "./shared";

export default function FunnelView({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);
    fetchInsight(`/api/insights/funnel?days=${days}`)
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
  }, [days]);

  if (loading) return <Spinner />;
  if (err) return <ErrCard error={err} />;
  if (!data) return null;

  const stages = data.stages || [];
  const max = Math.max(1, ...stages.map((s: any) => s.count));

  if (stages.length === 0 || stages.every((s: any) => s.count === 0)) {
    return (
      <div className="relative aurora-ring rounded-3xl">
        <div className="relative rounded-3xl glass-strong overflow-hidden p-10 md:p-14 flex flex-col items-center gap-5 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #4F1E7B22, #4F1E7B22)" }}
          >
            <TrendingUp className="w-8 h-8 text-brand" />
          </div>
          <div>
            <h3 className="font-display italic text-3xl text-ink mb-2">No calls yet</h3>
            <p className="text-sm text-ink/55 max-w-sm leading-relaxed">
              Your conversion funnel will populate once agents start handling calls. Run a test call
              from the Dashboard to see data here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative aurora-ring rounded-3xl">
      <div className="relative rounded-3xl glass-strong overflow-hidden p-8 md:p-10 space-y-4">
        <div className="app-section-title text-brand mb-2">
          Conversion Funnel · {data.window_days}d
        </div>
        {stages.map((s: any, i: number) => {
          const pct = (s.count / max) * 100;
          const prev = i > 0 ? stages[i - 1].count : null;
          const drop =
            prev !== null && prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : null;
          return (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="space-y-1.5"
            >
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-display italic text-2xl text-ink">{s.name}</span>
                <span className="font-display italic text-3xl text-aurora tabular-nums">
                  {s.count.toLocaleString()}
                </span>
              </div>
              <div className="relative h-3 rounded-full bg-black/10 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: i * 0.06 }}
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    background: `linear-gradient(90deg, #4F1E7B, #4F1E7B, #4F1E7B)`,
                    backgroundSize: "200% 100%",
                  }}
                />
              </div>
              {drop !== null && drop > 0 && (
                <div className="app-section-title text-right">↓ {drop}% from previous stage</div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
