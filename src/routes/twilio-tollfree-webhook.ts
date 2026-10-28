import { Router, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { evaluateTwilioWebhookAuth } from "../lib/twilio-webhook-auth";
import type { CompanyIdentityProviderStatus } from "../lib/company-identity";

const router = Router();

export type TollfreeVerificationStatus =
  | "PENDING"
  | "IN_REVIEW"
  | "TWILIO_APPROVED"
  | "TWILIO_REJECTED";

export function normalizeTollfreeVerificationStatus(raw: string): {
  normalized: TollfreeVerificationStatus;
  providerStatus: CompanyIdentityProviderStatus;
} {
  const upper = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (upper === "TWILIO_APPROVED" || upper === "APPROVED") {
    return { normalized: "TWILIO_APPROVED", providerStatus: "approved" };
  }
  if (upper === "TWILIO_REJECTED" || upper === "REJECTED") {
    return { normalized: "TWILIO_REJECTED", providerStatus: "rejected" };
  }
  if (upper === "IN_REVIEW" || upper === "UNDER_REVIEW") {
    return { normalized: "IN_REVIEW", providerStatus: "in_review" };
  }
  return { normalized: "PENDING", providerStatus: "review_requested" };
}

/**
 * Twilio Toll-Free SMS Verification Status Callback Receiver
 *
 * Authenticates Twilio signature, parses verification lifecycle events, logs audit trail,
 * and updates internal company identity provider status for SMS.
 */
router.post(
  "/api/twilio-webhook/tollfree-verification-status",
  async (req: Request, res: Response) => {
    if (!evaluateTwilioWebhookAuth(req).ok) {
      return res.status(403).type("text/plain").send("Forbidden");
    }

    const verificationSid = String(
      req.body?.VerificationSid ||
        req.body?.verification_sid ||
        req.body?.Sid ||
        "",
    ).trim();

    const rawStatus = String(
      req.body?.Status ||
        req.body?.status ||
        req.body?.VerificationStatus ||
        "",
    ).trim();

    const customerProfileSid =
      String(
        req.body?.CustomerProfileSid ||
          req.body?.customer_profile_sid ||
          req.body?.BundleSid ||
          "",
      ).trim() || null;

    const reason =
      String(
        req.body?.Reason ||
          req.body?.reason ||
          req.body?.RejectionReason ||
          req.body?.rejection_reason ||
          "",
      ).trim() || null;

    const phoneNumber =
      String(
        req.body?.PhoneNumber ||
          req.body?.phoneNumber ||
          req.body?.To ||
          req.body?.From ||
          "",
      ).trim() || null;

    if (!verificationSid && !rawStatus) {
      return res.status(400).json({
        ok: false,
        error: "Missing VerificationSid or Status in callback payload.",
      });
    }

    const { normalized, providerStatus } = normalizeTollfreeVerificationStatus(rawStatus);

    log.info("Twilio toll-free verification callback received", {
      verificationSid,
      customerProfileSid,
      rawStatus,
      normalized,
      providerStatus,
      phoneNumber,
    });

    let targetUserId: string | null = null;

    try {
      // 1. Resolve tenant ownership via phone number if present
      if (phoneNumber) {
        const [phoneRow] = await drizzle
          .select({ userId: schema.phoneNumbers.userId })
          .from(schema.phoneNumbers)
          .where(eq(schema.phoneNumbers.phoneNumber, phoneNumber))
          .limit(1);
        if (phoneRow?.userId) {
          targetUserId = phoneRow.userId;
        }
      }

      // 2. Fallback: resolve primary system owner or tenant with company_identity
      if (!targetUserId) {
        const ownerEmail = process.env.OWNER_EMAIL?.trim();
        if (ownerEmail) {
          const [owner] = await drizzle
            .select({ id: schema.users.id })
            .from(schema.users)
            .where(eq(schema.users.email, ownerEmail))
            .limit(1);
          if (owner?.id) {
            targetUserId = owner.id;
          }
        }
      }

      // 3. Update company identity provider status in user preferences if tenant identified
      if (targetUserId) {
        const [prefRow] = await drizzle
          .select({ preferences: schema.userPreferences.preferences })
          .from(schema.userPreferences)
          .where(eq(schema.userPreferences.userId, targetUserId))
          .limit(1);

        const currentPrefs =
          prefRow?.preferences && typeof prefRow.preferences === "object"
            ? (prefRow.preferences as Record<string, unknown>)
            : {};

        const companyIdentity =
          currentPrefs.company_identity &&
          typeof currentPrefs.company_identity === "object"
            ? { ...(currentPrefs.company_identity as Record<string, unknown>) }
            : null;

        if (companyIdentity) {
          const currentProviderStatus =
            companyIdentity.providerStatus &&
            typeof companyIdentity.providerStatus === "object"
              ? { ...(companyIdentity.providerStatus as Record<string, unknown>) }
              : { voice: "not_requested", sms: "not_requested", email: "not_requested" };

          currentProviderStatus.sms = providerStatus;
          companyIdentity.providerStatus = currentProviderStatus;
          companyIdentity.tollfreeVerificationSid = verificationSid;
          companyIdentity.tollfreeVerificationStatus = normalized;
          if (reason) {
            companyIdentity.tollfreeRejectionReason = reason;
          }

          const nextPrefs = {
            ...currentPrefs,
            company_identity: companyIdentity,
          };

          await drizzle
            .insert(schema.userPreferences)
            .values({
              userId: targetUserId,
              preferences: nextPrefs,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: schema.userPreferences.userId,
              set: {
                preferences: nextPrefs,
                updatedAt: new Date(),
              },
            });
        }
      }

      // 4. Audit trail entry
      await drizzle.insert(schema.auditLog).values({
        userId: targetUserId,
        action: "company_identity.tollfree_verification_status",
        eventType: "company_identity.tollfree_verification_status",
        severity: providerStatus === "rejected" ? "warn" : "info",
        resourceType: "company_identity",
        resourceId: verificationSid || undefined,
        metadata: {
          verificationSid,
          customerProfileSid,
          rawStatus,
          status: normalized,
          providerStatus,
          reason,
          phoneNumber,
        },
      });

      // 5. Webhook health telemetry
      await drizzle.insert(schema.webhookHealth).values({
        userId: targetUserId,
        provider: "twilio_tollfree_verification",
        eventType: "status_callback",
        outcome: normalized.toLowerCase(),
      });
    } catch (dbErr) {
      log.error("Failed to persist toll-free verification callback telemetry", {
        verificationSid,
        error: getErrorMessage(dbErr),
      });
    }

    return res.status(200).json({
      ok: true,
      verificationSid,
      status: normalized,
      providerStatus,
      targetUserId,
    });
  },
);

export default router;
