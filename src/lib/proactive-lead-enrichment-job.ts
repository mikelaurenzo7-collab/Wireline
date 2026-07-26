import { and, desc, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { CRMService } from "./crm-service";
import { enrichLead as apolloEnrich } from "./apollo-service";
import { drizzle, log, tenantStore } from "./server-context";
import type { JobRow } from "./job-queue";
import { getErrorMessage } from "./server-utils";

interface ProactiveLeadEnrichmentPayload {
  userId: string;
  customerNumber: string;
  /** Optional future-safe email context. Never infer an email from a phone number. */
  customerEmail?: string;
}

function jobOwnerId(job: JobRow): string {
  const shaped = job as unknown as { userId?: string; user_id?: string };
  return String(shaped.userId || shaped.user_id || "");
}

function validatedEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 320 || !normalized.includes("@")) return null;
  return normalized;
}

async function persistResult(jobId: string, userId: string, result: Record<string, unknown>) {
  await drizzle
    .update(schema.jobs)
    .set({ result, updatedAt: new Date() })
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.userId, userId)));
}

/**
 * Tenant-safe replacement for the legacy `proactive_lead_enrichment` branch.
 *
 * The legacy worker queried call logs by phone number alone and compared
 * `customer_email` to that phone number. Since durable workers run outside an
 * authenticated request, those reads could blend another tenant's interaction
 * summaries into the requesting tenant's dossier. This handler asserts job
 * ownership, enters the tenant RLS context, and keeps explicit user predicates
 * on every history query.
 */
export async function handleProactiveLeadEnrichmentJob(job: JobRow): Promise<void> {
  const payload = job.payload as unknown as ProactiveLeadEnrichmentPayload;
  const ownerId = jobOwnerId(job);
  const userId = typeof payload?.userId === "string" ? payload.userId : "";
  const customerNumber =
    typeof payload?.customerNumber === "string" ? payload.customerNumber.trim() : "";

  if (!ownerId || !userId || ownerId !== userId) {
    throw new Error("Proactive enrichment job tenant does not match its payload owner.");
  }
  if (!customerNumber) {
    throw new Error("Proactive enrichment job requires a customer number.");
  }

  const customerEmail = validatedEmail(payload.customerEmail);

  await tenantStore.run(userId, async () => {
    log.info("Starting tenant-scoped proactive lead enrichment", {
      jobId: job.id,
      userId,
      hasEmailContext: Boolean(customerEmail),
    });

    const emailHistoryPromise = customerEmail
      ? drizzle
          .select({
            summary: schema.emailThreads.summary,
            lastMessageAt: schema.emailThreads.lastMessageAt,
          })
          .from(schema.emailThreads)
          .where(
            and(
              eq(schema.emailThreads.userId, userId),
              eq(schema.emailThreads.customerEmail, customerEmail),
            ),
          )
          .orderBy(desc(schema.emailThreads.lastMessageAt))
          .limit(3)
      : Promise.resolve([]);

    const [enrichment, calls, emails] = await Promise.all([
      apolloEnrich(customerNumber, userId),
      drizzle
        .select({ summary: schema.callLogs.summary, createdAt: schema.callLogs.createdAt })
        .from(schema.callLogs)
        .where(
          and(
            eq(schema.callLogs.userId, userId),
            eq(schema.callLogs.customerNumber, customerNumber),
          ),
        )
        .orderBy(desc(schema.callLogs.createdAt))
        .limit(3),
      emailHistoryPromise,
    ]);

    const summaryParts: string[] = [];
    if (calls.length) {
      summaryParts.push(
        `Recent Calls: ${calls.map((call) => call.summary || "No summary").join("; ")}.`,
      );
    }
    if (emails.length) {
      summaryParts.push(
        `Recent Emails: ${emails.map((email) => email.summary || "No summary").join("; ")}.`,
      );
    }
    const interactionSummary = summaryParts.join(" ") || "No prior interactions found.";

    if (!enrichment) {
      await persistResult(job.id, userId, {
        enriched: false,
        reason: "no_enrichment_data",
        call_history_rows: calls.length,
        email_history_rows: emails.length,
      });
      log.info("No enrichment data found for lead", { jobId: job.id, userId });
      return;
    }

    const fullName =
      enrichment.first_name && enrichment.last_name
        ? `${enrichment.first_name} ${enrichment.last_name}`
        : undefined;

    await drizzle
      .insert(schema.leadDossiers)
      .values({
        userId,
        customerNumber,
        fullName,
        jobTitle: enrichment.title,
        company: enrichment.company,
        linkedInUrl: enrichment.linkedin_url,
        metadata: enrichment,
        interactionSummary,
      })
      .onConflictDoUpdate({
        target: [schema.leadDossiers.userId, schema.leadDossiers.customerNumber],
        set: {
          fullName,
          jobTitle: enrichment.title,
          company: enrichment.company,
          linkedInUrl: enrichment.linkedin_url,
          metadata: enrichment,
          interactionSummary,
        },
      });

    const crmService = new CRMService(userId);
    await crmService
      .syncEnrichedLead({
        customerNumber,
        fullName,
        jobTitle: enrichment.title,
        company: enrichment.company,
        linkedInUrl: enrichment.linkedin_url,
        leadScore: 85,
      })
      .catch((error) =>
        log.warn("CRM enrichment sync failed", {
          jobId: job.id,
          userId,
          error: getErrorMessage(error),
        }),
      );

    await persistResult(job.id, userId, {
      enriched: true,
      company: enrichment.company || null,
      call_history_rows: calls.length,
      email_history_rows: emails.length,
    });

    log.info("Tenant-scoped proactive lead enrichment completed", {
      jobId: job.id,
      userId,
      company: enrichment.company || null,
    });
  });
}
