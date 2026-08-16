import { Router, type Response } from "express";
import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError, rethrowIfAppError } from "../lib/api-error";
import { releaseTenantNumber } from "../lib/phone-provisioning";
import { getErrorMessage } from "../lib/server-utils";
import { drizzle, log } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { phoneNumberRateLimiter } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function parsePhoneNumberRowId(value: unknown): bigint {
  const rawId = String(value || "").trim();
  if (!/^\d{1,19}$/.test(rawId)) {
    throw AppError.fromHttpStatus(400, "Invalid phone-number id");
  }
  const parsed = BigInt(rawId);
  if (parsed > MAX_POSTGRES_BIGINT) {
    throw AppError.fromHttpStatus(400, "Invalid phone-number id");
  }
  return parsed;
}

/**
 * Terminal owner for DELETE /api/phone-numbers/:id.
 *
 * The broad carrier router retains GET/POST/PATCH and pool operations, but this
 * writer must run first: deleting the database row before Vapi/Twilio teardown
 * loses the only durable provider identifiers and can leave a recurring carrier
 * rental with no tenant-visible record.
 */
router.delete(
  "/api/phone-numbers/:id",
  authenticateUser,
  phoneNumberRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const phoneNumberId = parsePhoneNumberRowId(req.params.id);
      const [owned] = await drizzle
        .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
        .from(schema.phoneNumbers)
        .where(
          and(
            eq(schema.phoneNumbers.id, phoneNumberId),
            eq(schema.phoneNumbers.userId, req.user.id),
          ),
        )
        .limit(1);
      if (!owned) throw AppError.fromHttpStatus(404, "Phone number not found");

      const released = await releaseTenantNumber(req.user.id, owned.phoneNumber);
      if (!released.ok) {
        // A concurrent idempotent delete may have completed after the ownership
        // read. Treat an already-removed canonical row as success; every other
        // provider error must preserve the row for operator/user retry.
        if (released.error === "Number not found for this tenant.") {
          return res.json({ success: true, already_released: true });
        }

        log.warn("Tenant phone-number release failed, preserving ownership row", {
          userId: req.user.id,
          phoneNumber: owned.phoneNumber,
          error: released.error,
        });
        return res.status(502).json({
          success: false,
          code: "CARRIER_RELEASE_FAILED",
          error:
            "The carrier could not confirm release. The number remains attached and can be retried safely.",
        });
      }

      return res.json({ success: true });
    } catch (error: unknown) {
      rethrowIfAppError(error);
      log.error("Failed to release phone number", {
        userId: req.user.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Failed to release phone number.");
    }
  },
);

export default router;
