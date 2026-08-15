import { and, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { handleJob as handleBaseJob } from "./job-worker-base";
import { createAuditContext, runInAuditContext } from "./ai-audit";
import { persistRuntimeAuditRecords } from "../middleware/audit-middleware";
import { isLaunchHardBlocked } from "./launch-readiness";
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
  ensureNextScheduledReport,
  generateScheduledOperatingReport,
  type ScheduledReportJobPayload,
} from "./scheduled-report-service";
import { handleProactiveLeadEnrichmentJob } from "./proactive-lead-enrichment-job";
import { retryPendingOrphanCarrierResources } from "./orphan-carrier-retry";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import {
  DEFAULT_MAX_ATTEMPTS,
  startWorker,
  type JobRow,
  writeTransactionConfig,
} from "./job-queue";
import { handleTwilioMessageReconciliationJob } from "./twilio-message-reconciliation";
import { runTenantJobAfterDeletionCheck, withAccountDeletionFence } from "./account-deletion-fence";
import {
  isPausableProviderSpendJobType,
  ProviderSpendPausedError,
  runtimeReservationReferenceForJob,
} from "./provider-spend-job-pause";

export * from "./job-worker-base";

const ARTIFACT_FORMATS = new Set<RuntimeArtifactFormat>(["pdf", "docx", "pptx", "xlsx"]);
const ARTIFACT_DESTINATIONS = new Set(["google_drive", "onedrive"]);
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * `post_call_digest` already holds this fence around every local/provider
 * boundary; wrapping the whole handler would recursively deadlock on a second
 * database connection. The purge job establishes the terminal marker itself.
 */
const SELF_MANAGED_DELETION_FENCE_JOB_TYPES = new Set<JobRow["type"]>([
  "post_call_digest",
  "purge_deleted_account",
]);

/** Carrier acceptance predates deletion, so finish its accounting/history
 * reconciliation under the fence and let the ensuing local purge erase it. */
const TERMINAL_DELETION_CLEANUP_JOB_TYPES = new Set<JobRow["type"]>([
  "twilio_message_reconciliation",
]);

function attemptNumber(job: JobRow): number {
  const value = Number((job as unknown as { attempts?: number }).attempts || 1);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function maxAttemptNumber(job: JobRow): number {
  const shaped = job as unknown as { maxAttempts?: number; max_attempts?: number };
  const value = Number(shaped.maxAttempts ?? shaped.max_attempts ?? DEFAULT_MAX_ATTEMPTS);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_MAX_ATTEMPTS;
}

function jobOwnerId(job: JobRow): string {
  const shaped = job as unknown as { userId?: string; user_id?: string };
  return String(shaped.userId || shaped.user_id || "");
}

function assertLaunchProviderSpendAllowed(job: JobRow): void {
  if (isPausableProviderSpendJobType(job.type) && isLaunchHardBlocked()) {
    throw new ProviderSpendPausedError(job.type);
  }
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
  // Queue workers do not traverse Express middleware. The typed pause is
  // settled by job-queue without spending an attempt or reaching dead-letter.
  assertLaunchProviderSpendAllowed(job);

  const amountUsd = ARTIFACT_RUNTIME_RESERVE_USD[format];
  const referenceId = runtimeReservationReferenceForJob(job);
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
    if (refundWhen?.(result)) {
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
    // One reserve follows the durable job across retries. Hold it while another
    // attempt remains, then refund exactly once if the final attempt fails.
    // This also means a worker death after the debit cannot charge the customer
    // again when stale recovery reclaims the same job.
    if (attemptNumber(job) >= maxAttemptNumber(job)) {
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
  const preferences = await currentScheduledReportPreferences({ ...payload, format, destination });
  if (!preferences) {
    await persistJobResult(job.id, { skipped: true, reason: "schedule_changed" });
    return;
  }

  // Chain the next occurrence BEFORE the reservation, not inside the operation.
  // generateScheduledOperatingReport re-schedules before its own external work,
  // but withRuntimeReservation throws on an insufficient Runtime Balance before
  // the operation ever runs — so a tenant who dipped below the reserve on one
  // send lost every future report permanently, and topping the balance back up
  // did not bring them back because nothing was left to enqueue. Idempotent:
  // it no-ops when a pending job already exists for this schedule version, and
  // this job is already claimed as `running` so it cannot match itself.
  const nextOccurrenceFrom = new Date(new Date(payload.scheduledFor).getTime() + 60_000);
  await ensureNextScheduledReport(
    userId,
    preferences,
    Number.isNaN(nextOccurrenceFrom.getTime()) ? new Date(Date.now() + 60_000) : nextOccurrenceFrom,
  );

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
async function dispatchJob(job: JobRow): Promise<void> {
  if (job.type === "twilio_message_reconciliation") {
    await handleTwilioMessageReconciliationJob(job);
    return;
  }
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
    assertLaunchProviderSpendAllowed(job);
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
  // Every remaining provider-spending base branch enters through this wrapper.
  // Maintenance, reconciliation, deletion, and carrier-release jobs are not in
  // the policy set, so the kill switch cannot block accounting or cost relief.
  assertLaunchProviderSpendAllowed(job);
  await handleBaseJob(job as never);
}

/**
 * Serialize tenant work that can touch providers/PII with irreversible account
 * deletion. A worker that starts first holds the barrier until its handler
 * finishes; purge then marks `purging`. A worker that starts afterward sees the
 * durable marker (or a vanished user) and terminally completes without work.
 */
export async function handleJob(job: JobRow): Promise<void> {
  const userId = jobOwnerId(job);
  if (!userId || userId === SYSTEM_USER_ID || SELF_MANAGED_DELETION_FENCE_JOB_TYPES.has(job.type)) {
    await dispatchJob(job);
    return;
  }

  await drizzle.transaction(
    (tx) =>
      withAccountDeletionFence(tx, userId, async () => {
        const [liveUser] = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1);
        if (!liveUser) {
          log.warn("tenant job skipped — account already erased", {
            jobId: job.id,
            jobType: job.type,
            userId,
          });
          return;
        }

        if (TERMINAL_DELETION_CLEANUP_JOB_TYPES.has(job.type)) {
          await dispatchJob(job);
          return;
        }

        const outcome = await runTenantJobAfterDeletionCheck({
          terminalDeletionExists: async () => {
            const [terminal] = await tx
              .select({ id: schema.deletionQueue.id })
              .from(schema.deletionQueue)
              .where(
                and(
                  eq(schema.deletionQueue.userId, userId),
                  sql`(
                    ${schema.deletionQueue.status} = 'purging'
                    OR (
                      ${schema.deletionQueue.status} = 'pending'
                      AND (
                        ${schema.deletionQueue.scheduledPurgeAt} IS NULL
                        OR ${schema.deletionQueue.scheduledPurgeAt} <= now()
                      )
                    )
                  )`,
                ),
              )
              .limit(1);
            return Boolean(terminal);
          },
          perform: () => dispatchJob(job),
        });
        if (!outcome.performed) {
          log.warn("tenant job skipped — terminal account deletion has begun", {
            jobId: job.id,
            jobType: job.type,
            userId,
          });
        }
      }),
    writeTransactionConfig(),
  );
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
