/* eslint-disable @typescript-eslint/no-explicit-any */
import { WL_APP_CLASSES } from "../../lib/wireline-design-system";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  DollarSign,
  Brain,
  Receipt,
  Database,
  Shield,
  AlertTriangle,
  Save,
  Loader2,
} from "lucide-react";
import { authFetch, readApiJson } from "../../lib/api";
import { formatMoney, safeFixed } from "../../lib/safe-number";
import { cn } from "../../lib/utils";
import { fetchInsight, InsightSkeleton, ErrCard, InsightEmpty, SpendStat } from "./shared";
import type { AuditSummary } from "../../types/api-insights";
import { Input } from "../ui/shadcn/Input";
import { ShadButton } from "../ui/shadcn/ShadButton";

import { BRAND } from "../../constants/brand-colors";

type SpendGuardScope = "free_simulation_allowance" | "plan_funded";

type SpendStatus = {
  period?: string;
  month_to_date_usd?: number;
  monthly_limit_usd?: number;
  maximum_limit_usd?: number;
  percent_used?: number;
  hard_cap?: boolean;
  enabled?: boolean;
  warn_threshold_pct?: number;
  hard_capped_now?: boolean;
  alerts_fired?: Array<{ threshold_pct: number }>;
  guard_scope?: SpendGuardScope;
  plan_name?: string;
  live_provider_work_enabled?: boolean;
  simulation_allowance_enabled?: boolean;
};

type SpendBudget = {
  monthly_limit_usd?: number | string;
  maximum_limit_usd?: number;
  hard_cap?: boolean;
  warn_threshold_pct?: number;
  enabled?: boolean;
  guard_scope?: SpendGuardScope;
  plan_name?: string;
  live_provider_work_enabled?: boolean;
  simulation_allowance_enabled?: boolean;
};

/* ─────────────────────────  Spend Budget Card  ─────────────────── */

function SpendBudgetCard() {
  const [status, setStatus] = useState<SpendStatus | null>(null);
  const [_budget, setBudget] = useState<SpendBudget | null>(null);
  const [draft, setDraft] = useState<{
    monthly_limit_usd: string;
    warn_threshold_pct: number;
  }>({
    monthly_limit_usd: "",
    warn_threshold_pct: 80,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [statusRes, budgetRes] = await Promise.all([
        authFetch("/api/spend/status"),
        authFetch("/api/spend/budget"),
      ]);
      const statusOut = await readApiJson<SpendStatus>(statusRes);
      const budgetOut = await readApiJson<{ budget?: SpendBudget }>(budgetRes);
      if (statusOut.ok === false) throw new Error(statusOut.error);
      if (budgetOut.ok === false) throw new Error(budgetOut.error);
      const s = statusOut.data;
      const budgetData = budgetOut.data.budget;
      setStatus(s);
      setBudget(budgetData ?? null);
      setDraft({
        monthly_limit_usd: budgetData?.monthly_limit_usd
          ? String(budgetData.monthly_limit_usd)
          : "",
        warn_threshold_pct: budgetData?.warn_threshold_pct ?? 80,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const limit = parseFloat(draft.monthly_limit_usd || "0");
      const r = await authFetch("/api/spend/budget", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthly_limit_usd: Number.isFinite(limit) ? limit : 0,
          warn_threshold_pct: draft.warn_threshold_pct,
          hard_cap: true,
          enabled: true,
        }),
      });
      const out = await readApiJson(r);
      if (out.ok === false) throw new Error(out.error);
      setSavedAt(Date.now());
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !status) {
    return (
      <div className="rounded-md wl-panel p-6 flex items-center gap-3 text-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading budget…
      </div>
    );
  }

  const limit = Number(status?.monthly_limit_usd || 0);
  const used = Number(status?.month_to_date_usd || 0);
  const maximumLimit = Number(status?.maximum_limit_usd || limit || 0);
  const pct = limit > 0 ? Math.min(150, (used / limit) * 100) : 0;
  const warnPct = Number(status?.warn_threshold_pct || 80);
  const isOver = limit > 0 && used >= limit;
  const isWarn = limit > 0 && pct >= warnPct && !isOver;
  const barColor = isOver
    ? BRAND.colors.error
    : isWarn
      ? BRAND.colors.outlineVariant
      : BRAND.colors.primary;
  const period = status?.period || "—";
  const isSimulationAllowance = status?.guard_scope === "free_simulation_allowance";
  const guardTitle = isSimulationAllowance ? "Simulation allowance" : "Provider spend guard";
  const capReachedCopy = isSimulationAllowance
    ? "Simulation allowance reached — private simulation is paused"
    : "Provider spend limit reached — new provider work is paused";
  const maximumHelper = isSimulationAllowance
    ? `Up to $${safeFixed(maximumLimit, 2)} for private setup, training, and simulation. Activate a paid plan to go live.`
    : `Up to $${safeFixed(maximumLimit, 2)} for ${status?.plan_name || "the active plan"}. You can lower this guard, but it cannot exceed the provider-cost envelope funded by the plan.`;
  const hardCapHelper = isSimulationAllowance
    ? "Private simulation pauses at the monthly allowance. Live provider work requires a paid plan."
    : "New provider-funded work pauses at the limit. Completed in-flight work still settles.";

  return (
    <div className={cn(WL_APP_CLASSES.panelFrame, "p-6 md:p-7 space-y-5")} data-accent={barColor}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md flex items-center justify-center wl-accent-surface">
            <Shield className="w-4 h-4 wl-accent-text" />
          </div>
          <div>
            <div className="wl-insight-label tracking-[0.32em] wl-accent-text">{guardTitle}</div>
            <div className="text-sm text-foreground/70 mt-1 font-mono">{period}</div>
            {isSimulationAllowance && (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Funds private setup, training, and simulation. Activate a paid plan to go live.
              </p>
            )}
          </div>
        </div>
        {(isWarn || status?.hard_capped_now) && (
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border",
              status?.hard_capped_now
                ? "bg-rose-500/10 border-rose-500/30 text-rose-500"
                : "bg-brand/10 border-brand/30 text-brand",
            )}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            {status?.hard_capped_now ? capReachedCopy : "Spend has crossed your warn threshold"}
          </div>
        )}
      </div>

      {limit > 0 ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="font-display text-3xl text-foreground leading-none">
              ${safeFixed(used, 2)}{" "}
              <span className="text-foreground/70 text-xl">/ ${safeFixed(limit, 2)}</span>
            </div>
            <div className="app-section-title">{safeFixed(pct, 1)}% used</div>
          </div>
          <div className="relative h-3 rounded-full bg-black/10 overflow-hidden">
            <div
              className="absolute inset-y-0 w-px wl-threshold-marker"
              style={{ left: `${warnPct}%` }}
              title={`Warn threshold ${warnPct}%`}
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, pct)}%` }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-y-0 left-0 rounded-full wl-accent-progress"
            />
          </div>
          {Array.isArray(status?.alerts_fired) && status.alerts_fired.length > 0 && (
            <div className="wl-insight-label pt-1">
              Alerts fired this period:{" "}
              {status.alerts_fired.map((a: any) => `${a.threshold_pct}%`).join(" · ")}
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-foreground/70">No limit set</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
        <label className="space-y-1.5">
          <span className="app-section-title">Monthly safety limit (USD)</span>
          <Input
            type="number"
            min="0.01"
            max={maximumLimit || undefined}
            step="0.01"
            inputMode="decimal"
            value={draft.monthly_limit_usd}
            onChange={(e) => setDraft({ ...draft, monthly_limit_usd: e.target.value })}
            placeholder="e.g. 200"
            className="w-full h-11 px-4 rounded-md wl-panel border border-border outline-none text-foreground text-sm focus:border-brand/60 transition-all font-mono"
          />
          <span className="block text-[11px] leading-5 text-muted-foreground">{maximumHelper}</span>
        </label>
        <label className="space-y-1.5">
          <span className="app-section-title">Warn at (% of limit)</span>
          <Input
            type="number"
            inputMode="numeric"
            min="1"
            max="99"
            step="1"
            value={draft.warn_threshold_pct}
            onChange={(e) =>
              setDraft({ ...draft, warn_threshold_pct: parseInt(e.target.value || "80") })
            }
            className="w-full h-11 px-4 rounded-md wl-panel border border-border outline-none text-foreground text-sm focus:border-brand/60 transition-all font-mono"
          />
        </label>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3">
        <div>
          <div className="text-sm font-medium text-foreground">
            {isSimulationAllowance ? "Monthly allowance enforced" : "Hard cap enforced"}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{hardCapHelper}</p>
        </div>
        <span className="rounded-full border border-brand/25 bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">
          Always on
        </span>
      </div>

      <div className="flex items-center justify-end gap-4 pt-1">
        <ShadButton
          type="button"
          disableAnimations
          variant="editorial"
          onClick={save}
          disabled={
            saving ||
            !(Number(draft.monthly_limit_usd) > 0) ||
            (maximumLimit > 0 && Number(draft.monthly_limit_usd) > maximumLimit)
          }
          className="h-11 px-5 rounded-md text-xs uppercase tracking-[0.25em] font-medium"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {saving ? "Saving" : "Save budget"}
        </ShadButton>
      </div>
      {error && (
        <div role="alert" className="text-xs text-rose-500">
          {error}
        </div>
      )}
      {savedAt && !error && Date.now() - savedAt < 4000 && (
        <div className="text-xs text-brand">Saved.</div>
      )}
    </div>
  );
}

/* ─────────────────────────  AI Spend View  ─────────────────────── */

export default function AISpendView({ days }: { days: number }) {
  const [data, setData] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);
    fetchInsight<AuditSummary>(`/api/audit/summary?days=${days}`)
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

  if (!data || !data.totals) {
    return (
      <div className="space-y-4">
        <SpendBudgetCard />
        <InsightEmpty
          configKey="spend"
          icon={Brain}
          titleOverride="No AI usage yet"
          fill={false}
          framed={false}
        />
      </div>
    );
  }

  const { totals, by_day = [], by_action = [], by_model = [] } = data;
  const callsHaveHappened = totals.calls > 0;

  const maxDay = Math.max(0.01, ...by_day.map((d) => Number(d.cost)));
  const maxAction = Math.max(0.01, ...by_action.map((a) => Number(a.cost)));

  return (
    <div className="space-y-5">
      <SpendBudgetCard />

      {!callsHaveHappened ? (
        <div className={cn(WL_APP_CLASSES.panelFrame, "p-6 md:p-8")}>
          <InsightEmpty
            configKey="spend"
            icon={Brain}
            titleOverride="No AI usage in this window"
            fill={false}
            framed={false}
          />
        </div>
      ) : null}

      {callsHaveHappened && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <SpendStat
              label="Total Spend"
              value={formatMoney(totals?.cost, 2)}
              icon={DollarSign}
              accent={BRAND.colors.primary}
            />
            <SpendStat
              label="AI Calls"
              value={String(totals.calls)}
              icon={Brain}
              accent={BRAND.colors.primary}
            />
            <SpendStat
              label="Avg / Call"
              value={formatMoney(totals?.avg_cost_per_call, 4)}
              icon={Receipt}
              accent={BRAND.colors.primary}
            />
            <SpendStat
              label="Saved by Cache"
              value={formatMoney(totals?.cache_savings_usd, 2)}
              icon={Database}
              accent={BRAND.colors.primary}
            />
          </div>

          <div className={cn(WL_APP_CLASSES.panelFrame, "p-6 md:p-8")}>
            <div className="mb-5">
              <p className="wl-insight-label text-brand/70">Spend per Day · {data.window_days}d</p>
            </div>
            <div className="space-y-2">
              {by_day.map((d, i) => {
                const pct = (Number(d.cost) / maxDay) * 100;
                return (
                  <motion.div
                    key={d.day}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02, duration: 0.4 }}
                    className="flex items-center gap-3"
                  >
                    <span className="shrink-0 wl-insight-label w-20 font-mono">
                      {d.day.slice(5)}
                    </span>
                    <div className="flex-1 relative h-7 rounded-md bg-black/10 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: i * 0.02 }}
                        className="absolute inset-y-0 left-0 rounded-md flex items-center px-3 bg-brand"
                      >
                        <span className="wl-micro-badge font-mono text-on-brand font-medium">
                          ${safeFixed(d.cost, 2)}
                        </span>
                      </motion.div>
                      <span className="absolute inset-y-0 right-3 flex items-center wl-micro-meta--muted">
                        {d.calls} calls
                      </span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={cn(WL_APP_CLASSES.insightStatCard, "p-5 space-y-3")}>
              <div className="wl-insight-label text-brand/70">Spend by Recipe</div>
              <div className="space-y-2">
                {by_action.slice(0, 12).map((a, i) => {
                  const pct = (Number(a.cost) / maxAction) * 100;
                  return (
                    <div key={a.action} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm text-foreground/85 truncate">{a.action}</span>
                        <span className="font-display text-lg text-brand-display tabular-nums shrink-0">
                          ${safeFixed(a.cost, 3)}
                        </span>
                      </div>
                      <div className="relative h-1.5 rounded-full bg-black/10 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.6, delay: i * 0.03 }}
                          className="absolute inset-y-0 left-0 rounded-full bg-brand"
                        />
                      </div>
                      <div className="flex items-center justify-between wl-insight-label">
                        <span>{a.calls} calls</span>
                        <span>avg {a.avg_latency_ms}ms</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={cn(WL_APP_CLASSES.insightStatCard, "p-5 space-y-3")}>
              <div className="wl-insight-label text-brand/70">Spend by Model</div>
              <div className="space-y-3">
                {by_model.map((m) => (
                  <div
                    key={m.model}
                    className="flex items-baseline justify-between border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <div className="text-sm font-mono text-foreground/90">{m.model}</div>
                      <div className="wl-insight-label mt-1">{m.calls} calls</div>
                    </div>
                    <div className="font-display text-2xl text-brand-display">
                      ${safeFixed(m.cost, 2)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-3 border-t border-border">
                <div className="app-section-title mb-1">Tokens (window)</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  <div>
                    Input{" "}
                    <span className="text-foreground/80 font-mono ml-1">
                      {totals.input.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    Output{" "}
                    <span className="text-foreground/80 font-mono ml-1">
                      {totals.output.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    Cache reads{" "}
                    <span className="text-brand font-mono ml-1">
                      {totals.cache_read.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    Cache writes{" "}
                    <span className="text-brand-2 font-mono ml-1">
                      {totals.cache_create.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
