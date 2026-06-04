/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { cn } from "../../lib/utils";
import { fetchInsight, Spinner, ErrCard, Stat } from "./shared";
import { EmptyState } from "../ui/EmptyState";

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
      <EmptyState
        framed
        icon={Megaphone}
        eyebrow="Campaign Attribution"
        title="No tagged calls yet"
        description={
          "Tag your phone numbers with a campaign label in Admin → Carrier (e.g. \u201CGoogle Ads · Spring '26\u201D). Every call to that number gets the tag and shows up here."
        }
        actions={[{ label: "Open Admin → Carrier", to: "/admin", primary: false }]}
      />
    );
  }

  return (
    <div className="p-1 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-1">
        <Stat
          label="Tagged sources"
          value={rows.filter((r) => r.source !== "(untagged)").length}
          accent="#8B3FD6"
        />
        <Stat label="Total calls" value={totalCalls} accent="#8B3FD6" />
        <Stat label="Booked" value={totalBooked} accent="#8B3FD6" />
        <Stat
          label="Conv. rate"
          value={`${totalCalls > 0 ? ((totalBooked / totalCalls) * 100).toFixed(1) : "0.0"}%`}
          accent="#8B3FD6"
        />
      </div>
      <div className="rounded-md wl-panel border border-black/8 overflow-hidden app-table-scroll">
        <table className="w-full text-sm">
          <thead className="bg-black/3">
            <tr className="text-left font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
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
                  className="border-t border-black/5 hover:bg-black/[0.02] transition-colors"
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
                  <td className="px-3 py-2.5 text-right tabular-nums wl-text-success">{booked}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-brand">
                    {Number(r.qualified) || 0}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      className={cn(
                        "inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium tabular-nums border",
                        Number(conv) >= 30
                          ? "wl-status-success wl-text-success border"
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
