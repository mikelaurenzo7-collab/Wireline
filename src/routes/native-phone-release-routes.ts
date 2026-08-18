import { Router, type Response } from "express";
import { and, eq } from "drizzle-orm";

import * as schema from "../db/schema";
import { AppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import { releaseNativeTenantNumber } from "../lib/voice/native-phone-release";
import { phoneNumberRateLimiter } from "../middleware/api-rate-limits";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n;

function parsePhoneNumberRowId(value: unknown): bigint {
  const raw = String(value || "").trim();
  if (!/^\d{1,19}$/.test(raw)) throw AppError.badRequest("Invalid phone-number id");
  const parsed = BigInt(raw);
  if (parsed > MAX_POSTGRES_BIGINT) throw AppError.badRequest("Invalid phone-number id");
  return parsed;
}

router.delete(
  "/api/phone-numbers/:id",
  authenticateUser,
  phoneNumberRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    const id = parsePhoneNumberRowId(req.params.id);
    const [owned] = await drizzle
      .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
      .from(schema.phoneNumbers)
      .where(
        and(eq(schema.phoneNumbers.id, id), eq(schema.phoneNumbers.userId, req.user.id)),
      )
      .limit(1);
    if (!owned) throw AppError.notFound("Phone number not found");

    const released = await releaseNativeTenantNumber(req.user.id, owned.phoneNumber);
    if (!released.ok) {
      if (released.error === "Number not found for this tenant.") {
        return res.json({ success: true, already_released: true });
      }
      log.warn("Native tenant phone release remains retryable", {
        userId: req.user.id,
        phoneSuffix: owned.phoneNumber.slice(-4),
        error: released.error,
      });
      return res.status(502).json({
        success: false,
        code: "CARRIER_RELEASE_FAILED",
        error:
          released.error ||
          "The carrier could not confirm release. The number remains attached and can be retried safely.",
      });
    }
    return res.json({ success: true });
  },
);

export default router;
