import { Router, type Response } from "express";
import { eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { isTwilioPhoneNumberSid } from "../lib/agent-phone-lines";
import { AppError, asyncHandler } from "../lib/api-error";
import {
  phoneNumberProvisionSchema,
  phoneNumberUpdateSchema,
  validateBody,
} from "../lib/api-validation";
import { getIncludedPhoneLineSlots } from "../lib/phone-line-entitlements";
import { drizzle } from "../lib/server-context";
import { assignNativePhoneLine } from "../lib/voice/native-phone-assignment";
import { listNativeAvailableLocalNumbers } from "../lib/voice/native-phone-carrier";
import { provisionNativeTenantNumber } from "../lib/voice/native-phone-provisioning";
import { phoneNumberRateLimiter } from "../middleware/api-rate-limits";
import { authenticateUser } from "../middleware/auth";
import { enforceLiveWorkActivation } from "../middleware/launch-hard-gate";
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

function statusForProvisionFailure(code?: string, activationPending?: boolean): number {
  if (activationPending) return 503;
  if (code === "PHONE_CAPACITY_REACHED") return 403;
  if (code === "NOT_FOUND") return 404;
  if (code === "CONFLICT") return 409;
  if (code === "BAD_REQUEST" || code === "VALIDATION_ERROR") return 400;
  return 503;
}

async function capacityAvailable(userId: string): Promise<boolean> {
  const slots = await getIncludedPhoneLineSlots(userId);
  const [{ held }] = await drizzle
    .select({ held: sql<number>`count(*)` })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.userId, userId));
  return Number(held || 0) < slots;
}

router.get(
  "/api/phone-numbers/available",
  authenticateUser,
  phoneNumberRateLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!(await capacityAvailable(req.user.id))) {
      res.json({ available: [] });
      return;
    }
    const rows = await listNativeAvailableLocalNumbers(undefined, 8);
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      available: rows.map((row) => ({
        phone_number: row.phoneNumber,
        area_code: row.phoneNumber.startsWith("+1") ? row.phoneNumber.slice(2, 5) : null,
        region: [row.locality, row.region].filter(Boolean).join(", ") || null,
      })),
      source: "twilio_preview",
    });
  }),
);

router.post(
  "/api/phone-numbers/search",
  authenticateUser,
  enforceLiveWorkActivation,
  phoneNumberRateLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const areaCode = String(req.body?.area_code || "").trim();
    if (!/^\d{3}$/.test(areaCode)) {
      throw AppError.badRequest("area_code must be a 3-digit US code.");
    }
    if (!(await capacityAvailable(req.user.id))) {
      const slots = await getIncludedPhoneLineSlots(req.user.id);
      throw new AppError(
        403,
        "PHONE_CAPACITY_REACHED",
        `Your plan includes ${slots} dedicated line${slots === 1 ? "" : "s"}; upgrade or add an Extra Agent for more.`,
      );
    }

    const rows = await listNativeAvailableLocalNumbers(areaCode, 8);
    if (!rows.length) {
      throw new AppError(
        404,
        "AREA_CODE_UNAVAILABLE",
        "That area code has no inventory right now. Try another nearby code.",
      );
    }
    res.json({
      available: rows.map((row) => ({
        phone_number: row.phoneNumber,
        area_code: areaCode,
        region: [row.locality, row.region].filter(Boolean).join(", ") || null,
      })),
      source: "twilio_preview",
    });
  }),
);

async function respondWithProvision(
  req: AuthenticatedRequest,
  res: Response,
  input: {
    agentId?: string;
    areaCode?: string;
    phoneNumber?: string;
    campaignLabel?: string;
  },
) {
  const result = await provisionNativeTenantNumber({
    userId: req.user.id,
    agentId: input.agentId,
    areaCode: input.areaCode,
    preferredPhoneNumber: input.phoneNumber,
    campaignLabel: input.campaignLabel,
  });
  if (!result.ok) {
    res.status(statusForProvisionFailure(result.code, result.activationPending)).json({
      ok: false,
      code: result.code || "PHONE_PROVISION_FAILED",
      error: result.error || "Could not activate a phone line.",
      phone_number: result.phoneNumber ?? null,
      carrier_number_id: result.carrierNumberId ?? null,
      reused: result.reused === true,
      activation_pending: result.activationPending === true,
    });
    return;
  }
  res.status(result.reused ? 200 : 201).json({
    ok: true,
    phone_number: result.phoneNumber,
    carrier_number_id: result.carrierNumberId,
    reused: result.reused === true,
    provider: "twilio_xai_native",
  });
}

router.post(
  "/api/phone-numbers/provision",
  authenticateUser,
  enforceLiveWorkActivation,
  phoneNumberRateLimiter,
  validateBody(phoneNumberProvisionSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await respondWithProvision(req, res, {
      agentId: req.body.agent_id || undefined,
      areaCode: req.body.area_code || undefined,
      phoneNumber: req.body.phone_number || undefined,
      campaignLabel: req.body.campaign_label || undefined,
    });
  }),
);

router.post(
  "/api/phone-numbers/claim",
  authenticateUser,
  enforceLiveWorkActivation,
  phoneNumberRateLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const phoneNumber = String(req.body?.phone_number || "").trim();
    if (!phoneNumber) throw AppError.badRequest("phone_number is required.");
    await respondWithProvision(req, res, {
      phoneNumber,
      agentId: req.body?.agent_id ? String(req.body.agent_id).trim() : undefined,
    });
  }),
);

router.patch(
  "/api/phone-numbers/:id",
  authenticateUser,
  enforceLiveWorkActivation,
  phoneNumberRateLimiter,
  validateBody(phoneNumberUpdateSchema),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const lineId = parsePhoneNumberRowId(req.params.id);
    const result = await assignNativePhoneLine({
      userId: req.user.id,
      lineId,
      ...(req.body.agent_id !== undefined ? { agentId: req.body.agent_id || null } : {}),
      ...(req.body.campaign_label !== undefined
        ? { campaignLabel: String(req.body.campaign_label) }
        : {}),
    });
    res.json({
      success: true,
      number: result.line,
      native_voice_status: result.nativeVoice?.binding?.status ??
        (result.line.agentId ? "pending" : "retired"),
    });
  }),
);

router.get(
  "/api/carrier/numbers",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const rows = await drizzle
      .select({
        id: schema.phoneNumbers.vapiNumberId,
        number: schema.phoneNumbers.phoneNumber,
      })
      .from(schema.phoneNumbers)
      .where(eq(schema.phoneNumbers.userId, req.user.id));
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      numbers: rows.map((row) => ({
        id: row.id,
        number: row.number,
        provider: isTwilioPhoneNumberSid(row.id) ? "twilio" : "legacy_rollback",
      })),
    });
  }),
);

export default router;
