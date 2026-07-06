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

  const incidentConfigured = !!(
    process.env.HEALTH_MONITOR_TOKEN ||
    process.env.CRON_SECRET ||
    process.env.OWNER_EMAIL
  );
  const incidentStatus: MeasuredSloStatus = incidentConfigured ? "ok" : "insufficient_data";
  if (!incidentConfigured) {
    notes.push(
      "Incident-response monitor path is not fully configured (HEALTH_MONITOR_TOKEN or CRON_SECRET).",
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
  const rate = input.webhookSuccessRate;
  let webhooksStatus: MeasuredSloStatus = "insufficient_data";
  let webhooksDimension: SloHealth = "ok";
  if (attempts >= 10 && rate !== null && rate !== undefined) {
    webhooksStatus = rate < 0.85 ? "degraded" : rate < 0.95 ? "ok" : "ok";
    webhooksDimension = rate < 0.85 ? "critical" : rate < 0.95 ? "warn" : "ok";
  } else {
    notes.push("Webhook success rate needs at least 10 delivery attempts in the window.");
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
        target_label: "Post-incident reporting path",
        evidence: {
          monitor_token_configured: !!(process.env.HEALTH_MONITOR_TOKEN || process.env.CRON_SECRET),
          owner_contact_configured: !!process.env.OWNER_EMAIL,
        },
        notes: incidentConfigured
          ? [
              "Incident workflow relies on configured monitor token and owner contact — not a published SLA.",
            ]
          : ["Configure HEALTH_MONITOR_TOKEN or CRON_SECRET for automated incident snapshots."],
      },
      job_queue: {
        configured: typeof pending === "number",
        status: jobsStatus,
        target_label: "Background job backlog",
        evidence: typeof pending === "number" ? { pending_jobs: pending } : undefined,
      },
      webhooks: {
        configured: attempts >= 10 && rate !== null && rate !== undefined,
        status: webhooksStatus,
        target_label: "Webhook delivery success (tenant-aggregated when available)",
        evidence:
          attempts >= 10 && rate !== null && rate !== undefined
            ? { attempts_in_window: attempts, success_rate: rate }
            : undefined,
      },
    },
    dimensions,
    notes,
  };
}
