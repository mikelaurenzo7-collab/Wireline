import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Target, Plus, Pencil, Trash2, Check, X, Loader2 } from "lucide-react";
import { authFetch } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { Input } from "./ui/shadcn/Input";
import { ShadButton } from "./ui/shadcn/ShadButton";

/* ──────────────────────────────────────────────────────────────────────────
   GoalsView — the Insights → Goals tab.

   Account Holders set monthly voice-agent targets (calls handled, appointments booked,
   qualified leads, voice minutes) and watch live progress against an even
   daily run-rate. Reads /api/goals; the progress math lives in
   src/lib/goals.ts and is computed server-side on every fetch.
   ────────────────────────────────────────────────────────────────────────── */

type GoalStatus = "achieved" | "ahead" | "on_track" | "behind";

interface MetricDef {
  id: string;
  label: string;
  unit: string;
  description: string;
  accent: string;
}

interface Goal {
  id: string;
  metric: string;
  metric_label: string;
  unit: string;
  accent: string;
  label: string | null;
  target: number;
  actual: number;
  percent: number;
  fraction: number;
  remaining: number;
  pace_fraction: number;
  projected: number;
  days_left: number;
  status: GoalStatus;
}

interface GoalsData {
  period: string;
  period_label: string;
  metrics: MetricDef[];
  actuals: Record<string, number>;
  goals: Goal[];
}

// CSS custom properties, not BRAND hex constants: the generated TS values are
// the dark palette only, while these variables re-resolve under the Paper
// (light) theme so the chip keeps AA contrast on white cards.
const STATUS_META: Record<GoalStatus, { label: string; color: string }> = {
  achieved: { label: "Achieved", color: "var(--wireline-color-action-primary-default)" },
  ahead: { label: "Ahead of pace", color: "var(--wireline-color-action-primary-default)" },
  on_track: { label: "On track", color: "var(--wireline-color-action-primary-default)" },
  behind: { label: "Behind pace", color: "var(--wireline-color-text-secondary)" },
};

const num = (n: number) => n.toLocaleString();

function Ring({
  fraction,
  accent,
  children,
}: {
  fraction: number;
  accent: string;
  children: React.ReactNode;
}) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const dash = Math.max(0, Math.min(1, fraction)) * C;
  return (
    <div className="relative w-[132px] h-[132px] shrink-0">
      <svg viewBox="0 0 132 132" className="w-full h-full -rotate-90">
        <circle
          cx="66"
          cy="66"
          r={R}
          fill="none"
          stroke="var(--wireline-color-border-default)"
          strokeWidth="11"
        />
        <motion.circle
          cx="66"
          cy="66"
          r={R}
          fill="none"
          stroke={accent}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C - dash }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children}
      </div>
    </div>
  );
}

function GoalEditor({
  metric,
  current,
  initialTarget,
  initialLabel,
  saving,
  onSave,
  onCancel,
}: {
  metric: MetricDef;
  current: number;
  initialTarget: string;
  initialLabel: string;
  saving: boolean;
  onSave: (target: number, label: string) => void;
  onCancel: () => void;
}) {
  const [target, setTarget] = useState(initialTarget);
  const [label, setLabel] = useState(initialLabel);
  const parsed = Number(target);
  const valid = Number.isFinite(parsed) && parsed >= 1;

  return (
    <div className="relative rounded-md wl-panel border border-border p-5 flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 wl-accent-metric-chip"
          data-accent={metric.accent}
        >
          <Target className="w-3.5 h-3.5" />
        </span>
        <h3 className="font-display italic text-lg text-foreground leading-tight">
          {metric.label}
        </h3>
      </div>
      <p className="text-caption leading-relaxed">{metric.description}</p>

      <label className="block">
        <span className="wl-label-muted">Monthly target ({metric.unit})</span>
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          value={target}
          autoFocus
          onChange={(e) => setTarget(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid && !saving) onSave(Math.round(parsed), label);
            if (e.key === "Escape") onCancel();
          }}
          className="mt-1 w-full h-11 px-3 rounded-md wl-panel border border-border text-foreground text-sm tabular-nums focus:outline-none focus:border-brand/40"
        />
      </label>

      <label className="block">
        <span className="wl-label-muted">Label (optional)</span>
        <Input
          type="text"
          value={label}
          maxLength={80}
          placeholder="e.g. Q2 push"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid && !saving) onSave(Math.round(parsed), label);
            if (e.key === "Escape") onCancel();
          }}
          className="mt-1 w-full h-11 px-3 rounded-md wl-panel border border-border text-foreground text-sm focus:outline-none focus:border-brand/40"
        />
      </label>

      <p className="wl-micro-meta--muted tabular-nums">
        {num(current)} {metric.unit} so far this month
      </p>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <ShadButton
          type="button"
          variant="editorial"
          disableAnimations
          onClick={() => valid && onSave(Math.round(parsed), label)}
          disabled={!valid || saving}
          className="flex-1 min-h-11 rounded-md text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.14em]"
        >
          {saving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          Save goal
        </ShadButton>
        <ShadButton
          type="button"
          variant="outline"
          disableAnimations
          onClick={onCancel}
          disabled={saving}
          className="min-h-11 px-3 rounded-md text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.14em]"
        >
          Cancel
        </ShadButton>
      </div>
    </div>
  );
}

function GoalCard({
  goal,
  onEdit,
  onDelete,
  deleting,
}: {
  goal: Goal;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [confirm, setConfirm] = useState(false);
  const status = STATUS_META[goal.status];

  return (
    <div className="relative rounded-md wl-panel border border-border p-5 flex flex-col gap-4 h-full overflow-hidden">
      <div
        className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 blur-3xl pointer-events-none wl-accent-halo"
        data-accent={goal.accent}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display italic text-lg text-foreground leading-tight truncate">
            {goal.metric_label}
          </h3>
          {goal.label && <p className="wl-label-muted opacity-80 truncate mt-0.5">{goal.label}</p>}
        </div>
        <span
          className="shrink-0 px-2 py-1 rounded-full border wl-label font-medium"
          style={{
            color: status.color,
            borderColor: `color-mix(in srgb, ${status.color} 30%, transparent)`,
            background: `color-mix(in srgb, ${status.color} 10%, transparent)`,
          }}
        >
          {status.label}
        </span>
      </div>

      <div className="relative flex items-center gap-4">
        <Ring fraction={goal.fraction} accent={goal.accent}>
          <span className="font-semibold text-2xl text-foreground tabular-nums leading-none">
            {goal.percent}%
          </span>
          <span className="wl-label-muted mt-1">of target</span>
        </Ring>
        <div className="min-w-0 flex flex-col gap-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-semibold text-3xl text-brand-display tabular-nums">
              {num(goal.actual)}
            </span>
            <span className="text-sm text-muted tabular-nums">/ {num(goal.target)}</span>
          </div>
          <span className="wl-label-muted">{goal.unit}</span>
          <div className="mt-1 text-[length:var(--wireline-typography-overline-size)] text-foreground/70 leading-relaxed">
            {goal.status === "achieved" ? (
              <span className="text-brand font-medium">Target reached — nice work.</span>
            ) : (
              <>
                <span className="tabular-nums">{num(goal.remaining)}</span> to go ·{" "}
                <span className="tabular-nums">{goal.days_left}</span>{" "}
                {goal.days_left === 1 ? "day" : "days"} left
              </>
            )}
          </div>
          {goal.status !== "achieved" && (
            <div className="wl-micro-meta--muted tabular-nums">
              Projected {num(goal.projected)} at current pace
            </div>
          )}
        </div>
      </div>

      <div className="relative mt-auto flex items-center gap-2 pt-1">
        <ShadButton
          type="button"
          variant="outline"
          size="sm"
          disableAnimations
          onClick={onEdit}
          className="flex-1 min-h-8 rounded-md wl-label"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </ShadButton>
        {confirm ? (
          <>
            <ShadButton
              type="button"
              variant="destructive"
              size="sm"
              disableAnimations
              onClick={onDelete}
              disabled={deleting}
              className="min-h-8 px-3 rounded-md wl-label"
            >
              {deleting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Confirm
            </ShadButton>
            <ShadButton
              type="button"
              variant="outline"
              size="icon"
              disableAnimations
              onClick={() => setConfirm(false)}
              disabled={deleting}
              className="min-h-8 w-8 rounded-md"
              aria-label="Cancel delete"
            >
              <X className="w-3.5 h-3.5" />
            </ShadButton>
          </>
        ) : (
          <ShadButton
            type="button"
            variant="outline"
            size="icon"
            disableAnimations
            onClick={() => setConfirm(true)}
            className="min-h-8 w-8 rounded-md hover:text-rose-600"
            aria-label="Delete goal"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </ShadButton>
        )}
      </div>
    </div>
  );
}

function EmptyMetricCard({
  metric,
  current,
  onCreate,
}: {
  metric: MetricDef;
  current: number;
  onCreate: () => void;
}) {
  return (
    <div className="relative rounded-md wl-panel border border-dashed border-border p-5 flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 wl-accent-metric-chip--subtle"
          data-accent={metric.accent}
        >
          <Target className="w-3.5 h-3.5" />
        </span>
        <h3 className="font-display italic text-lg text-foreground/80 leading-tight">
          {metric.label}
        </h3>
      </div>
      <p className="text-caption leading-relaxed">{metric.description}</p>
      <p className="text-[length:var(--wireline-typography-overline-size)] text-foreground/70 tabular-nums">
        <span className="font-display italic text-xl text-foreground/75">{num(current)}</span>{" "}
        {metric.unit} so far this month
      </p>
      <ShadButton
        type="button"
        variant="outline"
        disableAnimations
        onClick={onCreate}
        className="mt-auto min-h-11 w-full rounded-md text-brand text-[length:var(--wireline-typography-overline-size)] uppercase tracking-[0.14em] hover:bg-brand/5"
      >
        <Plus className="w-3.5 h-3.5" />
        Set a target
      </ShadButton>
    </div>
  );
}

export default function GoalsView() {
  const { success, error: toastError } = useToast();
  const [data, setData] = useState<GoalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ metric: string; goalId: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchGoals = useCallback(async () => {
    try {
      const r = await authFetch("/api/goals");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setData(d);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGoals();
  }, [fetchGoals]);

  const saveGoal = useCallback(
    async (metric: string, target: number, label: string) => {
      setSaving(true);
      try {
        const r = await authFetch("/api/goals", {
          method: "POST",
          body: JSON.stringify({ metric, target, label }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        success("Goal saved", `${d.goal?.metric_label || "Target"} set to ${num(target)}.`);
        setEditing(null);
        await fetchGoals();
      } catch (e) {
        toastError("Couldn't save goal", e instanceof Error ? e.message : "Please try again.");
      } finally {
        setSaving(false);
      }
    },
    [fetchGoals, success, toastError],
  );

  const deleteGoal = useCallback(
    async (goal: Goal) => {
      setDeletingId(goal.id);
      try {
        const r = await authFetch(`/api/goals/${goal.id}`, { method: "DELETE" });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
        success("Goal removed", `${goal.metric_label} target cleared.`);
        await fetchGoals();
      } catch (e) {
        toastError("Couldn't remove goal", e instanceof Error ? e.message : "Please try again.");
      } finally {
        setDeletingId(null);
      }
    },
    [fetchGoals, success, toastError],
  );

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center gap-3">
        <Loader2 className="w-7 h-7 text-brand animate-spin" />
        <p className="wl-label-muted opacity-70">Loading goals</p>
      </div>
    );
  }

  if (err || !data || !data.metrics || !data.goals) {
    return (
      <div className="rounded-md bg-rose-500/10 border border-rose-500/30 p-6 text-rose-600 text-sm">
        {err || "Goals unavailable."}
      </div>
    );
  }

  const goalByMetric = new Map(data.goals.map((g) => [g.metric, g]));
  const activeGoals = data.goals.length;
  const onPace = data.goals.filter(
    (g) => g.status === "achieved" || g.status === "ahead" || g.status === "on_track",
  ).length;

  return (
    <div className="space-y-4">
      <div className="relative rounded-md wl-panel-elevated border border-border overflow-hidden p-6 md:p-7 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-eyebrow text-brand mb-1">Monthly targets · {data.period_label}</p>
          <h2 className="font-display italic text-2xl md:text-3xl text-foreground leading-tight">
            {activeGoals === 0
              ? "Set your first agent goal"
              : `${onPace} of ${activeGoals} ${activeGoals === 1 ? "goal" : "goals"} on pace`}
          </h2>
          <p className="mt-1 text-caption max-w-md leading-relaxed">
            Goals measure live voice-agent activity against an even daily run-rate for the current
            calendar month.
          </p>
        </div>
        <div className="w-14 h-14 rounded-md bg-brand/10 border border-brand/20 flex items-center justify-center shrink-0">
          <Target className="w-7 h-7 text-brand" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3">
        <AnimatePresence mode="popLayout">
          {data.metrics.map((metric) => {
            const goal = goalByMetric.get(metric.id);
            const isEditing = editing?.metric === metric.id;
            const current = data.actuals[metric.id] ?? 0;
            return (
              <motion.div
                key={metric.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                {isEditing ? (
                  <GoalEditor
                    metric={metric}
                    current={current}
                    initialTarget={goal ? String(goal.target) : ""}
                    initialLabel={goal?.label || ""}
                    saving={saving}
                    onSave={(target, label) => void saveGoal(metric.id, target, label)}
                    onCancel={() => setEditing(null)}
                  />
                ) : goal ? (
                  <GoalCard
                    goal={goal}
                    deleting={deletingId === goal.id}
                    onEdit={() => setEditing({ metric: metric.id, goalId: goal.id })}
                    onDelete={() => void deleteGoal(goal)}
                  />
                ) : (
                  <EmptyMetricCard
                    metric={metric}
                    current={current}
                    onCreate={() => setEditing({ metric: metric.id, goalId: null })}
                  />
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
