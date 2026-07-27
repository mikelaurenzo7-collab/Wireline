/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
import React, { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Loader2, DollarSign, Activity, BarChart3, Clock, Cpu } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { clientLog } from "../../lib/client-log";
import { authFetch } from "../../lib/api";
import { formatDateTime } from "../../lib/safe-date";
import { BRAND } from "../../constants/brand-colors";
import { ShadButton } from "../ui/shadcn/ShadButton";

/** Minimum cost denominator to avoid division-by-zero in bar chart scaling. */
const MIN_COST_THRESHOLD = 0.0001;

/** Format an action slug into human-readable display text. */
function formatActionName(action: string): string {
  return action.replace(/-/g, " ");
}

export function AuditActivityPanel() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentLoading, setRecentLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setSummaryError(null);

    authFetch(`/api/audit/summary?days=${days}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) {
          if (active) {
            setSummary(null);
            setSummaryError("Could not load AI usage summary.");
          }
          return;
        }
        const d = await r.json();
        if (active) {
          setSummary(d);
          setSummaryError(null);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          clientLog.error("audit-panel:summary", err);
          if (active) {
            setSummary(null);
            setSummaryError("Could not load AI usage summary.");
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [days]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setRecentLoading(true);
    setRecentError(null);

    authFetch(`/api/audit/recent?limit=20`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) {
          if (active) {
            setRecent([]);
            setRecentError("Could not load recent audit activity.");
          }
          return;
        }
        const d = await r.json();
        if (active) {
          setRecent(d.logs || []);
          setRecentError(null);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          clientLog.error("audit-panel:recent", err);
          if (active) {
            setRecent([]);
            setRecentError("Could not load recent audit activity.");
          }
        }
      })
      .finally(() => {
        if (active) setRecentLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const totals = summary?.totals ?? {};
  const byAction: any[] = summary?.by_action ?? [];
  const byDay: any[] = summary?.by_day ?? [];
  const maxActionCost = Math.max(MIN_COST_THRESHOLD, ...byAction.map((a: any) => Number(a.cost)));

  const windowOpts = [7, 14, 30, 90] as const;

  return (
    <div className="h-full min-h-0 flex flex-col gap-3 scroll-viewport pb-6">
      {/* Window selector */}
      <div className="flex items-center justify-between shrink-0">
        <h3 className="text-eyebrow">AI Usage</h3>
        <div className="flex p-0.5 rounded-full wl-panel border border-border">
          {windowOpts.map((d) => (
            <ShadButton
              key={d}
              type="button"
              variant="ghost"
              disableAnimations
              onClick={() => setDays(d)}
              className={cn(
                "h-auto px-3 py-1 rounded-full wl-label",
                days === d ? "bg-primary/20 text-primary" : "text-muted hover:text-foreground",
              )}
            >
              {d}d
            </ShadButton>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
          <Loader2 className="w-5 h-5 animate-spin text-primary/40" />
          <p className="wl-micro-meta--muted uppercase tracking-[0.2em]">Aggregating ledger...</p>
        </div>
      ) : summaryError ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-12">
          <p className="text-sm text-rose-600" role="alert">
            {summaryError}
          </p>
        </div>
      ) : (
        <>
          {/* Top stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
            {[
              {
                label: "Total Cost",
                val: `$${Number(totals.cost || 0).toFixed(4)}`,
                icon: DollarSign,
              },
              {
                label: "AI Actions",
                val: Number(totals.calls || 0).toLocaleString(),
                icon: Activity,
              },
              {
                label: "Avg Latency",
                val: `${Math.round(totals.avg_latency || 0)}ms`,
                icon: Clock,
              },
              {
                label: "Tokens Used",
                val: Number((totals.input || 0) + (totals.output || 0)).toLocaleString(),
                icon: BarChart3,
              },
            ].map((s) => (
              <div key={s.label} className="p-4 rounded-md wl-panel border border-border">
                <div className="flex items-center gap-2 mb-2 opacity-40">
                  <s.icon className="w-3 h-3" />
                  <span className="wl-label tracking-[0.2em]">{s.label}</span>
                </div>
                <p className="text-sm font-display">{s.val}</p>
              </div>
            ))}
          </div>

          {/* Action breakdown */}
          <div className="grid md:grid-cols-2 gap-3 shrink-0">
            <div className="p-6 rounded-md wl-panel border border-border flex flex-col gap-4">
              <h4 className="text-eyebrow">Cost by Action</h4>
              <div className="space-y-4">
                {byAction.length === 0 ? (
                  <p className="py-8 text-center wl-micro-meta--muted uppercase tracking-widest">
                    No actions logged
                  </p>
                ) : (
                  byAction.map((a) => (
                    <div key={a.action} className="space-y-1.5">
                      <div className="flex justify-between items-end wl-label">
                        <span className="text-muted">{formatActionName(a.action)}</span>
                        <span className="font-mono text-foreground/70">
                          ${Number(a.cost).toFixed(4)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${(Number(a.cost) / maxActionCost) * 100}%` }}
                          className="h-full bg-brand"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Daily Trend */}
            <div className="p-6 rounded-md wl-panel border border-border flex flex-col gap-4">
              <h4 className="text-eyebrow">Cost Trend</h4>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={byDay}>
                    <defs>
                      <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={BRAND.colors.primary} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={BRAND.colors.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      vertical={false}
                      strokeDasharray="3 3"
                      stroke="var(--wireline-color-border-soft)"
                    />
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{
                        fontSize: "var(--wireline-typography-overline-size)",
                        fill: "var(--muted-foreground)",
                      }}
                      tickFormatter={(val: any) =>
                        new Date(val).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      }
                    />
                    <YAxis hide domain={[0, "auto"]} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--wireline-color-surface-default)",
                        border: "none",
                        borderRadius: 0,
                        boxShadow: "0 10px 30px rgba(0,0,0,0.1)",
                        fontSize: "var(--wireline-typography-overline-size)",
                      }}
                      formatter={(val: unknown) => [`$${Number(val ?? 0).toFixed(4)}`, "Cost"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="cost"
                      stroke={BRAND.colors.primary}
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#costGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Recent Ledger */}
          <div className="flex-1 min-h-[300px] p-6 rounded-md wl-panel border border-border flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h4 className="text-eyebrow">Recent Autonomous Actions</h4>
              {recentLoading && <Loader2 className="w-3 h-3 animate-spin text-muted" />}
            </div>
            <div className="space-y-1">
              {recentError ? (
                <div className="py-20 text-center">
                  <p className="text-sm text-rose-600" role="alert">
                    {recentError}
                  </p>
                </div>
              ) : recent.length === 0 && !recentLoading ? (
                <div className="py-20 text-center">
                  <p className="wl-micro-meta--muted uppercase tracking-[0.3em]">
                    No recent activity found
                  </p>
                </div>
              ) : (
                recent.map((entry: any) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-4 py-2.5 px-3 hover:bg-muted/50 rounded-md transition-all border-b border-border/50 last:border-0 group"
                  >
                    <div
                      className={cn(
                        "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
                        entry.status === "error"
                          ? "bg-rose-500/10 text-rose-500"
                          : "bg-primary/10 text-primary",
                      )}
                    >
                      <Cpu className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[var(--wireline-typography-overline-size)] font-medium text-[var(--wireline-color-text-primary)] truncate uppercase tracking-wider">
                        {formatActionName(entry.action)}
                      </p>
                      <p className="wl-micro-meta--muted truncate">
                        {entry.metadata?.agent_name || "System"} · {entry.model || entry.model_id}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {(entry.latencyMs || entry.latency_ms) && (
                        <span className="wl-micro-badge font-mono text-muted/70 tabular-nums flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {entry.latencyMs || entry.latency_ms}ms
                        </span>
                      )}
                      <span className="wl-micro-badge font-mono text-foreground/70 tabular-nums w-16 text-right">
                        {(entry.costUsd ?? entry.cost_usd) != null
                          ? `$${Number(entry.costUsd ?? entry.cost_usd).toFixed(5)}`
                          : "—"}
                      </span>
                      <span className="wl-micro-meta--muted tabular-nums w-24 text-right">
                        {formatDateTime(
                          entry.createdAt ?? entry.created_at,
                          { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
                          "",
                        )}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
