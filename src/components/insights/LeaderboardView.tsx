import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import { cn } from "../../lib/utils";
import BotMark from "../BotMark";
import { AGENT_ROLES } from "../fleet/helpers";
import type { InsightsLeaderboardAgentRow, InsightsLeaderboardResponse } from "../../types/api";
import { fetchInsight, InsightSkeleton, ErrCard, InsightEmpty } from "./shared";

function RolePill({ role }: { role?: string }) {
  const meta =
    AGENT_ROLES.find((r) => r.value === role) ??
    AGENT_ROLES.find((r) => r.value === "customer_service") ??
    AGENT_ROLES[0];
  return <span className="text-xs text-muted-foreground">{meta.label}</span>;
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

  const agentRows: InsightsLeaderboardAgentRow[] = Array.isArray(data?.agents) ? data.agents : [];

  return (
    <div className="space-y-3">
      {agentRows.map((a, i) => {
        const metrics = [
          { label: "Calls", value: a.total_calls },
          { label: "Qualified", value: a.qualified },
          { label: "Avg Score", value: a.avg_lead_score },
          { label: "Bookings", value: a.bookings },
          { label: "Minutes", value: a.minutes },
          { label: "$/Qual", value: a.cost_per_qualified ? `$${a.cost_per_qualified}` : "N/A" },
          { label: "$/Outcome", value: a.cost_per_outcome ? `$${a.cost_per_outcome}` : "N/A" },
          { label: "Total Cost", value: a.total_cost ? `$${a.total_cost}` : "N/A" },
        ];
        return (
          <motion.div
            key={a.agent_id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="relative rounded-md wl-panel border p-5 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-4 overflow-hidden sm:gap-y-2"
          >
            <BotMark
              seed={a.agent_id}
              name={a.agent_name}
              markKey={a.mark_key}
              size={24}
              title={`${a.agent_name} mark`}
              className="sm:row-span-2"
            />
            <div className="relative flex min-w-0 flex-wrap items-center gap-2">
              <h4 className="wl-preserve-case font-display text-2xl text-foreground leading-tight">
                {a.agent_name}
              </h4>
              <span
                className="font-mono text-xs text-muted-foreground"
                aria-label={`Rank ${i + 1}`}
              >
                #{i + 1}
              </span>
              {a.rank_delta != null && (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    a.rank_delta > 0
                      ? "wl-text-success"
                      : a.rank_delta < 0
                        ? "text-rose-500"
                        : "text-muted-foreground",
                  )}
                  aria-label={`Rank change: ${a.rank_delta > 0 ? "+" : ""}${a.rank_delta}`}
                >
                  {a.rank_delta > 0
                    ? `+${a.rank_delta}`
                    : a.rank_delta === 0
                      ? "N/A"
                      : a.rank_delta}
                </span>
              )}
              <RolePill role={a.role} />
            </div>
            <dl className="relative col-span-2 grid grid-cols-2 gap-x-4 gap-y-5 sm:col-span-1 sm:col-start-2 sm:grid-cols-4 lg:grid-cols-8">
              {metrics.map((metric) => (
                <div key={metric.label} className="min-w-0 space-y-1">
                  <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                  <dd className="font-display text-2xl leading-tight tabular-nums text-foreground">
                    {metric.value}
                  </dd>
                </div>
              ))}
            </dl>
          </motion.div>
        );
      })}
    </div>
  );
}
