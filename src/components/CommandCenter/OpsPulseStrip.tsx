import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { WL_OPS_CLASSES, OPS_PULSE_METRICS } from "../../lib/wireline-ops-design";

type OpsPulseStripProps = {
  liveCalls: number;
  pendingActions: number;
  fleetAgents: number;
  escalations: number;
  /** Core ops metrics (live calls, actions, escalations) */
  loading?: boolean;
  /** Fleet roster count — can load after presence without blocking other metrics */
  fleetLoading?: boolean;
};

function PulseMetric({
  label,
  value,
  mono,
  alert,
  loading,
}: {
  label: string;
  value: number;
  mono?: boolean;
  alert?: boolean;
  loading?: boolean;
}) {
  const display = loading ? "…" : String(value);
  return (
    <div className={WL_OPS_CLASSES.metric}>
      <span className={WL_OPS_CLASSES.metricLabel}>{label}</span>
      <motion.span
        key={loading ? "loading" : value}
        aria-busy={loading}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          WL_OPS_CLASSES.metricValue,
          mono && "wl-ops-metric-value--mono",
          alert && !loading && value > 0 && "text-destructive",
          loading && "text-muted-foreground",
        )}
      >
        {display}
      </motion.span>
    </div>
  );
}

export function OpsPulseStrip({
  liveCalls,
  pendingActions,
  fleetAgents,
  escalations,
  loading,
  fleetLoading,
}: OpsPulseStripProps) {
  const fleetBusy = fleetLoading ?? loading;
  return (
    <div
      className={WL_OPS_CLASSES.pulseStrip}
      role="status"
      aria-live="polite"
      aria-busy={loading || fleetBusy}
      aria-label="Live Ops fleet pulse"
    >
      <PulseMetric label={OPS_PULSE_METRICS.live.label} value={liveCalls} mono loading={loading} />
      <PulseMetric
        label={OPS_PULSE_METRICS.pending.label}
        value={pendingActions}
        mono
        loading={loading}
      />
      <PulseMetric
        label={OPS_PULSE_METRICS.fleet.label}
        value={fleetAgents}
        mono
        loading={fleetBusy}
      />
      <PulseMetric
        label={OPS_PULSE_METRICS.escalations.label}
        value={escalations}
        mono
        alert
        loading={loading}
      />
    </div>
  );
}
