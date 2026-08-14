/**
 * Reclaim carrier numbers held by long-canceled workspaces.
 *
 * Numbers are bought on Wireline's own Twilio account (~$1.15/mo each), and
 * nothing released them after a self-serve cancellation: a canceled Business
 * workspace's 15 lines billed Wireline forever at zero revenue. Releasing a
 * number is destructive — the tenant cannot get the same number back — so this
 * sweep is deliberately conservative:
 *
 * - Only subscriptions Stripe marks `canceled` qualify. `past_due`/`unpaid`
 *   are dunning states with their own recovery path and are never touched.
 * - The paid period must have ended at least {@link NUMBER_RECLAMATION_GRACE_DAYS}
 *   days ago (fallback anchor when Stripe never stamped a period end: the
 *   subscription row's last update). A resubscribe inside the grace window
 *   keeps every number.
 * - The app-side `settings.subscriptionStatus` must agree the workspace is not
 *   active — both truth sources must consent before anything destructive runs.
 * - Each release re-verifies its tenant with a fresh read immediately before
 *   touching the carrier, and the run is bounded to
 *   {@link NUMBER_RECLAMATION_MAX_PER_RUN} releases so a query bug can never
 *   mass-release the fleet in one pass.
 *
 * releaseTenantNumber (phone-provisioning.ts) already fails safe: a carrier
 * error preserves the local ownership row for the next run.
 */
import { and, asc, eq, isNull, lt, notInArray, or, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { releaseTenantNumber } from "./phone-provisioning";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";
import { phoneSuffixForLog } from "./twilio-webhook-privacy";

export const NUMBER_RECLAMATION_GRACE_DAYS = 30;
export const NUMBER_RECLAMATION_MAX_PER_RUN = 10;

const ACTIVE_APP_STATUSES = ["active", "trialing"] as const;

export type NumberReclamationSummary = {
  examined: number;
  released: number;
  failed: number;
  skipped: number;
};

function graceCutoff(now: Date): Date {
  return new Date(now.getTime() - NUMBER_RECLAMATION_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

/** True when this tenant STILL qualifies, on a fresh read taken just before release. */
async function tenantStillReclaimable(userId: string, cutoff: Date): Promise<boolean> {
  const [row] = await drizzle
    .select({
      status: schema.subscriptions.status,
      currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
      updatedAt: schema.subscriptions.updatedAt,
      appStatus: schema.settings.subscriptionStatus,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.settings, eq(schema.settings.userId, schema.subscriptions.userId))
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);
  if (!row) return false;
  if (row.status !== "canceled") return false;
  if (row.appStatus && (ACTIVE_APP_STATUSES as readonly string[]).includes(row.appStatus)) {
    return false;
  }
  const anchor = row.currentPeriodEnd ?? row.updatedAt;
  return Boolean(anchor && anchor < cutoff);
}

export async function runNumberReclamation(now = new Date()): Promise<NumberReclamationSummary> {
  const cutoff = graceCutoff(now);
  const candidates = await drizzle
    .select({
      userId: schema.phoneNumbers.userId,
      phoneNumber: schema.phoneNumbers.phoneNumber,
    })
    .from(schema.phoneNumbers)
    .innerJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.phoneNumbers.userId))
    .innerJoin(schema.settings, eq(schema.settings.userId, schema.phoneNumbers.userId))
    .where(
      and(
        eq(schema.subscriptions.status, "canceled"),
        // subscriptionStatus is nullable for legacy rows. SQL `NULL NOT IN`
        // evaluates to UNKNOWN, which would silently exclude those rows from
        // the sweep even though the fresh re-verify below deliberately treats
        // a null app status as non-active. Keep candidate selection aligned
        // with that safety rule while still excluding active/trialing tenants.
        or(
          isNull(schema.settings.subscriptionStatus),
          notInArray(schema.settings.subscriptionStatus, [...ACTIVE_APP_STATUSES]),
        ),
        lt(
          sql`COALESCE(${schema.subscriptions.currentPeriodEnd}, ${schema.subscriptions.updatedAt})`,
          cutoff,
        ),
      ),
    )
    .orderBy(asc(schema.phoneNumbers.createdAt))
    .limit(NUMBER_RECLAMATION_MAX_PER_RUN);

  const summary: NumberReclamationSummary = {
    examined: candidates.length,
    released: 0,
    failed: 0,
    skipped: 0,
  };

  for (const candidate of candidates) {
    if (!candidate.userId || !candidate.phoneNumber) {
      summary.skipped++;
      continue;
    }
    // The candidate query and this release can be minutes apart under carrier
    // latency — a resubscribe in between must win.
    const stillReclaimable = await tenantStillReclaimable(candidate.userId, cutoff);
    if (!stillReclaimable) {
      summary.skipped++;
      continue;
    }
    try {
      const result = await releaseTenantNumber(candidate.userId, candidate.phoneNumber);
      if (result.ok) {
        summary.released++;
        log.info("number reclamation released canceled workspace line", {
          userId: candidate.userId,
          phoneSuffix: phoneSuffixForLog(candidate.phoneNumber),
          graceDays: NUMBER_RECLAMATION_GRACE_DAYS,
        });
      } else {
        summary.failed++;
        log.warn("number reclamation release failed — will retry next run", {
          userId: candidate.userId,
          phoneSuffix: phoneSuffixForLog(candidate.phoneNumber),
          error: result.error,
        });
      }
    } catch (error) {
      summary.failed++;
      log.error("number reclamation release threw — will retry next run", {
        userId: candidate.userId,
        phoneSuffix: phoneSuffixForLog(candidate.phoneNumber),
        error: getErrorMessage(error),
      });
    }
  }

  log.info("number reclamation run completed", { ...summary });
  return summary;
}
