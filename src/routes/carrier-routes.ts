/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
import { Router, Request, Response } from "express";
import { AppError } from "../lib/api-error";
import { log, fetchWithTimeout, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import {
  validateBody,
  phoneNumberPatchSchema,
  phoneNumberProvisionSchema,
} from "../lib/api-validation";
import { PhoneNumberCreateRequestSchema } from "../../contracts/api-types";
import { getErrorMessage } from "../lib/server-utils";
import * as rateLimiters from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";
import { ensureTenantTelecomDefaults } from "../lib/agent-phone-lines";
import { runCompanyIdentityMutation } from "../lib/company-identity-mutation";
import {
  listVapiNumbers,
  provisionVapiNumber,
  vapiAccountHeadroom,
  POPULAR_AREA_CODES,
} from "../lib/vapi-phone-numbers";
import { enforceLiveWorkActivation } from "../lib/trial-gate";

interface VapiPhoneNumber {
  id: string;
  number: string;
  provider: string;
}

const router = Router();

// ==========================================
// 1.5.4 PHONE NUMBER MANAGEMENT
// ==========================================
router.get(
  "/api/phone-numbers",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await drizzle
        .select()
        .from(schema.phoneNumbers)
        .where(eq(schema.phoneNumbers.userId, req.user.id))
        .orderBy(desc(schema.phoneNumbers.createdAt), desc(schema.phoneNumbers.id));

      // Drizzle returns camelCase JS keys (phoneNumber, vapiNumberId, …) but
      // every client consumer (CarrierPanel, ActivationNudge, AdminSettings)
      // reads snake_case. Normalize the contract here so rows don't render as
      // "undefined". id stays a string (BigInt.toJSON) so PATCH/DELETE keep working.
      const numbers = (data || []).map((n) => ({
        id: String(n.id),
        phone_number: n.phoneNumber,
        vapi_number_id: n.vapiNumberId,
        agent_id: n.agentId,
        campaign_label: n.campaignLabel,
        created_at: n.createdAt,
      }));

      res.json({ numbers });
    } catch (err: any) {
      log.error("GET /api/phone-numbers failed", { error: getErrorMessage(err) });
      res.status(503).json({
        numbers: [],
        degraded: true,
        error: "Phone numbers are temporarily unavailable. Try again shortly.",
        code: "PHONE_NUMBERS_DEGRADED",
      });
    }
  },
);

router.post(
  "/api/phone-numbers",
  authenticateUser,
  rateLimiters.phoneNumberRateLimiter,
  validateBody(PhoneNumberCreateRequestSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { phone_number, vapi_number_id } = req.body;
      await runCompanyIdentityMutation(req.user.id, "phone_number_changed", async (tx) => {
        await tx.insert(schema.phoneNumbers).values({
          phoneNumber: phone_number,
          vapiNumberId: vapi_number_id,
          userId: req.user.id,
        });
      });
      res.json({ success: true });
    } catch (err: any) {
      log.error("POST /api/phone-numbers failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to add phone number");
    }
  },
);

/**
 * Provision a dedicated line for the tenant (Twilio buy → Vapi import, or Vapi pool).
 * Used by Fast Start onboarding after agent create with defer_phone_provision.
 * Idempotent per agent — returns an existing line when already bound.
 */
router.post(
  "/api/phone-numbers/provision",
  authenticateUser,
  enforceLiveWorkActivation,
  rateLimiters.phoneNumberRateLimiter,
  validateBody(phoneNumberProvisionSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const agentId = req.body.agent_id ? String(req.body.agent_id).trim() : undefined;
      const areaCode = req.body.area_code ? String(req.body.area_code).trim() : undefined;

      if (agentId) {
        const [agent] = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
          .limit(1);
        if (!agent)
          return res.status(404).json({
            code: "NOT_FOUND",
            ok: false,
            error: "Agent not found.",
          });
      }

      const { provisionTenantNumber } = await import("../lib/phone-provisioning");
      const result = await provisionTenantNumber(req.user.id, {
        agentId,
        areaCode,
        campaignLabel: "fast-start-provision",
      });

      if (!result.ok) {
        const quotaHit =
          typeof result.error === "string" &&
          (/includes \d+ dedicated/i.test(result.error) || /upgrade to add/i.test(result.error));
        return res.status(quotaHit ? 403 : 503).json({
          code: "ERROR",
          ok: false,
          error: result.error ?? "Could not provision a phone number.",
        });
      }

      res.json({
        ok: true,
        phone_number: result.phoneNumber,
        vapi_number_id: result.vapiNumberId,
        reused: result.reused ?? false,
      });
    } catch (e: unknown) {
      log.error("phone-numbers/provision failed", { error: getErrorMessage(e) });
      res
        .status(503)
        .json({ ok: false, error: "Could not provision a phone number. Try again shortly." });
    }
  },
);

router.patch(
  "/api/phone-numbers/:id",
  authenticateUser,
  rateLimiters.phoneNumberRateLimiter,
  validateBody(phoneNumberPatchSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { agent_id, campaign_label } = req.body;

      if (agent_id) {
        const [agent] = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agent_id), eq(schema.agents.userId, req.user.id)))
          .limit(1);
        if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
      }

      // Build patch object — accept agent_id and/or campaign_label so the
      // same PATCH endpoint serves both Carrier-panel assign-agent and the
      // new campaign-attribution label editor.
      const patch: Record<string, any> = {};
      if (agent_id !== undefined) patch.agentId = agent_id;
      if (campaign_label !== undefined) {
        const label = typeof campaign_label === "string" ? campaign_label.trim() : null;
        patch.campaignLabel = label && label.length > 0 ? label : null;
      }
      if (Object.keys(patch).length === 0) {
        return res
          .status(400)
          .json({ error: "Nothing to update — pass agent_id or campaign_label." });
      }

      await drizzle
        .update(schema.phoneNumbers)
        .set(patch)
        .where(
          and(
            eq(schema.phoneNumbers.id, BigInt(req.params.id)),
            eq(schema.phoneNumbers.userId, req.user.id),
          ),
        );

      res.json({ success: true });
    } catch (error: any) {
      log.error("Failed to update phone number", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to update phone number");
    }
  },
);

router.delete(
  "/api/phone-numbers/:id",
  authenticateUser,
  rateLimiters.phoneNumberRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await runCompanyIdentityMutation(req.user.id, "phone_number_changed", async (tx) => {
        await tx
          .delete(schema.phoneNumbers)
          .where(
            and(
              eq(schema.phoneNumbers.id, BigInt(req.params.id)),
              eq(schema.phoneNumbers.userId, req.user.id),
            ),
          );
      });

      res.json({ success: true });
    } catch (error: any) {
      log.error("Failed to delete phone number", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to delete phone number.");
    }
  },
);

// ==========================================
// 1.5.5 NUMBER POOL — self-serve picker
// ==========================================
// The Vapi side is hidden from the client. Responses talk about
// "available numbers" and "regions", never mention Vapi by name.

/** Curated area-code list for the picker dropdown. */
router.get("/api/phone-numbers/area-codes", authenticateUser, (_req: Request, res: Response) => {
  res.json({ area_codes: POPULAR_AREA_CODES });
});

/**
 * Available numbers in the pool — Vapi-provisioned numbers that haven't
 * been claimed by any wireline user yet (no row in wireline_phone_numbers).
 *
 * Used by the agent-deploy modal and the onboarding "Connect a phone
 * number" step. Caches at the request boundary (no need for refresh
 * between renders).
 */
router.get(
  "/api/phone-numbers/available",
  authenticateUser,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const [poolNumbers, claimedRows] = await Promise.all([
        listVapiNumbers(),
        drizzle.select({ vapiId: schema.phoneNumbers.vapiNumberId }).from(schema.phoneNumbers),
      ]);
      const claimed = new Set(claimedRows.map((r) => r.vapiId).filter(Boolean));
      const available = poolNumbers
        .filter((n) => n.provider === "vapi" && !claimed.has(n.id) && n.number)
        .map((n) => {
          const e164 = n.number || "";
          const ac = e164.startsWith("+1") ? e164.slice(2, 5) : "";
          const meta = POPULAR_AREA_CODES.find((m) => m.code === ac);
          return {
            phone_number: e164,
            area_code: ac || null,
            region: meta ? `${meta.city}, ${meta.state}` : null,
          };
        });
      res.json({ available });
    } catch (e: any) {
      log.error("Failed to list available pool numbers", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(503, "Number pool unavailable. Try again shortly.");
    }
  },
);

/**
 * Try to buy a fresh number in a specific area code. Used when the
 * pool is exhausted OR the user wants a region we don't have in pool.
 * Subject to the Vapi free-tier headroom; returns 409 if cap hit.
 */
router.post(
  "/api/phone-numbers/search",
  authenticateUser,
  enforceLiveWorkActivation,
  rateLimiters.phoneNumberRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const areaCode = String(req.body?.area_code || "").trim();
      if (!/^\d{3}$/.test(areaCode)) {
        throw AppError.fromHttpStatus(400, "area_code must be a 3-digit US code.");
      }

      const headroom = await vapiAccountHeadroom();
      if (headroom.remaining <= 0) {
        return res.status(409).json({
          error:
            "Free phone-number capacity reached. Release an unused number from /admin → Numbers to free a slot, or contact sales for paid numbers.",
          code: "POOL_CAPACITY_REACHED",
          headroom,
        });
      }

      const fresh = await provisionVapiNumber({
        areaCode,
        name: `Wireline · self-serve ${areaCode}`,
      });
      res.json({
        phone_number: fresh.number,
        area_code: areaCode,
      });
    } catch (e: any) {
      // Vapi rejected — most commonly "area code not available"
      const msg = getErrorMessage(e);
      if (/not available/i.test(msg)) {
        return res.status(404).json({
          error: "That area code has no inventory right now. Try another nearby code.",
          code: "AREA_CODE_UNAVAILABLE",
        });
      }
      log.error("phone-numbers/search failed", { error: msg });
      throw AppError.fromHttpStatus(503, "Could not search for a number. Try again shortly.");
    }
  },
);

/**
 * Claim a number from the pool — attach it to the caller's chosen agent
 * (or create the wireline_phone_numbers row with no agent if agent_id
 * is omitted). Wires the Vapi assistant binding so calls actually route.
 */
router.post(
  "/api/phone-numbers/claim",
  authenticateUser,
  enforceLiveWorkActivation,
  rateLimiters.phoneNumberRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const phoneNumber = String(req.body?.phone_number || "").trim();
      const agentId = req.body?.agent_id ? String(req.body.agent_id).trim() : null;
      if (!phoneNumber) {
        throw AppError.fromHttpStatus(400, "phone_number is required.");
      }

      // Re-fetch pool to translate e164 → Vapi id AND verify it's actually
      // unclaimed. Doing both in one go avoids a race where two users claim
      // the same number simultaneously (only one will hit a unique-constraint
      // violation on phone_number, the other will succeed cleanly).
      const [poolNumbers, claimedRows] = await Promise.all([
        listVapiNumbers(),
        drizzle.select({ vapiId: schema.phoneNumbers.vapiNumberId }).from(schema.phoneNumbers),
      ]);
      const match = poolNumbers.find((n) => n.number === phoneNumber && n.provider === "vapi");
      if (!match) {
        throw AppError.fromHttpStatus(404, "That number isn't in the pool anymore.");
      }
      const claimed = new Set(claimedRows.map((r) => r.vapiId).filter(Boolean));
      if (claimed.has(match.id)) {
        throw AppError.fromHttpStatus(409, "That number was just claimed. Pick another.");
      }

      // If an agent was named, validate ownership before binding the
      // number to it. Wireline's inbound flow routes calls based on the
      // phone_numbers.agent_id lookup at webhook time, so the in-DB row
      // is sufficient — we don't need to push an assistantId into Vapi.
      if (agentId) {
        const [agent] = await drizzle
          .select({ id: schema.agents.id })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, req.user.id)))
          .limit(1);
        if (!agent) throw AppError.fromHttpStatus(404, "Agent not found.");
      }

      await runCompanyIdentityMutation(req.user.id, "phone_number_changed", async (tx) => {
        await tx.insert(schema.phoneNumbers).values({
          userId: req.user.id,
          phoneNumber,
          vapiNumberId: match.id,
          agentId,
        });
      });

      await ensureTenantTelecomDefaults(req.user.id, {
        vapiPhoneNumberId: match.id,
        phoneNumberE164: phoneNumber,
      });

      res.json({ success: true, phone_number: phoneNumber, agent_id: agentId });
    } catch (e: any) {
      // Unique-constraint race winner already inserted the row — surface
      // a clean conflict so the picker can re-fetch the pool.
      const msg = getErrorMessage(e);
      if (/duplicate key|unique constraint/i.test(msg)) {
        throw AppError.fromHttpStatus(409, "That number was just claimed. Pick another.");
      }
      log.error("phone-numbers/claim failed", { error: msg });
      throw AppError.fromHttpStatus(503, "Could not claim that number. Try again.");
    }
  },
);

// ==========================================
// 1.5.6 CARRIER SYNC (VAPI PROXY)
// ==========================================
router.get(
  "/api/carrier/numbers",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const vapiSecret = process.env.VAPI_PRIVATE_KEY;
      if (!vapiSecret) return res.json({ numbers: [] });

      const response = await fetchWithTimeout(
        "https://api.vapi.ai/phone-number",
        {
          headers: { Authorization: `Bearer ${vapiSecret}` },
        },
        15_000,
      );
      const data = (await response.json()) as VapiPhoneNumber[];

      // The Vapi response is usually an array of phone number objects
      const formatted = (data || []).map((num: VapiPhoneNumber) => ({
        id: num.id,
        number: num.number,
        provider: num.provider,
      }));

      res.json({ numbers: formatted });
    } catch (error: any) {
      log.error("Vapi sync error", { error: getErrorMessage(error) });
      res.json({ numbers: [] });
    }
  },
);

export default router;
