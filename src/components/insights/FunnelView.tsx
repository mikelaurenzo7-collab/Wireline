/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { TrendingUp } from "lucide-react";
import { fetchInsight, Spinner, ErrCard, InsightEmpty } from "./shared";
import { cn } from "../../lib/utils";
import { WL_APP_CLASSES } from "../../lib/wireline-director-design";

interface FunnelStage {
  name: string;
  count: number;
  kind?: "flow" | "signal";
  /** True only when a drop-off vs the previous flow stage is a real subset relationship. */
  sequential?: boolean;
  hint?: string;
}

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

  const allStages: FunnelStage[] = data.stages || [];
  // Bars are the sequential journey; signals (e.g. High intent) are quality
  // metrics that live in the side rail, never as a gate between two bars.
  const flow = allStages.filter((s) => (s.kind ?? "flow") !== "signal");
  const signals = allStages.filter((s) => s.kind === "signal");
  const max = Math.max(1, ...flow.map((s) => s.count));

  if (allStages.length === 0 || allStages.every((s) => s.count === 0)) {
    return <InsightEmpty configKey="funnel" icon={TrendingUp} />;
  }

  return (
    <div
      className={cn(
        WL_APP_CLASSES.panelFrame,
        "p-5 md:p-6",
        // Cap the bar column so a wide desktop reads as a focused funnel with a
        // metrics rail — not one ~1700px bar stretched edge to edge.
        signals.length > 0 &&
          "xl:grid xl:grid-cols-[minmax(0,1fr)_clamp(220px,22vw,300px)] xl:gap-8",
      )}
    >
      <div className="space-y-3 max-w-2xl">
        <div className="mb-2">
          <p className="wl-insight-label text-brand/70">Conversion · {data.window_days}d</p>
          <h3 className="font-display text-2xl text-ink leading-tight">Funnel</h3>
        </div>
        {flow.map((s, i) => {
          const pct = (s.count / max) * 100;
          const prev = i > 0 ? flow[i - 1].count : null;
          // Only claim a drop-off when the API marks this step as a genuine
          // subset of the prior stage AND the data is actually monotonic.
          // Anything else (a later stage exceeding an earlier one across data
          // sources) gets no annotation rather than a false one.
          const drop =
            s.sequential && prev !== null && prev > 0 && s.count <= prev
              ? Math.round(((prev - s.count) / prev) * 100)
              : null;
          return (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="space-y-1.5"
            >
              <div className="flex items-baseline justify-between text-sm gap-3">
                <span className="font-display text-2xl text-ink">{s.name}</span>
                <span className="font-display text-3xl text-aurora tabular-nums">
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
                  {s.count === 0
                    ? "None progressed from previous stage"
                    : `↓ ${drop}% drop-off from previous stage`}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {signals.length > 0 && (
        <div className="mt-5 xl:mt-0 border-t xl:border-t-0 xl:border-l border-black/8 pt-4 xl:pt-0 xl:pl-8 space-y-4">
          <p className="wl-insight-label text-brand/70">Signals</p>
          {signals.map((s) => (
            <div key={s.name} className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-ink">{s.name}</span>
                <span className="font-display text-2xl text-aurora tabular-nums">
                  {s.count.toLocaleString()}
                </span>
              </div>
              {s.hint && <p className="wl-micro-meta text-muted/80 leading-snug">{s.hint}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
