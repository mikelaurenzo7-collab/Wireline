import { eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { handleJob as handleBaseJob } from "./job-worker-base";
import { createAuditContext, runInAuditContext } from "./ai-audit";
import { persistRuntimeAuditRecords } from "../middleware/audit-middleware";
import {
  ARTIFACT_RUNTIME_RESERVE_USD,
  refundRuntimeUsage,
  reserveRuntimeUsage,
  type RuntimeArtifactFormat,
} from "./runtime-usage-billing";
import {
  generateAndStorePostCallArtifact,
  type PostCallArtifactInput,
} from "./openai-post-call-artifact";
import {
  currentScheduledReportPreferences,
  generateScheduledOperatingReport,
  type ScheduledReportJobPayload,
} from "./scheduled-report-service";
import { handleProactiveLeadEnrichmentJob } from "./proactive-lead-enrichment-job";
import { retryPendingOrphanCarrierResources } from "./orphan-carrier-retry";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { startWorker, type JobRow } from "./job-queue";

export * from "./job-worker-base";

const ARTIFACT_FORMATS = new Set<RuntimeArtifactFormat>(["pdf", "docx", "pptx", "xlsx"]);
const ARTIFACT_DESTINATIONS = new Set(["google_drive", "onedrive"]);

function attemptNumber(job: JobRow): number {
  const value = Number((job as unknown as { attempts?: number }).attempts || 1);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function jobOwnerId(job: JobRow): string {
  const shaped = job as unknown as { userId?: string; user_id?: string };
  return String(shaped.userId || shaped.user_id || "");
}

function executionReference(job: JobRow): string {
  return `${job.type}:${job.id}:attempt:${attemptNumber(job)}`;
}

function validateFormat(value: unknown): RuntimeArtifactFormat {
  if (typeof value !== "string" || !ARTIFACT_FORMATS.has(value as RuntimeArtifactFormat)) {
    throw new Error("Artifact job contains an unsupported file format.");
  }
  return value as RuntimeArtifactFormat;
}

function validateDestination(value: unknown): "google_drive" | "onedrive" {
  if (typeof value !== "string" || !ARTIFACT_DESTINATIONS.has(value)) {
    throw new Error("Artifact job requires a connected Google Drive or OneDrive destination.");
  }
  return value as "google_drive" | "onedrive";
}

async function persistJobResult(jobId: string, result: Record<string, unknown>): Promise<void> {
  await drizzle
    .update(schema.jobs)
    .set({ result, updatedAt: new Date() })
    .where(eq(schema.jobs.id, jobId));
}

async function hasPersistedResult(jobId: string): Promise<boolean> {
  const [row] = await drizzle
    .select({ result: schema.jobs.result })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);
  return Boolean(
    row?.result && typeof row.result === "object" && Object.keys(row.result).length > 0,
  );
}

async function withRuntimeReservation<T>(
  job: JobRow,
  userId: string,
  format: RuntimeArtifactFormat,
  operation: () => Promise<T>,
  refundWhen?: (result: T) => boolean,
): Promise<T> {
  const amountUsd = ARTIFACT_RUNTIME_RESERVE_USD[format];
  const referenceId = executionReference(job);
  const reservation = await reserveRuntimeUsage({
    userId,
    amountUsd,
    referenceId,
    reason: `${format.toUpperCase()} business artifact`,
    metadata: {
      job_id: job.id,
      job_type: job.type,
      attempt: attemptNumber(job),
      format,
    },
  });

  if (!reservation.reserved) {
    throw new Error(
      `Insufficient Runtime Balance for this ${format.toUpperCase()} file. Add balance and retry.`,
    );
  }

  // Artifact and scheduled-report jobs both reach the OpenAI Responses API, and
  // both do it from a queue worker with no request and no `withAudit` around it,
  // so their cost reached no audit row at all. These are sold at a FIXED reserve
  // per format, so an unmeasured call is a silent margin risk rather than a
  // silent bill — the flat price can quietly stop covering the model.
  //
  // createAuditContext rather than withAuditCapture: the capture helper drops
  // its records when the operation throws, and the failure that matters most
  // here is a provider response that was billed and then rejected. Holding the
  // context lets the `finally` persist either way.
  const auditContext = createAuditContext();
  try {
    const result = await runInAuditContext(auditContext, () => operation());
    if (refundWhen?.(result) && !reservation.alreadyReserved) {
      await refundRuntimeUsage({
        userId,
        amountUsd,
        referenceId,
        reason: `${format.toUpperCase()} artifact skipped before provider work`,
        metadata: {
          job_id: job.id,
          job_type: job.type,
          attempt: attemptNumber(job),
          format,
          skipped: true,
        },
      });
    }
    return result;
  } catch (error) {
    // A unique reference is used for every attempt, so generation failures and
    // completion-checkpoint failures can be refunded without giving a later
    // retry a free reservation.
    if (!reservation.alreadyReserved) {
      await refundRuntimeUsage({
        userId,
        amountUsd,
        referenceId,
        reason: `${format.toUpperCase()} artifact generation failed`,
        metadata: {
          job_id: job.id,
          job_type: job.type,
          attempt: attemptNumber(job),
          format,
          error: getErrorMessage(error),
        },
      });
    }
    throw error;
  } finally {
    if (auditContext.records.length) {
      // Best-effort: an audit write must never mask the job's own outcome.
      await persistRuntimeAuditRecords({
        userId,
        action: `jobs.${job.type}`,
        records: auditContext.records,
        requestMeta: { job_id: job.id, format, attempt: attemptNumber(job) },
      }).catch((auditError: unknown) =>
        log.warn("runtime artifact audit persist failed", {
          jobId: job.id,
          userId,
          error: getErrorMessage(auditError),
        }),
      );
    }
  }
}

async function handlePostCallArtifact(job: JobRow): Promise<void> {
  if (await hasPersistedResult(job.id)) return;

  const payload = job.payload as unknown as PostCallArtifactInput;
  const userId = typeof payload.userId === "string" ? payload.userId : "";
  const ownerId = jobOwnerId(job);
  if (!userId || !ownerId || userId !== ownerId) {
    throw new Error("Artifact job is missing a valid tenant owner.");
  }

  const format = validateFormat(payload.format);
  const destination = validateDestination(payload.destination);
  await withRuntimeReservation(job, userId, format, async () => {
    const artifact = await generateAndStorePostCallArtifact({ ...payload, format, destination });
    // The durable checkpoint belongs to the paid operation. If it cannot be
    // written after provider success, refund this attempt before the queue
    // retries instead of charging for a result Wireline cannot safely resume.
    await persistJobResult(job.id, {
      provider: artifact.provider,
      external_id: artifact.externalId,
      external_url: artifact.externalUrl,
      file_name: artifact.fileName,
      mime_type: artifact.mimeType,
      size_bytes: artifact.sizeBytes,
      openai_response_id: artifact.openaiResponseId,
    });
    return artifact;
  });
}

async function handleScheduledReport(job: JobRow): Promise<void> {
  if (await hasPersistedResult(job.id)) return;

  const payload = job.payload as unknown as ScheduledReportJobPayload;
  const userId = typeof payload.userId === "string" ? payload.userId : "";
  const ownerId = jobOwnerId(job);
  if (!userId || !ownerId || userId !== ownerId) {
    throw new Error("Scheduled report job is missing a valid tenant owner.");
  }

  const format = validateFormat(payload.format);
  const destination = validateDestination(payload.destination);
  if (!(await currentScheduledReportPreferences({ ...payload, format, destination }))) {
    await persistJobResult(job.id, { skipped: true, reason: "schedule_changed" });
    return;
  }

  await withRuntimeReservation(
    job,
    userId,
    format,
    async () => {
      const result = await generateScheduledOperatingReport({ ...payload, format, destination });
      await persistJobResult(job.id, result as unknown as Record<string, unknown>);
      return result;
    },
    (value) => Boolean((value as { skipped?: boolean }).skipped),
  );
}

/** Global durable-job dispatcher including launch reporting extensions. */
export async function handleJob(job: JobRow): Promise<void> {
  if (job.type === "post_call_artifact") {
    await handlePostCallArtifact(job);
    return;
  }
  if (job.type === "scheduled_report") {
    await handleScheduledReport(job);
    return;
  }
  // Intercept the legacy handler before it can run unscoped phone-only history
  // reads. The replacement asserts job/payload ownership and enters tenant RLS.
  if (job.type === "proactive_lead_enrichment") {
    await handleProactiveLeadEnrichmentJob(job);
    return;
  }
  // Extend the existing daily integrity janitor rather than creating another
  // cron/job type. The base handler removes orphan supervisor subscriptions;
  // this second phase retries durable carrier handoffs. Any remaining provider
  // error throws so the queue applies its normal backoff and dead-letter policy.
  if (job.type === "sweep_orphan_supervisor_subs") {
    await handleBaseJob(job as never);
    const orphanCarriers = await retryPendingOrphanCarrierResources();
    await persistJobResult(job.id, { orphan_carriers: orphanCarriers });
    return;
  }
  await handleBaseJob(job as never);
}

/** Initializes the extended worker outside Vercel serverless. */
export function initJobWorker(opts?: { dbReady?: boolean }) {
  if (process.env.VERCEL === "1") return null;
  if (opts?.dbReady === false) {
    log.warn("job worker skipped — database not connected");
    return null;
  }

  return startWorker(drizzle, handleJob, {
    pollIntervalMs: 10_000,
    onError: (error) =>
      log.error("job worker poll failed", {
        error: error.message,
        hint: "Check POSTGRES_URL and that wireline_jobs exists",
      }),
  });
}
