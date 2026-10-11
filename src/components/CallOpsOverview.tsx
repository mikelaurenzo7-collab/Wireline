import { useEffect, useState } from "react";

import { authFetch } from "../lib/api";
import CallOpsAnalytics from "./CallOpsAnalytics";
import { Button } from "./atoms";
import { CardRowSkeleton } from "./atoms/skeleton-presets";
import { StatusNotice } from "./molecules";

type CallOpsMetrics = {
  today: number;
  pending: number;
  agents: number;
  escalations: number;
};

function localDayBoundary(): string {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  return since.toISOString();
}

function readCount(value: unknown): number | null {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

export default function CallOpsOverview() {
  const [metrics, setMetrics] = useState<CallOpsMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setMetricsLoading(true);
    setMetricsError(false);
    const since = localDayBoundary();

    authFetch(`/api/call-ops/metrics?since=${encodeURIComponent(since)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load operational call metrics.");
        return response.json() as Promise<Record<string, unknown>>;
      })
      .then((body) => {
        if (cancelled) return;
        const today = readCount(body.today);
        const pending = readCount(body.pending);
        const agents = readCount(body.agents);
        const escalations = readCount(body.escalations);
        if (today == null || pending == null || agents == null || escalations == null) {
          throw new Error("Operational call metrics returned an invalid response.");
        }
        setMetrics({ today, pending, agents, escalations });
      })
      .catch((reason) => {
        if (cancelled || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setMetricsError(true);
      })
      .finally(() => {
        if (!cancelled) setMetricsLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [attempt]);

  const kpis = [
    { label: "Today", value: metrics?.today ?? 0 },
    { label: "Pending", value: metrics?.pending ?? 0 },
    { label: "Bots", value: metrics?.agents ?? 0 },
    { label: "Escalations", value: metrics?.escalations ?? 0 },
  ];

  return (
    <div className="mx-auto w-full max-w-[1180px] space-y-7 px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <section aria-labelledby="call-ops-now-title" className="space-y-3">
        <div>
          <h2 id="call-ops-now-title" className="text-base font-semibold text-foreground">
            Current Activity
          </h2>
        </div>

        {metricsError ? (
          <StatusNotice
            tone="warning"
            title="Operational Metrics Unavailable"
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setAttempt((current) => current + 1)}
              >
                Try Again
              </Button>
            }
          >
            Call history and all-time analytics remain available. No missing count is shown as zero.
          </StatusNotice>
        ) : null}

        {metricsLoading && !metrics ? (
          <CardRowSkeleton />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy={metricsLoading}>
            {kpis.map((kpi) => (
              <div key={kpi.label} className="wl-metric-tile wl-metric-tile--compact">
                <p className="wl-metric-tile__label">{kpi.label}</p>
                <div className="wl-metric-tile__value">
                  {metricsLoading || metricsError ? "N/A" : kpi.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="call-ops-all-time-title" className="space-y-3">
        <div>
          <h2 id="call-ops-all-time-title" className="text-base font-semibold text-foreground">
            All-Time Performance
          </h2>
        </div>
        <CallOpsAnalytics />
      </section>
    </div>
  );
}
