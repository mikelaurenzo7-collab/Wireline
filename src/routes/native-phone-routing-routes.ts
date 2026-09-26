import { Router, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { isTwilioPhoneNumberSid } from "../lib/agent-phone-lines";
import { AppError, asyncHandler } from "../lib/api-error";
import { liveExternalActionPolicyForUser } from "../lib/account-environment-policy";
import {
  phoneNumberPatchSchema,
  phoneNumberProvisionSchema,
  validateBody,
} from "../lib/api-validation";
import { getIncludedPhoneLineSlots } from "../lib/phone-line-entitlements";
import { drizzle, log } from "../lib/server-context";
import { enqueuePaidBotIdentityReconciliation } from "../lib/paid-bot-identity";
import { enforceLiveWorkActivation } from "../lib/trial-gate";
import { assignNativePhoneLine } from "../lib/voice/native-phone-assignment";
import {
  listNativeAvailableLocalNumbers,
  repairOwnedTwilioOpenAIRouting,
} from "../lib/voice/native-phone-carrier";
import {
  listPhoneNumberPickerAreaCodes,
  resolveNonProductionPhoneNumberPickerInventory,
} from "../lib/voice/phone-number-picker-inventory";
import { provisionNativeTenantNumber } from "../lib/voice/native-phone-provisioning";
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

function statusForProvisionFailure(code?: string, activationPending?: boolean): number {
  if (activationPending) return 503;
  if (code === "PHONE_CAPACITY_REACHED") return 403;
  if (code === "NOT_FOUND") return 404;
  if (code === "CONFLICT") return 409;
  if (code === "BAD_REQUEST" || code === "VALIDATION_ERROR") return 400;
  return 503;
}

async function assertNumberCapacity(userId: string): Promise<void> {
  const slots = await getIncludedPhoneLineSlots(userId);
  const [{ held }] = await drizzle
    .select({ held: sql<number>`count(*)` })
    .from(schema.phoneNumbers)
    .where(eq(schema.phoneNumbers.userId, userId));
  if (Number(held || 0) >= slots) {
    throw new AppError(
      403,
      "PHONE_CAPACITY_REACHED",
      `Your plan includes ${slots} dedicated line${slots === 1 ? "" : "s"}; upgrade or add an Extra Agent for more.`,
    );
  }
}

async function queueManagedIdentity(userId: string, agentId: string): Promise<void> {
  try {
    await enqueuePaidBotIdentityReconciliation(userId);
  } catch (error) {
    log.error("Paid Bot mailbox reconciliation could not be queued after phone selection", {
      userId,
      agentId,
      error: error instanceof Error ? error.message : "Unknown queue failure",
    });
    throw AppError.serviceUnavailable(
      "The phone change is saved, but email setup could not start. Retry this action to finish setup.",
    );
  }
}

router.get(
  "/api/phone-numbers",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const routing = await repairOwnedTwilioOpenAIRouting(req.user.id);
    const rows = await drizzle
      .select({
        id: schema.phoneNumbers.id,
        phoneNumber: schema.phoneNumbers.phoneNumber,
        carrierNumberId: schema.phoneNumbers.vapiNumberId,
        agentId: schema.phoneNumbers.agentId,
        campaignLabel: schema.phoneNumbers.campaignLabel,
        createdAt: schema.phoneNumbers.createdAt,
      })
      .from(schema.phoneNumbers)
      .where(eq(schema.phoneNumbers.userId, req.user.id));
    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      numbers: rows.map((row) => {
        const routingConfirmed = routing.confirmedPhoneNumbers.has(row.phoneNumber);
        const nativeVoiceStatus = !row.agentId
          ? "unassigned"
          : routingConfirmed
            ? "active"
            : routing.state === "not_configured"
              ? "configuration_required"
              : routing.state === "blocked"
                ? "unavailable"
                : "degraded";
        const nativeVoiceError =
          !row.agentId || routingConfirmed
            ? null
            : (routing.failures.get(row.phoneNumber) ??
              (routing.state === "not_configured"
                ? "Phone voice needs platform configuration. Contact BotBound support."
                : routing.state === "blocked"
                  ? "Phone voice is unavailable for this account environment."
                  : "BotBound could not confirm this line's Twilio routing. Retry shortly or contact support."));
        return {
          id: String(row.id),
          phone_number: row.phoneNumber,
          carrier_number_id: row.carrierNumberId,
          agent_id: row.agentId,
          campaign_label: row.campaignLabel,
          provider: "twilio_openai_realtime_sip",
          native_voice_status: nativeVoiceStatus,
          native_voice_error: nativeVoiceError,
          created_at: row.createdAt?.toISOString() ?? null,
        };
      }),
      routing: {
        state: routing.state,
        confirmed: routing.confirmedPhoneNumbers.size,
        failed: routing.failures.size,
      },
    });
  }),
);

router.get(
  "/api/phone-numbers/area-codes",
  authenticateUser,
  asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ area_codes: listPhoneNumberPickerAreaCodes() });
  }),
);

router.get(
  "/api/phone-numbers/available",
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res: Response, next) => {
    const policy = await liveExternalActionPolicyForUser(req.user.id);
    const fixture = resolveNonProductionPhoneNumberPickerInventory(policy);
    if (!fixture) {
      next();
      return;
    }
    res.setHeader("Cache-Control", "private, no-store");
    res.json(fixture);
  }),
  phoneNumberRateLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    await assertNumberCapacity(req.user.id);
    const rows = await listNativeAvailableLocalNumbers(req.user.id, undefined, 8);
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
    await assertNumberCapacity(req.user.id);

    const rows = await listNativeAvailableLocalNumbers(req.user.id, areaCode, 8);
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
  if (input.agentId) {
    await queueManagedIdentity(req.user.id, input.agentId);
  }
  res.status(result.reused ? 200 : 201).json({
    ok: true,
    phone_number: result.phoneNumber,
    carrier_number_id: result.carrierNumberId,
    reused: result.reused === true,
    provider: "twilio_openai_realtime_sip",
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
  validateBody(phoneNumberPatchSchema),
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
    if (result.line.agentId) await queueManagedIdentity(req.user.id, result.line.agentId);
    res.json({
      success: true,
      number: result.line,
      native_voice_status:
        result.nativeVoice?.status ?? (result.line.agentId ? "pending" : "retired"),
    });
  }),
);

router.delete(
  "/api/phone-numbers/:id",
  authenticateUser,
  phoneNumberRateLimiter,
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const lineId = parsePhoneNumberRowId(req.params.id);
    const [owned] = await drizzle
      .select({ phoneNumber: schema.phoneNumbers.phoneNumber })
      .from(schema.phoneNumbers)
      .where(and(eq(schema.phoneNumbers.userId, req.user.id), eq(schema.phoneNumbers.id, lineId)))
      .limit(1);
    if (!owned) throw AppError.notFound("Phone number not found.");

    const released = await releaseNativeTenantNumber(req.user.id, owned.phoneNumber);
    if (!released.ok) {
      throw new AppError(
        503,
        "CARRIER_RELEASE_FAILED",
        released.error || "The carrier could not confirm number release.",
      );
    }
    res.json({ ok: true, released: true });
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
