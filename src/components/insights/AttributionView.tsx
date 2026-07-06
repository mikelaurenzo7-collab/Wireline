import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { cn } from "../../lib/utils";
import type { InsightsAttributionResponse, InsightsAttributionRow } from "../../types/api-insights";
import { fetchInsight, InsightSkeleton, ErrCard, Stat, InsightEmpty } from "./shared";

export default function AttributionView({ days }: { days: number }) {
  const [rows, setRows] = useState<InsightsAttributionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);
    fetchInsight<InsightsAttributionResponse>(`/api/insights/campaign-attribution?days=${days}`)
      .then((d) => {
        if (active) setRows(d.attribution || []);
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

  const totalCalls = rows.reduce((s, r) => s + (Number(r.calls) || 0), 0);
  const totalBooked = rows.reduce((s, r) => s + (Number(r.booked) || 0), 0);

  if (totalCalls === 0) {
    return <InsightEmpty configKey="attribution" icon={Megaphone} />;
  }

  return (
    <div className="p-1 space-y-3">
      <div className="sr-only">
        <h2>Campaign Attribution Details</h2>
        <dl>
          {rows.map((r, i) => {
            const calls = Number(r.calls) || 0;
            const booked = Number(r.booked) || 0;
            const conv = calls > 0 ? ((booked / calls) * 100).toFixed(1) : "0.0";
            return (
              <div key={`sr-attr-${r.source}-${i}`}>
                <dt>Campaign: {r.source}</dt>
                <dd>
                  Calls: {calls}, Minutes: {Math.round((Number(r.total_seconds) || 0) / 60)},
                  Booked: {booked}, Qualified: {Number(r.qualified) || 0}, Conversion: {conv}%
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-1">
        <Stat label="Tagged sources" value={rows.filter((r) => r.source !== "(untagged)").length} />
        <Stat label="Total calls" value={totalCalls} />
        <Stat label="Booked" value={totalBooked} />
        <Stat
          label="Conv. rate"
          value={`${totalCalls > 0 ? ((totalBooked / totalCalls) * 100).toFixed(1) : "0.0"}%`}
        />
      </div>
      <div className="rounded-md wl-panel overflow-hidden app-table-scroll" aria-hidden="true">
        <table className="w-full text-sm">
          <thead className="bg-black/[0.03] dark:bg-white/[0.02]">
            <tr className="text-left wl-insight-label">
              <th className="px-3 py-2.5 font-medium">Campaign</th>
              <th className="px-3 py-2.5 font-medium text-right">Calls</th>
              <th className="px-3 py-2.5 font-medium text-right">Minutes</th>
              <th className="px-3 py-2.5 font-medium text-right">Booked</th>
              <th className="px-3 py-2.5 font-medium text-right">Qualified</th>
              <th className="px-3 py-2.5 font-medium text-right">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const calls = Number(r.calls) || 0;
              const booked = Number(r.booked) || 0;
              const conv = calls > 0 ? ((booked / calls) * 100).toFixed(1) : "0.0";
              const isUntagged = r.source === "(untagged)";
              return (
                <tr
                  key={`${r.source}-${i}`}
                  className="border-t border-border hover:bg-black/[0.02] dark:hover:bg-white/[0.01] transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <span
                      className={
                        isUntagged ? "text-muted/80 italic" : "text-foreground font-medium"
                      }
                    >
                      {r.source}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground/90">
                    {calls}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted/80">
                    {Math.round((Number(r.total_seconds) || 0) / 60)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums wl-text-success">{booked}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-brand">
                    {Number(r.qualified) || 0}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className={cn(
                        "inline-block px-1.5 py-0.5 rounded-full wl-micro-badge font-medium border",
                        Number(conv) >= 30
                          ? "wl-status-success wl-text-success border"
                          : Number(conv) >= 15
                            ? "bg-brand/10 text-brand border-brand/20"
                            : "bg-destructive/10 text-destructive border-destructive/20",
                      )}
                    >
                      {conv}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
