/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { fetchInsight, Spinner, ErrCard } from "./shared";

export default function HeatmapView({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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
  }, [days]);

  if (loading) return <Spinner />;
  if (err) return <ErrCard error={err} />;
  if (!data) return null;

  const grid = data.grid || [];
  const max = Math.max(1, ...grid.map((g: any) => g.count));
  const weekdays = ["S", "M", "T", "W", "T", "F", "S"];

  return (
    <div className="relative aurora-ring rounded-3xl">
      <div className="relative rounded-3xl glass-strong overflow-hidden p-7 md:p-10">
        <div className="mb-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-brand/70">
            Activity · {data.window_days}d
          </p>
          <h3 className="font-display italic text-2xl text-ink leading-tight">
            Calls by Hour × Weekday
          </h3>
        </div>
        <div className="app-table-scroll rounded-2xl border border-black/8">
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
                          className="aspect-square rounded-md transition-all hover:scale-110 cursor-pointer"
                          style={{
                            background:
                              cell && cell.count > 0
                                ? `linear-gradient(135deg, rgba(79, 30, 123 ,${opacity}), rgba(79, 30, 123 ,${opacity * 0.8}))`
                                : "rgba(0,0,0,0.03)",
                            border:
                              cell && cell.count > 0
                                ? `1px solid rgba(79, 30, 123 ,${0.2 + intensity * 0.4})`
                                : "1px solid rgba(0,0,0,0.04)",
                          }}
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
              <div
                key={i}
                className="w-4 h-4 rounded"
                style={{
                  background: `linear-gradient(135deg, rgba(79, 30, 123 ,${o}), rgba(79, 30, 123 ,${o * 0.8}))`,
                }}
              />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
