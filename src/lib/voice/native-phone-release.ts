import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

import * as schema from "../../db/schema";
import { checkoutOperations } from "../../db/security-schema";
import { isTwilioPhoneNumberSid } from "../agent-phone-lines";
import { AppError } from "../api-error";
import { runCompanyIdentityMutation } from "../company-identity-mutation";
import { drizzle, log } from "../server-context";
import { getErrorMessage } from "../server-utils";
import { runTenantProviderWorkWithDeletionFence } from "../tenant-provider-deletion-fence";
import { getTwilioClient } from "../twilio-service";
import { resolveOwnedTwilioNumberSid } from "./native-phone-carrier";
import { deregisterXAIPhoneNumber } from "./xai-phone-registration";

type ReclamationGuard = {
  canceledBefore: Date;
  customerId: string;
  subscriptionId: string;
  assertOwned: () => Promise<void>;
};

function twilioStatus(error: unknown): number | null {
  const value = Number((error as { status?: unknown } | null)?.status);
  return Number.isInteger(value) ? value : null;
}

async function releaseTwilioLine(sid: string): Promise<void> {
  const client = getTwilioClient();
  if (!client) throw AppError.serviceUnavailable("BotBound calling is temporarily unavailable.");
  try {
    await client.incomingPhoneNumbers(sid).remove();
  } catch (error) {
    if (twilioStatus(error) === 404) return;
    throw error;
  }
}

async function releaseNativeTenantNumberUnfenced(
  userId: string,
  phoneNumber: string,
  reclamation?: ReclamationGuard,
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const [row] = await drizzle
    .select()
    .from(schema.phoneNumbers)
    .where(
      and(eq(schema.phoneNumbers.userId, userId), eq(schema.phoneNumbers.phoneNumber, phoneNumber)),
    )
    .limit(1);
  if (!row) return { ok: false, error: "Number not found for this tenant." };

  let carrierId: string | null;
  try {
    carrierId = isTwilioPhoneNumberSid(row.vapiNumberId)
      ? row.vapiNumberId
      : await resolveOwnedTwilioNumberSid(phoneNumber, row.vapiNumberId);
  } catch (error) {
    log.warn("Twilio ownership lookup failed before number release", {
      userId,
      phoneSuffix: phoneNumber.slice(-4),
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      error: "The carrier could not verify number ownership. The line remains attached for retry.",
    };
  }
  if (!carrierId) {
    return {
      ok: false,
      error:
        "This line is not uniquely owned by the configured Twilio account. It remains attached for operator reconciliation.",
    };
  }

  let carrierReleased = false;
  try {
    return await runCompanyIdentityMutation(userId, "phone_number_changed", async (tx) => {
      // Ownership lookup can be slow, so do it before taking the company lock.
      // Recheck the snapshot under the same lock used to claim detached lines,
      // then hold it through carrier deletion and retirement of the local row.
      const [current] = await tx
        .select()
        .from(schema.phoneNumbers)
        .where(and(eq(schema.phoneNumbers.id, row.id), eq(schema.phoneNumbers.userId, userId)))
        .limit(1);
      if (
        !current ||
        current.phoneNumber !== row.phoneNumber ||
        current.vapiNumberId !== row.vapiNumberId ||
        current.agentId !== row.agentId
      ) {
        return {
          ok: false,
          error:
            "This line changed while release was pending. Refresh Phone and retry if it should still be released.",
        };
      }

      if (reclamation) {
        // Reclamation's earlier candidate read cannot authorize a destructive
        // release after a customer resubscribes while lookup/lock acquisition
        // waits. Stripe sync upserts these rows separately; FOR UPDATE fences
        // both writes until this existing identity transaction is finished.
        const [billing] = await tx
          .select({
            status: schema.subscriptions.status,
            currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
            updatedAt: schema.subscriptions.updatedAt,
            appStatus: schema.settings.subscriptionStatus,
            stripeCustomerId: schema.subscriptions.stripeCustomerId,
            stripeSubscriptionId: schema.subscriptions.stripeSubscriptionId,
          })
          .from(schema.subscriptions)
          .innerJoin(schema.settings, eq(schema.settings.userId, schema.subscriptions.userId))
          .where(eq(schema.subscriptions.userId, userId))
          .limit(1)
          .for("update");
        const anchor = billing?.currentPeriodEnd ?? billing?.updatedAt;
        if (
          !billing ||
          billing.stripeCustomerId !== reclamation.customerId ||
          billing.stripeSubscriptionId !== reclamation.subscriptionId ||
          billing.status !== "canceled" ||
          ["active", "trialing"].includes(billing.appStatus ?? "") ||
          !anchor ||
          !(anchor < reclamation.canceledBefore)
        ) {
          return { ok: false, skipped: true };
        }

        const billingWorkPending = async () => {
          const [checkout] = await tx
            .select({ id: checkoutOperations.id })
            .from(checkoutOperations)
            // Local TTL alone does not prove a remote session closed after a
            // slow/ambiguous creation. Keep unresolved checkout work intact.
            .where(
              and(
                eq(checkoutOperations.userId, userId),
                inArray(checkoutOperations.status, ["creating", "open"]),
              ),
            )
            .limit(1);
          const [operation] = await tx
            .select({ id: schema.accountOperationLeases.id })
            .from(schema.accountOperationLeases)
            .where(
              and(
                eq(schema.accountOperationLeases.userId, userId),
                eq(schema.accountOperationLeases.kind, "billing"),
                gt(schema.accountOperationLeases.expiresAt, sql`clock_timestamp()`),
              ),
            )
            .limit(1);
          return Boolean(checkout || operation);
        };
        if (await billingWorkPending()) return { ok: false, skipped: true };
        await reclamation.assertOwned();
        const { stripeAllowsCanceledNumberReclamation } = await import("../stripe-helpers");
        const confirmed = await stripeAllowsCanceledNumberReclamation({
          customerId: reclamation.customerId,
          subscriptionId: reclamation.subscriptionId,
          canceledBefore: reclamation.canceledBefore,
        });
        await reclamation.assertOwned();
        if (!confirmed || (await billingWorkPending())) return { ok: false, skipped: true };
        await reclamation.assertOwned();
        // This is the irreversible boundary: a new payment accepted remotely
        // after Twilio DELETE begins cannot be made atomic with carrier release.
      }

      try {
        await releaseTwilioLine(carrierId);
        carrierReleased = true;
      } catch (error) {
        log.warn("Twilio number release could not be confirmed", {
          userId,
          phoneSuffix: phoneNumber.slice(-4),
          carrierIdSuffix: carrierId.slice(-6),
          error: getErrorMessage(error),
        });
        return {
          ok: false,
          error:
            "The carrier could not confirm release. The number remains attached for a safe retry.",
        };
      }

      await tx
        .delete(schema.phoneNumbers)
        .where(and(eq(schema.phoneNumbers.id, row.id), eq(schema.phoneNumbers.userId, userId)));

      const [settings] = await tx
        .select({ twilioSmsFromNumber: schema.settings.twilioSmsFromNumber })
        .from(schema.settings)
        .where(eq(schema.settings.userId, userId))
        .limit(1);
      if (settings?.twilioSmsFromNumber === phoneNumber) {
        const [replacement] = await tx
          .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
          .from(schema.phoneNumbers)
          .where(eq(schema.phoneNumbers.userId, userId))
          .orderBy(desc(schema.phoneNumbers.createdAt), desc(schema.phoneNumbers.id))
          .limit(1);
        await tx
          .update(schema.settings)
          .set({ twilioSmsFromNumber: replacement?.phoneNumber ?? null, updatedAt: new Date() })
          .where(eq(schema.settings.userId, userId));
      }
      return { ok: true };
    });
  } catch (error) {
    if (!carrierReleased) {
      log.warn("Phone release could not acquire or verify local ownership", {
        userId,
        phoneSuffix: phoneNumber.slice(-4),
        error: getErrorMessage(error),
      });
      return {
        ok: false,
        error: "BotBound could not verify the line for release. Refresh Phone and retry.",
      };
    }
    log.error("Twilio carrier released but local phone retirement failed", {
      userId,
      phoneSuffix: phoneNumber.slice(-4),
      carrierIdSuffix: carrierId.slice(-6),
      error: getErrorMessage(error),
    });
    return {
      ok: false,
      error:
        "The carrier released the number, but BotBound could not finish local cleanup. Retry release to reconcile the workspace.",
    };
  }
}

export async function releaseNativeTenantNumber(
  userId: string,
  phoneNumber: string,
  options: { terminalCleanup?: boolean; reclaimCanceledBefore?: Date } = {},
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const release = async () => {
    const result = await releaseWithBillingFence();
    // A released number must not keep an xAI registration that could route a
    // future owner's calls with this account's secrets. Best effort: a stale
    // registration is replaced the next time the number is registered.
    if (result.ok) {
      await deregisterXAIPhoneNumber(phoneNumber).catch((error: unknown) =>
        log.warn("Released number's xAI registration could not be removed", {
          phoneSuffix: phoneNumber.slice(-4),
          error: getErrorMessage(error),
        }),
      );
    }
    return result;
  };
  const releaseWithBillingFence = async () => {
    if (!options.reclaimCanceledBefore)
      return releaseNativeTenantNumberUnfenced(userId, phoneNumber);
    const [billing] = await drizzle
      .select({
        customerId: schema.subscriptions.stripeCustomerId,
        subscriptionId: schema.subscriptions.stripeSubscriptionId,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.userId, userId))
      .limit(1);
    if (!billing?.customerId || !billing.subscriptionId) return { ok: false, skipped: true };
    const { withStripeSubscriptionSyncLease } = await import("../stripe-subscription-sync-lease");
    // Match sync's ordering: acquire its lease before company/settings/billing
    // locks, never wait for a sync while holding rows that sync must update.
    return withStripeSubscriptionSyncLease(billing.customerId, (assertOwned) =>
      releaseNativeTenantNumberUnfenced(userId, phoneNumber, {
        canceledBefore: options.reclaimCanceledBefore!,
        customerId: billing.customerId!,
        subscriptionId: billing.subscriptionId!,
        assertOwned,
      }),
    );
  };
  if (options.terminalCleanup) {
    return release();
  }
  const outcome = await runTenantProviderWorkWithDeletionFence({
    userId,
    operation: "native_phone_release",
    ttlMs: 20 * 60_000,
    perform: release,
  });
  return outcome.performed
    ? outcome.result
    : {
        ok: false,
        error: "Number release is unavailable while terminal account deletion is in progress.",
      };
}
