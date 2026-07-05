/* eslint-disable @typescript-eslint/no-explicit-any */
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";
import { useEffect, useState } from "react";
import { fetchInsight, InsightSkeleton, ErrCard, Empty } from "./shared";
import { cn } from "../../lib/utils";

export default function HeatmapView({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);
    fetchInsight(`/api/insights/heatmap?days=${days}`)
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

  const grid = data.grid || [];
  const hasActivity = grid.some((g: any) => g.count > 0);
  if (!hasActivity) {
    return <Empty label="No call activity recorded in this window." />;
  }
  const max = Math.max(1, ...grid.map((g: any) => g.count));
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className={cn(WL_APP_CLASSES.panelFrame, "p-7 md:p-10")}>
      <div className="mb-6">
        <p className="wl-insight-label text-brand/70">Activity · {data.window_days}d</p>
        <h3 className="font-display italic text-2xl text-foreground leading-tight">
          Calls by Hour × Weekday
        </h3>
      </div>
      {/* Screen Reader Twin-View for Heatmap */}
      <div className="sr-only">
        <h2>Heatmap Data</h2>
        <dl>
          {grid.map((cell: any, i: number) => {
            if (cell.count === 0) return null;
            return (
              <div key={`sr-heat-${i}`}>
                <dt>
                  {weekdays[cell.weekday]} at {cell.hour}:00
                </dt>
                <dd>
                  {cell.count} calls{cell.avg_score ? `, average score ${cell.avg_score}` : ""}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>

      <div className="app-table-scroll rounded-md border border-border" aria-hidden="true">
        <table className="w-full md:min-w-[700px]">
          <thead>
            <tr>
              <th className="app-section-title text-left pb-2 font-normal w-8"></th>
              {Array.from({ length: 24 }).map((_, h) => (
                <th key={h} className="app-section-title text-center pb-2 font-normal">
                  {h % 3 === 0 ? h : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weekdays.map((wd, w) => (
              <tr key={w}>
                <td className="app-section-title pr-3 py-1">{wd}</td>
                {Array.from({ length: 24 }).map((_, h) => {
                  const cell = grid.find((g: any) => g.weekday === w && g.hour === h);
                  const intensity = cell ? cell.count / max : 0;
                  const opacity = 0.05 + intensity * 0.95;
                  return (
                    <td key={h} className="px-0.5 py-0.5">
                      <div
                        className="aspect-square rounded-md transition-all hover:scale-110 cursor-pointer wl-heatmap-cell"
                        data-heat-active={cell && cell.count > 0 ? "true" : "false"}
                        data-heat-opacity={opacity}
                        title={`${wd} ${h}:00 — ${cell?.count || 0} calls${cell?.avg_score ? `, avg score ${cell.avg_score}` : ""}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 mt-6 app-section-title">
        <span>Less</span>
        <div className="flex gap-1">
          {[0.1, 0.3, 0.55, 0.8, 1].map((o, i) => (
            <div key={i} className="w-4 h-4 rounded wl-heatmap-legend-cell" data-heat-opacity={o} />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
