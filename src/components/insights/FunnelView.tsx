import { WL_APP_CLASSES } from "../../lib/wireline-design-system";
import { useEffect, useState } from "react";
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

  // These totals span different workflows. They are not successive funnel stages.
  const totals = data.stages || [];

  if (totals.length === 0 || totals.every((item) => item.count === 0)) {
    return <InsightEmpty configKey="funnel" icon={TrendingUp} />;
  }

  return (
    <div className={cn(WL_APP_CLASSES.panelFrame, "space-y-4 p-5 md:p-6")}>
      <div>
        <p className="wl-insight-label text-brand/70">Last {data.window_days} days</p>
        <h3 className="mt-1 text-lg font-semibold tracking-tight text-foreground">
          Activity Totals
        </h3>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {totals.map((item) => (
          <div
            key={item.name}
            className="rounded-xl border border-border bg-background/40 p-3 sm:p-4"
          >
            <dt className="text-sm text-muted-foreground">
              {item.name === "Queued" ? "Queued leads" : item.name}
            </dt>
            <dd className="mt-2 font-display text-2xl tabular-nums leading-none text-brand-display">
              {item.count.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
