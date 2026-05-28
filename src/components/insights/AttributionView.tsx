/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { cn } from "../../lib/utils";
import { fetchInsight, Spinner, ErrCard, Stat } from "./shared";

export default function AttributionView({ days }: { days: number }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);
    fetchInsight<{ attribution?: unknown[] }>(`/api/insights/campaign-attribution?days=${days}`)
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
  }, [days]);

  if (loading) return <Spinner />;
  if (err) return <ErrCard error={err} />;

  const totalCalls = rows.reduce((s, r) => s + (Number(r.calls) || 0), 0);
  const totalBooked = rows.reduce((s, r) => s + (Number(r.booked) || 0), 0);

  if (totalCalls === 0) {
    return (
      <div className="p-6 text-center">
        <Megaphone className="w-10 h-10 text-muted/70 mx-auto mb-3" />
        <p className="text-[13px] text-ink/85 mb-2">No tagged calls yet</p>
        <p className="text-[11px] text-muted/70 max-w-md mx-auto leading-relaxed">
          Tag your phone numbers with a campaign label in{" "}
          <a href="/admin" className="text-brand hover:underline">
            Admin → Carrier
          </a>{" "}
          (e.g. "Google Ads · Spring '26"). Every call to that number gets the tag and shows up
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="p-1 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-1">
        <Stat
          label="Tagged sources"
          value={rows.filter((r) => r.source !== "(untagged)").length}
          accent="#4F1E7B"
        />
        <Stat label="Total calls" value={totalCalls} accent="#4F1E7B" />
        <Stat label="Booked" value={totalBooked} accent="#10B981" />
        <Stat
          label="Conv. rate"
          value={`${totalCalls > 0 ? ((totalBooked / totalCalls) * 100).toFixed(1) : "0.0"}%`}
          accent="#4F1E7B"
        />
      </div>
      <div className="rounded-2xl glass border border-white/8 overflow-hidden app-table-scroll">
        <table className="w-full text-sm">
          <thead className="bg-black/3">
            <tr className="text-left app-section-title">
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
                  className="border-t border-white/6 hover:bg-white/3 transition-colors"
                >
                  <td className="px-3 py-2.5">
                    <span className={isUntagged ? "text-muted/80 italic" : "text-ink font-medium"}>
                      {r.source}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink/90">{calls}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted/80">
                    {Math.round((Number(r.total_seconds) || 0) / 60)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-600">{booked}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-brand">
                    {Number(r.qualified) || 0}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className={cn(
                        "inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium tabular-nums border",
                        Number(conv) >= 30
                          ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/25"
                          : Number(conv) >= 15
                            ? "bg-amber-500/12 text-amber-600 border-amber-500/20"
                            : "bg-rose-500/10 text-rose-500 border-rose-500/20",
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
      <p className="text-caption leading-relaxed px-1">
        Set the campaign label per phone number under{" "}
        <a href="/admin" className="text-brand hover:underline">
          Admin → Carrier
        </a>
        . Calls inherit the label automatically.
      </p>
    </div>
  );
}
