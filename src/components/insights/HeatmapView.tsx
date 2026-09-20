import { WL_APP_CLASSES } from "../../lib/wireline-design-system";
import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import type { InsightsHeatmapCell, InsightsHeatmapResponse } from "../../types/api-insights";
import { fetchInsight, InsightSkeleton, ErrCard, InsightEmpty } from "./shared";
import { cn } from "../../lib/utils";

export default function HeatmapView({ days }: { days: number }) {
  const [data, setData] = useState<InsightsHeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);
    fetchInsight<InsightsHeatmapResponse>(`/api/insights/heatmap?days=${days}`)
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
  const hasActivity = grid.some((g) => g.count > 0);
  if (!hasActivity) {
    return <InsightEmpty configKey="heatmap" icon={BarChart3} />;
  }
  const max = Math.max(1, ...grid.map((g) => g.count));
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className={cn(WL_APP_CLASSES.panelFrame, "min-w-0 p-7 md:p-10")}>
      <div className="sr-only">
        <h2>Calls by Hour × Weekday · {data.window_days}d</h2>
      </div>
      <div className="sr-only">
        <h2>Heatmap Data</h2>
        <dl>
          {grid.map((cell: InsightsHeatmapCell, i: number) => {
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

      <div className="w-full overflow-x-auto rounded-md border border-border" aria-hidden="true">
        <table className="w-full min-w-[640px] table-fixed">
          <colgroup>
            <col className="w-14" />
            {Array.from({ length: 24 }).map((_, hour) => (
              <col key={hour} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="app-section-title text-left pb-2 font-normal"></th>
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
                <td className="app-section-title whitespace-nowrap pr-3 py-1">{wd}</td>
                {Array.from({ length: 24 }).map((_, h) => {
                  const cell = grid.find((g) => g.weekday === w && g.hour === h);
                  const intensity = cell ? cell.count / max : 0;
                  const opacity = 0.05 + intensity * 0.95;
                  return (
                    <td key={h} className="px-0.5 py-0.5">
                      <div
                        className="h-7 rounded-md transition-transform hover:scale-110 cursor-help bg-brand sm:h-8"
                        style={{ opacity: cell && cell.count > 0 ? opacity : 0.05 }}
                        title={`${wd} ${h}:00, ${cell?.count || 0} calls${cell?.avg_score ? `, avg score ${cell.avg_score}` : ""}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div
        className="flex items-center gap-3 mt-6 app-section-title"
        role="img"
        aria-label="Call volume: fainter cells mean fewer calls; stronger color means more calls."
      >
        <span>Less</span>
        <div className="flex gap-1">
          {[0.1, 0.3, 0.55, 0.8, 1].map((o, i) => (
            <div key={i} className="w-4 h-4 rounded bg-brand" style={{ opacity: o }} />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}
