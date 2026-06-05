/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";
import { fetchInsight, Spinner, ErrCard, InsightEmpty } from "./shared";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { WL_APP_CLASSES } from "../../lib/wireline-director-design";

export default function TopicsView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = (refresh = false) => {
    setLoading(true);
    setErr(null);
    fetchInsight(`/api/insights/topics${refresh ? "?refresh=1" : ""}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Request failed"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  if (loading && !data) return <Spinner />;
  if (err) return <ErrCard error={err} />;
  if (!data) return null;
  if (data.message)
    return <InsightEmpty configKey="topics" icon={RefreshCw} descriptionOverride={data.message} />;

  const topics = data.topics || [];
  if (topics.length === 0) {
    return <InsightEmpty configKey="topics" icon={RefreshCw} />;
  }

  const max = Math.max(1, ...topics.map((t: any) => t.count));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 wl-insight-label">
          {!data.cached && (
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand/60 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
            </span>
          )}
          {data.cached ? "Cached" : "Fresh"} · {data.total_analyzed} signals analyzed
        </div>
        <ShadButton
          type="button"
          disableAnimations
          variant="outline"
          size="sm"
          onClick={() => load(true)}
          className="rounded-full wl-insight-label hover:text-ink hover:border-brand/25"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </ShadButton>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {topics.map((t: any, i: number) => {
          const pct = (t.count / max) * 100;
          return (
            <motion.div
              key={t.label ?? t.topic ?? t.id ?? `topic-${i}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn(WL_APP_CLASSES.insightStatCard, "p-5")}
            >
              <div className="absolute inset-x-0 bottom-0 h-1 bg-black/[0.05]" />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: i * 0.05 }}
                className="absolute inset-x-0 bottom-0 h-1 bg-brand"
              />
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h4 className="font-display italic text-2xl text-ink leading-tight">{t.name}</h4>
                  <span className="font-display italic text-3xl text-aurora tabular-nums">
                    {t.count}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em] bg-brand/15 text-brand border border-brand/30">
                    {t.category}
                  </span>
                  {t.trend && (
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em]",
                        t.trend === "growing" && "bg-brand/15 text-brand border border-brand/30",
                        t.trend === "new" && "bg-brand-2/15 text-brand-2 border border-brand-2/30",
                        t.trend === "steady" &&
                          "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
                        t.trend === "declining" &&
                          "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                      )}
                    >
                      {t.trend}
                    </span>
                  )}
                </div>
                {t.example_quote && (
                  <p className="text-xs text-ink/65 italic leading-relaxed mt-2">
                    "{t.example_quote}"
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
