import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { RefreshCw, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import type { InsightsFailureModesResponse } from "../../types/api";
import { Button } from "../atoms";
import { fetchInsight, InsightSkeleton, ErrCard, InsightEmpty } from "./shared";

export default function FailureModesView() {
  const [data, setData] = useState<InsightsFailureModesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = (refresh = false) => {
    setLoading(true);
    setErr(null);
    fetchInsight<InsightsFailureModesResponse>(
      `/api/insights/failure-modes${refresh ? "?refresh=1" : ""}`,
    )
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Request failed"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  if (loading && !data) return <InsightSkeleton />;
  if (err) return <ErrCard error={err} onRetry={() => load()} />;
  if (!data) return null;
  if (data.message) {
    return <InsightEmpty configKey="failureModesOk" icon={Sparkles} success />;
  }

  const modes = data.modes || [];
  if (modes.length === 0) {
    return <InsightEmpty configKey="failureModesOk" icon={Sparkles} success />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          {data.cached ? "Cached" : "Fresh"} · {modes.length}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => load(true)}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>
      {modes.map((m, i) => (
        <motion.div
          key={m.label ?? m.failure ?? m.id ?? `${m.failure_type}-${i}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="rounded-md wl-panel p-5 space-y-3"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-display text-2xl text-foreground leading-tight">
                {m.failure_type}
              </h4>
              <span
                className={cn(
                  "px-2 py-0.5 rounded-full font-mono text-[10px] uppercase tracking-[0.08em]",
                  (m.severity === "critical" || m.severity === "high") &&
                    "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                  m.severity === "medium" &&
                    "bg-amber-500/15 text-amber-500 border border-amber-500/30",
                  m.severity === "low" &&
                    "bg-black/[0.06] dark:bg-white/5 text-foreground/50 border border-border",
                )}
              >
                {m.severity}
              </span>
              <span className="px-2 py-0.5 rounded-full font-mono text-[10px] uppercase tracking-[0.08em] bg-brand-2/15 text-brand-2 border border-brand-2/30">
                {m.fix_target}
              </span>
            </div>
            <div className="font-display text-3xl text-brand-display tabular-nums">{m.count}</div>
          </div>
          <p className="text-sm text-foreground/80">{m.recommended_fix}</p>
        </motion.div>
      ))}
    </div>
  );
}
