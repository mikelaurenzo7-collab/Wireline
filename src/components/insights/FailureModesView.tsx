/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { RefreshCw, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { fetchInsight, Spinner, ErrCard, Empty } from "./shared";

export default function FailureModesView() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = (refresh = false) => {
    setLoading(true);
    setErr(null);
    fetchInsight(`/api/insights/failure-modes${refresh ? "?refresh=1" : ""}`)
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
  if (data.message) return <Empty label={data.message} green />;

  const modes = data.modes || [];
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="app-section-title">
          {data.cached ? "Cached" : "Fresh"} · {modes.length} clusters
        </div>
        <button
          onClick={() => load(true)}
          className="px-3 py-1.5 rounded-full glass border border-white/10 app-section-title hover:text-brand hover:border-brand/40 transition-all flex items-center gap-1.5"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      {modes.map((m: any, i: number) => (
        <motion.div
          key={m.label ?? m.failure ?? m.id ?? `mode-${i}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="rounded-2xl glass border border-white/10 p-6 space-y-4"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-display italic text-2xl text-ink leading-tight">
                  {m.failure_type}
                </h4>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em]",
                    m.severity === "critical" &&
                      "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                    m.severity === "high" &&
                      "bg-rose-500/15 text-rose-500 border border-rose-500/30",
                    m.severity === "medium" &&
                      "bg-amber-500/15 text-amber-500 border border-amber-500/30",
                    m.severity === "low" &&
                      "bg-zinc-500/15 text-zinc-300 border border-zinc-500/30",
                  )}
                >
                  {m.severity}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] uppercase tracking-[0.3em] bg-brand-2/15 text-brand-2 border border-brand-2/30">
                  {m.fix_target}
                </span>
              </div>
            </div>
            <div className="font-display italic text-3xl text-aurora">{m.count}</div>
          </div>
          <p className="text-sm text-ink/75 leading-relaxed">{m.description}</p>
          <div className="rounded-xl bg-brand/10 border border-brand/30 p-4 flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-brand mb-1">
                Recommended fix
              </div>
              <p className="text-sm text-ink/90">{m.recommended_fix}</p>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
