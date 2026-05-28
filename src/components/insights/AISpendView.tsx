/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  DollarSign,
  Brain,
  Receipt,
  Database,
  Shield,
  AlertTriangle,
  Lock,
  Save,
  Loader2,
} from "lucide-react";
import { authFetch, readApiJson } from "../../lib/api";
import { formatMoney, safeFixed } from "../../lib/safe-number";
import { cn } from "../../lib/utils";
import { fetchInsight, Spinner, ErrCard, Empty, SpendStat } from "./shared";

/* ─────────────────────────  Spend Budget Card  ─────────────────── */

function SpendBudgetCard() {
  const [status, setStatus] = useState<any>(null);
  const [_budget, setBudget] = useState<any>(null);
  const [draft, setDraft] = useState<{
    monthly_limit_usd: string;
    warn_threshold_pct: number;
    hard_cap: boolean;
    enabled: boolean;
  }>({
    monthly_limit_usd: "",
    warn_threshold_pct: 80,
    hard_cap: false,
    enabled: true,
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
      const statusOut = await readApiJson<Record<string, unknown>>(statusRes);
      const budgetOut = await readApiJson<{ budget?: Record<string, unknown> }>(budgetRes);
      if (statusOut.ok === false) throw new Error(statusOut.error);
      if (budgetOut.ok === false) throw new Error(budgetOut.error);
      const s = statusOut.data;
      const b = budgetOut.data;
      setStatus(s);
      setBudget(b.budget);
      const budgetData = b.budget as Record<string, unknown> | undefined;
      setDraft({
        monthly_limit_usd: budgetData?.monthly_limit_usd
          ? String(budgetData.monthly_limit_usd)
          : "",
        warn_threshold_pct: (budgetData?.warn_threshold_pct as number) ?? 80,
        hard_cap: !!budgetData?.hard_cap,
        enabled: budgetData?.enabled !== false,
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
          hard_cap: draft.hard_cap,
          enabled: draft.enabled,
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
      <div className="rounded-3xl glass border border-white/10 p-6 flex items-center gap-3 text-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading budget…
      </div>
    );
  }

  const limit = Number(status?.monthly_limit_usd || 0);
  const used = Number(status?.month_to_date_usd || 0);
  const pct = limit > 0 ? Math.min(150, (used / limit) * 100) : 0;
  const warnPct = Number(status?.warn_threshold_pct || 80);
  const isOver = limit > 0 && used >= limit;
  const isWarn = limit > 0 && pct >= warnPct && !isOver;
  const barColor = isOver ? "#FF6B6B" : isWarn ? "#FFC07D" : "#10B981";
  const period = status?.period || "—";

  return (
    <div className="relative aurora-ring rounded-3xl">
      <div className="relative rounded-3xl glass-strong border border-white/10 p-6 md:p-7 space-y-5 overflow-hidden">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${barColor}22`, border: `1px solid ${barColor}55` }}
            >
              <Shield className="w-4 h-4" style={{ color: barColor }} />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.4em]" style={{ color: barColor }}>
                Monthly Budget
              </div>
              <div className="text-sm text-ink/70 mt-1">
                Period <span className="font-mono">{period}</span> · resets on the 1st (UTC)
              </div>
            </div>
          </div>
          {status?.hard_capped_now && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs">
              <Lock className="w-3.5 h-3.5" /> Hard cap active — AI calls are blocked
            </div>
          )}
          {!status?.hard_capped_now && isWarn && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" /> Spend has crossed your warn threshold
            </div>
          )}
        </div>

        {limit > 0 ? (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="font-display italic text-3xl text-ink leading-none">
                ${safeFixed(used, 2)}{" "}
                <span className="text-ink/70 text-xl">/ ${safeFixed(limit, 2)}</span>
              </div>
              <div className="app-section-title">{safeFixed(pct, 1)}% used</div>
            </div>
            <div className="relative h-3 rounded-full bg-black/10 overflow-hidden">
              <div
                className="absolute inset-y-0 w-px bg-black/30"
                style={{ left: `${warnPct}%` }}
                title={`Warn threshold ${warnPct}%`}
              />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, pct)}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ background: `linear-gradient(90deg, ${barColor}aa, ${barColor})` }}
              />
            </div>
            {Array.isArray(status?.alerts_fired) && status.alerts_fired.length > 0 && (
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted pt-1">
                Alerts fired this period:{" "}
                {status.alerts_fired.map((a: any) => `${a.threshold_pct}%`).join(" · ")}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-ink/70">
            No monthly limit set. Configure one below to enable warnings and (optionally) a hard
            cap.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <label className="space-y-1.5">
            <span className="app-section-title">Monthly limit (USD)</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="decimal"
              value={draft.monthly_limit_usd}
              onChange={(e) => setDraft({ ...draft, monthly_limit_usd: e.target.value })}
              placeholder="e.g. 200"
              className="w-full h-11 px-4 rounded-xl glass border border-white/10 outline-none text-ink text-sm focus:border-brand/60 transition-all font-mono"
            />
          </label>
          <label className="space-y-1.5">
            <span className="app-section-title">Warn at (% of limit)</span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="99"
              step="1"
              value={draft.warn_threshold_pct}
              onChange={(e) =>
                setDraft({ ...draft, warn_threshold_pct: parseInt(e.target.value || "80") })
              }
              className="w-full h-11 px-4 rounded-xl glass border border-white/10 outline-none text-ink text-sm focus:border-brand/60 transition-all font-mono"
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              onClick={() => setDraft({ ...draft, hard_cap: !draft.hard_cap })}
              className={cn(
                "h-11 px-4 rounded-xl border flex items-center gap-2 text-xs uppercase tracking-[0.25em] transition-all",
                draft.hard_cap
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-600"
                  : "glass border-white/10 text-ink/70 hover:border-white/30",
              )}
              title="When on, AI calls return HTTP 402 once you've reached the monthly limit."
            >
              <Lock className="w-3.5 h-3.5" /> Hard cap {draft.hard_cap ? "on" : "off"}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="text-[11px] text-ink/70">
            Threshold crossings fire <span className="font-mono text-ink/75">spend.warning</span>{" "}
            and <span className="font-mono text-ink/75">spend.exceeded</span> webhook events — wire
            them to Slack/CRM in Admin.
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="h-11 px-5 rounded-xl bg-brand text-on-brand text-xs uppercase tracking-[0.25em] font-medium flex items-center gap-2 disabled:opacity-50 hover:opacity-90 transition-all"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saving ? "Saving" : "Save budget"}
          </button>
        </div>
        {error && (
          <div role="alert" className="text-xs text-rose-500">
            {error}
          </div>
        )}
        {savedAt && !error && Date.now() - savedAt < 4000 && (
          <div className="text-xs text-emerald-600">Saved.</div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────  AI Spend View  ─────────────────────── */

export default function AISpendView({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr(null);
    fetchInsight(`/api/audit/summary?days=${days}`)
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
  if (!data || !data.totals) return null;

  const { totals, by_day = [], by_action = [], by_model = [] } = data;
  const callsHaveHappened = totals.calls > 0;

  const maxDay = Math.max(0.01, ...by_day.map((d: any) => Number(d.cost)));
  const maxAction = Math.max(0.01, ...by_action.map((a: any) => Number(a.cost)));

  return (
    <div className="space-y-5">
      <SpendBudgetCard />

      {!callsHaveHappened && (
        <Empty label="No AI usage in this window — try a longer range or run a recipe." />
      )}

      {callsHaveHappened && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <SpendStat
              label="Total Spend"
              value={formatMoney(totals?.cost, 2)}
              icon={DollarSign}
              accent="#4F1E7B"
            />
            <SpendStat
              label="AI Calls"
              value={String(totals.calls)}
              icon={Brain}
              accent="#4F1E7B"
            />
            <SpendStat
              label="Avg / Call"
              value={formatMoney(totals?.avg_cost_per_call, 4)}
              icon={Receipt}
              accent="#4F1E7B"
            />
            <SpendStat
              label="Saved by Cache"
              value={formatMoney(totals?.cache_savings_usd, 2)}
              icon={Database}
              accent="#10B981"
            />
          </div>

          <div className="relative aurora-ring rounded-3xl">
            <div className="relative rounded-3xl glass-strong overflow-hidden p-6 md:p-8">
              <div className="app-section-title text-brand mb-5">
                Spend per Day · {data.window_days}d
              </div>
              <div className="space-y-2">
                {by_day.map((d: any, i: number) => {
                  const pct = (Number(d.cost) / maxDay) * 100;
                  return (
                    <motion.div
                      key={d.day}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.02, duration: 0.4 }}
                      className="flex items-center gap-3"
                    >
                      <span className="shrink-0 text-[10px] uppercase tracking-[0.25em] text-muted w-20 font-mono">
                        {d.day.slice(5)}
                      </span>
                      <div className="flex-1 relative h-7 rounded-lg bg-black/10 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: i * 0.02 }}
                          className="absolute inset-y-0 left-0 rounded-lg flex items-center px-3"
                          style={{ background: "#4F1E7B" }}
                        >
                          <span className="text-[10px] font-mono text-on-brand font-medium">
                            ${safeFixed(d.cost, 2)}
                          </span>
                        </motion.div>
                        <span className="absolute inset-y-0 right-3 flex items-center text-[10px] text-muted">
                          {d.calls} calls
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="relative aurora-ring rounded-2xl">
              <div className="relative rounded-2xl glass border border-white/10 p-5 space-y-3">
                <div className="app-section-title text-brand">Spend by Recipe</div>
                <div className="space-y-2">
                  {by_action.slice(0, 12).map((a: any, i: number) => {
                    const pct = (Number(a.cost) / maxAction) * 100;
                    return (
                      <div key={a.action} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm text-ink/85 truncate">{a.action}</span>
                          <span className="font-display italic text-lg text-aurora tabular-nums shrink-0">
                            ${safeFixed(a.cost, 3)}
                          </span>
                        </div>
                        <div className="relative h-1.5 rounded-full bg-black/10 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.6, delay: i * 0.03 }}
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{ background: "#4F1E7B" }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.25em] text-muted">
                          <span>{a.calls} calls</span>
                          <span>avg {a.avg_latency_ms}ms</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="relative aurora-ring rounded-2xl">
              <div className="relative rounded-2xl glass border border-white/10 p-5 space-y-3">
                <div className="app-section-title text-brand">Spend by Model</div>
                <div className="space-y-3">
                  {by_model.map((m: any) => (
                    <div
                      key={m.model}
                      className="flex items-baseline justify-between border-b border-white/5 pb-3 last:border-0 last:pb-0"
                    >
                      <div>
                        <div className="text-sm font-mono text-ink/90">{m.model}</div>
                        <div className="text-[10px] uppercase tracking-[0.25em] text-muted mt-1">
                          {m.calls} calls
                        </div>
                      </div>
                      <div className="font-display italic text-2xl text-aurora">
                        ${safeFixed(m.cost, 2)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-3 border-t border-white/5">
                  <div className="app-section-title mb-1">Tokens (window)</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      Input{" "}
                      <span className="text-ink/80 font-mono ml-1">
                        {totals.input.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      Output{" "}
                      <span className="text-ink/80 font-mono ml-1">
                        {totals.output.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      Cache reads{" "}
                      <span className="text-emerald-500 font-mono ml-1">
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
          </div>
        </>
      )}
    </div>
  );
}
