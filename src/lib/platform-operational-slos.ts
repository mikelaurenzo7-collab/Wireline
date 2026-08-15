import type { SloHealth } from "./operator-slos";

export type MeasuredSloStatus = "ok" | "degraded" | "insufficient_data";

export type PlatformSloTarget = {
  /** Whether Wireline has configured evidence collection for this target. */
  configured: boolean;
  /** Measured posture — never an unconditional marketing claim. */
  status: MeasuredSloStatus;
  target_label?: string;
  evidence?: Record<string, unknown>;
  notes?: string[];
};

export type PlatformOperationalSlos = {
  status: MeasuredSloStatus;
  banner_status: "healthy" | "degraded" | "critical";
  evaluated_at: string;
  window_hours: number;
  targets: {
    availability: PlatformSloTarget;
    incident_response: PlatformSloTarget;
    job_queue: PlatformSloTarget;
    webhooks: PlatformSloTarget;
  };
  dimensions: Record<string, SloHealth>;
  notes: string[];
};

function worstMeasured(...statuses: MeasuredSloStatus[]): MeasuredSloStatus {
  if (statuses.includes("degraded")) return "degraded";
  if (statuses.every((s) => s === "ok")) return "ok";
  return "insufficient_data";
}

function bannerFromDimensions(
  dimensions: Record<string, SloHealth>,
): PlatformOperationalSlos["banner_status"] {
  const values = Object.values(dimensions);
  if (values.includes("critical")) return "critical";
  if (values.includes("warn")) return "degraded";
  return "healthy";
}

/**
 * Evidence-backed platform SLO surface for monitors and founder tooling.
 * Does not assert contractual uptime — only reports configured probes and measured signals.
 */
export function evaluatePlatformOperationalSlos(input: {
  dbOk: boolean;
  dbLatencyMs: number;
  pendingJobs?: number | null;
  webhookSuccessRate?: number | null;
  webhookAttempts?: number | null;
  webhookCompletedDeliveries?: number | null;
  windowHours?: number;
}): PlatformOperationalSlos {
  const evaluated_at = new Date().toISOString();
  const window_hours = input.windowHours ?? 24;
  const notes: string[] = [];

  const hasDbProbe = true;
  const availabilityStatus: MeasuredSloStatus = hasDbProbe
    ? input.dbOk
      ? "ok"
      : "degraded"
    : "insufficient_data";

  const monitorTokenConfigured = [process.env.HEALTH_MONITOR_TOKEN, process.env.CRON_SECRET].some(
    (value) => Boolean(value?.trim()),
  );
  const ownerContactConfigured = Boolean(process.env.OWNER_EMAIL?.trim());
  // A protected diagnostic with nobody to receive/escalate it is not an
  // incident-response path. Neither is an owner address without a credential
  // that lets an external monitor read the protected evidence. Require both
  // prerequisites before calling the path configured.
  const incidentConfigured = monitorTokenConfigured && ownerContactConfigured;
  const incidentStatus: MeasuredSloStatus = incidentConfigured ? "ok" : "insufficient_data";
  if (!incidentConfigured) {
    const missing = [
      !monitorTokenConfigured ? "HEALTH_MONITOR_TOKEN or CRON_SECRET" : null,
      !ownerContactConfigured ? "OWNER_EMAIL" : null,
    ].filter(Boolean);
    notes.push(
      `Incident-response monitor path is not fully configured (missing ${missing.join(" and ")}).`,
    );
  }

  const pending = input.pendingJobs;
  let jobsStatus: MeasuredSloStatus = "insufficient_data";
  let jobsDimension: SloHealth = "ok";
  if (typeof pending === "number") {
    jobsStatus = pending > 200 ? "degraded" : "ok";
    jobsDimension = pending > 200 ? "critical" : pending > 50 ? "warn" : "ok";
  } else {
    notes.push("Job queue depth was not measured for this snapshot.");
  }

  const attempts = input.webhookAttempts ?? 0;
  // Older direct callers supplied only `webhookAttempts`; preserve that
  // behavior while allowing the production snapshot to use the actual sample
  // behind success_rate (success + terminal failure, excluding pending rows).
  const completed =
    input.webhookCompletedDeliveries === undefined
      ? attempts
      : (input.webhookCompletedDeliveries ?? 0);
  const rate = input.webhookSuccessRate;
  let webhooksStatus: MeasuredSloStatus = "insufficient_data";
  let webhooksDimension: SloHealth = "ok";
  if (completed >= 10 && rate !== null && rate !== undefined) {
    webhooksStatus = rate < 0.95 ? "degraded" : "ok";
    webhooksDimension = rate < 0.85 ? "critical" : rate < 0.95 ? "warn" : "ok";
  } else {
    notes.push("Webhook success rate needs at least 10 completed deliveries in the window.");
  }

  const dimensions: Record<string, SloHealth> = {
    database: input.dbOk ? "ok" : "critical",
    jobs_queue: jobsDimension,
    webhooks: webhooksDimension,
  };

  const status = worstMeasured(availabilityStatus, incidentStatus, jobsStatus, webhooksStatus);

  return {
    status,
    banner_status: bannerFromDimensions(dimensions),
    evaluated_at,
    window_hours,
    targets: {
      availability: {
        configured: hasDbProbe,
        status: availabilityStatus,
        target_label: "Database reachability probe",
        evidence: {
          db_ok: input.dbOk,
          db_latency_ms: input.dbLatencyMs,
        },
        notes: input.dbOk
          ? undefined
          : ["Database probe failed — treat platform availability as degraded."],
      },
      incident_response: {
        configured: incidentConfigured,
        status: incidentStatus,
        target_label: "Incident monitoring prerequisites",
        evidence: {
          monitor_token_configured: monitorTokenConfigured,
          owner_contact_configured: ownerContactConfigured,
        },
        notes: incidentConfigured
          ? [
              "Monitor access and owner contact are configured; verify external polling and alert delivery separately.",
            ]
          : [
              "Configure both a monitor credential (HEALTH_MONITOR_TOKEN or CRON_SECRET) and OWNER_EMAIL. Configuration does not by itself prove external polling or alert delivery.",
            ],
      },
      job_queue: {
        configured: typeof pending === "number",
        status: jobsStatus,
        target_label: "Background job backlog",
        evidence: typeof pending === "number" ? { pending_jobs: pending } : undefined,
      },
      webhooks: {
        configured: completed >= 10 && rate !== null && rate !== undefined,
        status: webhooksStatus,
        target_label: "Webhook delivery success (tenant-aggregated when available)",
        evidence:
          completed >= 10 && rate !== null && rate !== undefined
            ? {
                delivery_records_in_window: attempts,
                completed_deliveries_in_window: completed,
                success_rate: rate,
              }
            : undefined,
      },
    },
    dimensions,
    notes,
  };
}
