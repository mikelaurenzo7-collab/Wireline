import { motion } from "motion/react";
import { cn } from "../../lib/utils";
import { WL_OPS_CLASSES, OPS_PULSE_METRICS } from "../../lib/wireline-ops-design";
import { ShadButton } from "../ui/shadcn/ShadButton";
import { AnimatedCounter } from "../ui/AnimatedCounter";
import { Skeleton } from "../ui/shadcn/Skeleton";

type OpsTabId = "floor" | "intel" | "triage" | "analytics";

type OpsPulseStripProps = {
  liveCalls: number;
  pendingActions: number;
  fleetAgents: number;
  escalations: number;
  activeTab?: OpsTabId;
  onMetricNavigate?: (tab: Exclude<OpsTabId, "analytics">) => void;
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
  active,
  onClick,
  ariaLabel,
}: {
  label: string;
  value: number;
  mono?: boolean;
  alert?: boolean;
  loading?: boolean;
  active?: boolean;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const body = (
    <>
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
        {loading ? (
          <Skeleton className="h-6 w-10 mt-0.5" aria-label={`${label}: loading`} />
        ) : (
          <AnimatedCounter value={value} />
        )}
      </motion.span>
    </>
  );

  if (onClick) {
    return (
      <ShadButton
        type="button"
        variant="ghost"
        disableAnimations
        className={cn(WL_OPS_CLASSES.metricInteractive, "h-auto touch-press motion-snappy")}
        data-active={active ? "true" : undefined}
        onClick={onClick}
        aria-label={ariaLabel ?? `${label}: ${loading ? "loading" : value}`}
        aria-current={active ? "true" : undefined}
      >
        {body}
      </ShadButton>
    );
  }

  return <div className={WL_OPS_CLASSES.metric}>{body}</div>;
}

export function OpsPulseStrip({
  liveCalls,
  pendingActions,
  fleetAgents,
  escalations,
  activeTab,
  onMetricNavigate,
  loading,
  fleetLoading,
}: OpsPulseStripProps) {
  const fleetBusy = fleetLoading ?? loading;
  const nav = onMetricNavigate;

  return (
    <div
      className={WL_OPS_CLASSES.pulseStrip}
      role="status"
      aria-live="polite"
      aria-busy={loading || fleetBusy}
      aria-label="Live Ops fleet pulse"
    >
      <PulseMetric
        label={OPS_PULSE_METRICS.live.label}
        value={liveCalls}
        mono
        loading={loading}
        active={activeTab === "floor"}
        onClick={nav ? () => nav("floor") : undefined}
        ariaLabel={
          nav
            ? `${liveCalls} live caller${liveCalls === 1 ? "" : "s"} — open live floor`
            : undefined
        }
      />
      <PulseMetric
        label={OPS_PULSE_METRICS.pending.label}
        value={pendingActions}
        mono
        loading={loading}
        active={activeTab === "intel"}
        onClick={nav ? () => nav("intel") : undefined}
        ariaLabel={
          nav
            ? `${pendingActions} pending action${pendingActions === 1 ? "" : "s"} — open action queue`
            : undefined
        }
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
        active={activeTab === "triage"}
        onClick={nav ? () => nav("triage") : undefined}
        ariaLabel={
          nav
            ? `${escalations} live escalation${escalations === 1 ? "" : "s"} — open triage queue`
            : undefined
        }
      />
    </div>
  );
}
