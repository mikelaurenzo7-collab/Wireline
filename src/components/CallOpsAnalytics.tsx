import { useEffect, useState } from "react";

import { authFetch } from "../lib/api";
import { CardRowSkeleton } from "./atoms/skeleton-presets";
import { EmptyState } from "./ui/EmptyState";

type CallOpsAnalyticsResponse = {
  totalCalls: number;
  totalSeconds: number;
  avgDurationSeconds: number;
  avgQaScore: number | null;
  weekdayCounts: number[];
  timeZone: string;
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export default function CallOpsAnalytics() {
  const [analytics, setAnalytics] = useState<CallOpsAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    authFetch(`/api/call-ops/analytics?timezone=${encodeURIComponent(timeZone)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load call analytics.");
        return response.json() as Promise<CallOpsAnalyticsResponse>;
      })
      .then((body) => {
        if (cancelled) return;
        setAnalytics(body);
      })
      .catch(() => {
        if (cancelled) return;
        setAnalytics(null);
        setError("Could not load call analytics.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <CardRowSkeleton />;
  if (error || !analytics) {
    return (
      <EmptyState
        title="Analytics unavailable"
        description={error || "Could not load call analytics."}
        density="compact"
        withHalo={false}
      />
    );
  }
  if (analytics.totalCalls === 0) {
    return (
      <EmptyState
        title="No call history yet"
        description="Metrics will appear when calls are logged."
        density="compact"
        withHalo={false}
      />
    );
  }

  const totalMinutes = analytics.totalSeconds / 60;
  const weekdayCounts = DAY_LABELS.map((_, index) =>
    Math.max(0, Number(analytics.weekdayCounts[index] ?? 0)),
  );
  const maxWeekday = Math.max(...weekdayCounts, 1);
  const weekdayTrend = DAY_LABELS.map((label, index) => ({
    label,
    count: weekdayCounts[index],
    pct: Math.round((weekdayCounts[index] / maxWeekday) * 100),
  }));
  const metrics = [
    { label: "Total calls", value: analytics.totalCalls },
    { label: "Total minutes", value: totalMinutes.toFixed(1) },
    {
      label: "Avg duration",
      value:
        analytics.avgDurationSeconds > 0
          ? `${(analytics.avgDurationSeconds / 60).toFixed(1)} min`
          : "N/A",
    },
    {
      label: "Avg QA score",
      value: analytics.avgQaScore != null ? analytics.avgQaScore.toFixed(1) : "N/A",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-[12px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-4"
          >
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--wireline-color-text-tertiary)]">
              {metric.label}
            </div>
            <div className="mt-1.5 font-[var(--wireline-font-family-display)] text-[clamp(1.2rem,1rem+0.5vw,1.6rem)] leading-none tracking-[-0.02em] text-[var(--wireline-color-text-primary)]">
              {metric.value}
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-[12px] border border-[var(--wireline-color-border-default)] bg-[var(--wireline-color-surface-default)] p-5">
        <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--wireline-color-text-tertiary)]">
          Call volume by day of week
        </div>
        <div className="flex h-40 items-end gap-2">
          {weekdayTrend.map((day) => (
            <div
              key={day.label}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
            >
              <span className="font-[var(--wireline-font-mono)] text-[10px] text-[var(--wireline-color-text-tertiary)]">
                {day.count}
              </span>
              <div
                className="w-full rounded-sm"
                style={{
                  height: `${Math.max(day.pct, 4)}%`,
                  minHeight: 4,
                  background: "var(--wireline-color-action-primary-default)",
                  opacity: day.pct > 0 ? 0.85 : 0.15,
                }}
              />
              <span className="text-[10px] text-[var(--wireline-color-text-tertiary)]">
                {day.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
