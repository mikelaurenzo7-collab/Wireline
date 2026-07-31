import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import { cn } from "../../lib/utils";
import { AGENT_ROLES } from "../fleet/helpers";
import type { InsightsLeaderboardAgentRow, InsightsLeaderboardResponse } from "../../types/api";
import { fetchInsight, InsightSkeleton, ErrCard, InsightEmpty, Stat } from "./shared";

function RolePill({ role }: { role?: string }) {
  const meta =
    AGENT_ROLES.find((r) => r.value === role) ??
    AGENT_ROLES.find((r) => r.value === "customer_service") ??
    AGENT_ROLES[0];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-black uppercase tracking-widest wl-label px-2 py-0.5 border-2",
        meta.tw.bg,
        meta.tw.text,
        meta.tw.border,
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", meta.tw.dot)} />
      {meta.label}
    </span>
  );
}

export default function LeaderboardView({ days }: { days: number }) {
  const [data, setData] = useState<InsightsLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);
    fetchInsight<InsightsLeaderboardResponse>(`/api/insights/leaderboard?days=${days}`)
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
  if (!data || !data.agents?.length) return <InsightEmpty configKey="leaderboard" icon={Trophy} />;

  // Podium tones stay on the system ramp: violet action for first place,
  // the silver wire for second, neutral for third.
  const RANK_STYLES: Array<{
    ring: string;
    textClass: string;
  }> = [
    {
      ring: "border-brand/40",
      textClass: "text-on-brand",
    },
    {
      ring: "border-[color-mix(in_srgb,var(--wireline-color-action-secondary-default)_30%,transparent)]",
      textClass: "text-[var(--wireline-color-action-secondary-default)]",
    },
    {
      ring: "border-[color-mix(in_srgb,var(--wireline-color-status-neutral)_25%,transparent)]",
      textClass: "text-[var(--wireline-color-status-neutral)]",
    },
  ];

  const agentRows: InsightsLeaderboardAgentRow[] = Array.isArray(data?.agents) ? data.agents : [];

  return (
    <div className="space-y-3">
      {agentRows.map((a, i) => {
        const rs = RANK_STYLES[i] ?? {
          ring: "border-white/8",
          textClass: "text-muted",
        };
        return (
          <motion.div
            key={a.agent_id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className={cn(
              "relative rounded-md wl-panel border p-5 flex items-center gap-5 overflow-hidden",
              i < 3 && "wl-leaderboard-card",
              rs.ring,
            )}
            data-rank={i < 3 ? String(i) : undefined}
          >
            <div className="absolute right-5 top-1/2 -translate-y-1/2 font-display italic text-[96px] leading-none opacity-[0.04] select-none pointer-events-none">
              {i + 1}
            </div>
            <div className="shrink-0 flex flex-col items-center gap-0.5">
              <div
                className={cn(
                  "w-12 h-12 rounded-md flex items-center justify-center font-display italic text-2xl border border-white/10",
                  i < 3 && "wl-leaderboard-avatar",
                )}
                data-rank={i < 3 ? String(i) : undefined}
              >
                {i === 0 ? (
                  <Trophy className={`w-5 h-5 ${rs.textClass}`} />
                ) : (
                  <span className={rs.textClass}>{i + 1}</span>
                )}
              </div>
              {a.rank_delta != null && (
                <span
                  className={cn(
                    "wl-label font-bold tabular-nums leading-none",
                    a.rank_delta > 0
                      ? "wl-text-success"
                      : a.rank_delta < 0
                        ? "text-rose-500"
                        : "text-muted/70",
                  )}
                >
                  {a.rank_delta > 0 ? `+${a.rank_delta}` : a.rank_delta === 0 ? "—" : a.rank_delta}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0 relative">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h4 className="font-display italic text-2xl text-foreground leading-tight">
                  {a.agent_name}
                </h4>
                <RolePill role={a.role} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                <Stat label="Calls" value={a.total_calls} />
                <Stat label="Qualified" value={a.qualified} />
                <Stat label="Avg Score" value={a.avg_lead_score} />
                <Stat label="Bookings" value={a.bookings} />
                <Stat label="Minutes" value={a.minutes} />
                <Stat
                  label="$/Qual"
                  value={a.cost_per_qualified ? `$${a.cost_per_qualified}` : "—"}
                />
                <Stat
                  label="$/Outcome"
                  value={a.cost_per_outcome ? `$${a.cost_per_outcome}` : "—"}
                />
                <Stat label="Total $" value={a.total_cost ? `$${a.total_cost}` : "—"} />
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
