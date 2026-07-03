/**
 * Mobile surface for the native Wireline iOS app (`/api/mobile/*`).
 *
 * This is a thin adapter layer: every handler delegates to the same backend
 * primitives the web app uses (entitlements, the Vapi outbound client, the
 * compliance + TCPA gates) — it never re-implements prompt building, model
 * selection, or billing logic. The contract is mobile-shaped (one bootstrap
 * call, Bearer auth) but the behaviour is identical to the web equivalents.
 *
 * AUTH: Bearer-token only. Native clients send no Origin/Referer header, so
 * `assertSameOrigin` lets them through (see src/middleware/same-origin.ts, where
 * `/api/mobile/` is also explicitly skip-listed); cookies are never accepted on
 * this surface, so it is structurally not CSRF-reachable. Every route below is
 * protected with inline `authenticateUser` so the default-deny authz gate
 * (scripts/generate-authz-matrix.ts) sees it as protected.
 */
import { Router, Response } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { AppError } from "../lib/api-error";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import { validate } from "../middleware/input-validation";
import { createRateLimiter } from "../middleware/api-rate-limits";
import { resolveAgentEntitlement, agentCapHit } from "../lib/agent-entitlements";
import { isOwnerEmail } from "../lib/auth-service";
import { planById } from "../lib/plan-catalog";
import { resolveAccountType } from "../lib/account-type";
import { ensureDefaultAccount } from "../lib/account-service";
import { outboundVoiceGuard } from "../lib/voice-spend-control";
import { isDncBlocked } from "../lib/compliance";
import { evaluateOutboundConsent } from "../lib/tcpa-consent";
import { placeOutboundCall, transferLiveCall } from "../lib/vapi-client";
import { getCreditBalanceUsd, getRecentLedger } from "../lib/credit-wallet";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

/** General mobile read/write limiter — keyed per user. */
const mobileRateLimiter = createRateLimiter({
  bucket: "api:mobile",
  windowMs: 60_000,
  max: 60,
});

/** Tighter limiter for the two surfaces that cost money or write device rows. */
const mobileSensitiveRateLimiter = createRateLimiter({
  bucket: "api:mobile:sensitive",
  windowMs: 60_000,
  max: 20,
});

// ── GET /api/mobile/me — workspace bootstrap ───────────────────────────────
router.get(
  "/api/mobile/me",
  authenticateUser,
  mobileRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user.id;

      // Three independent reads — run them concurrently.
      const [[profile], [row], [{ count }]] = await Promise.all([
        drizzle
          .select({ fullName: schema.users.fullName, email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1),
        drizzle
          .select({
            planId: schema.subscriptions.plan,
            subscriptionStatus: schema.settings.subscriptionStatus,
            maxAgents: schema.settings.maxAgents,
            extraAgents: schema.settings.extraAgents,
            businessName: schema.settings.businessName,
            handoffPhone: schema.settings.handoffPhone,
          })
          .from(schema.settings)
          .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
          .where(eq(schema.settings.userId, userId))
          .limit(1),
        drizzle
          .select({ count: sql<number>`count(*)` })
          .from(schema.agents)
          .where(eq(schema.agents.userId, userId)),
      ]);
      const agentCount = Number(count);

      const isOwner = isOwnerEmail(req.user.email);
      const entitlement = resolveAgentEntitlement({
        isOwner,
        subscriptionStatus: row?.subscriptionStatus,
        planId: row?.planId,
        maxAgents: row?.maxAgents,
        extraAgents: row?.extraAgents,
      });

      const planId = row?.planId || "personal";
      const plan = planById(planId);
      const fallbackAccountMode = resolveAccountType(planId);
      const accountMode = (await ensureDefaultAccount(userId, fallbackAccountMode)).type;

      res.json({
        user: {
          id: userId,
          email: profile?.email || req.user.email,
          full_name: profile?.fullName || null,
        },
        account: {
          mode: accountMode,
          plan_id: plan?.id || planId,
          plan_name: plan?.name || "Personal",
          business_name: row?.businessName || null,
          subscription_status: entitlement.subscriptionStatus,
        },
        agents: {
          count: agentCount,
          included: entitlement.planAgents,
          extras: entitlement.purchasedExtras,
          effective_cap: entitlement.effectiveCap,
          unlimited: entitlement.unlimited,
          can_add_more: !agentCapHit(agentCount, entitlement),
        },
        extra_agent: {
          price_usd: plan?.extra_agent_price_usd ?? null,
          configured:
            !!plan?.extraAgentPriceIdEnv && !!process.env[plan.extraAgentPriceIdEnv as string],
        },
        settings: {
          // The Account Holder's callback number for "take this call" handoffs.
          handoff_phone: row?.handoffPhone || null,
        },
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("GET /api/mobile/me failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to load workspace.");
    }
  },
);

// ── GET /api/mobile/agents — roster for the app ────────────────────────────
router.get(
  "/api/mobile/agents",
  authenticateUser,
  mobileRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rows = await drizzle
        .select({
          id: schema.agents.id,
          name: schema.agents.name,
          role: schema.agents.role,
          archetype: schema.agents.archetype,
          channel: schema.agents.channel,
          channels: schema.agents.channels,
          voiceId: schema.agents.voiceId,
          isBusinessAgent: schema.agents.isBusinessAgent,
          createdAt: schema.agents.createdAt,
        })
        .from(schema.agents)
        .where(eq(schema.agents.userId, req.user.id))
        .orderBy(desc(schema.agents.createdAt));
      res.json({ agents: rows });
    } catch (err) {
      log.error("GET /api/mobile/agents failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to load agents.");
    }
  },
);

// ── GET /api/mobile/agents/:id — single agent config ───────────────────────
router.get(
  "/api/mobile/agents/:id",
  authenticateUser,
  mobileRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [agent] = await drizzle
        .select({
          id: schema.agents.id,
          name: schema.agents.name,
          role: schema.agents.role,
          archetype: schema.agents.archetype,
          channel: schema.agents.channel,
          channels: schema.agents.channels,
          voiceId: schema.agents.voiceId,
          personalityVibe: schema.agents.personalityVibe,
          firstMessage: schema.agents.firstMessage,
          transferPhone: schema.agents.transferPhone,
          createdAt: schema.agents.createdAt,
        })
        .from(schema.agents)
        .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)))
        .limit(1);
      if (!agent) throw AppError.fromHttpStatus(404, "Agent not found.");
      res.json({ agent });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("GET /api/mobile/agents/:id failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to load agent.");
    }
  },
);

// ── POST /api/mobile/devices — register/refresh push tokens ────────────────
// iOS registers a split APNs pair (voip + alert); Android registers a single
// FCM token. The (user_id, device_id) unique key makes refresh an idempotent
// upsert.
const deviceSchema = z.object({
  device_id: z.string().min(1).max(200),
  apns_voip_token: z.string().min(1).max(512).optional(),
  apns_alert_token: z.string().min(1).max(512).optional(),
  fcm_token: z.string().min(1).max(512).optional(),
  platform: z.enum(["ios", "android"]).default("ios"),
  app_version: z.string().max(64).optional(),
});

router.post(
  "/api/mobile/devices",
  authenticateUser,
  mobileSensitiveRateLimiter,
  validate({ body: deviceSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { device_id, apns_voip_token, apns_alert_token, fcm_token, platform, app_version } =
        req.body;
      const now = new Date();
      await drizzle
        .insert(schema.mobileDevices)
        .values({
          userId: req.user.id,
          deviceId: device_id,
          apnsVoipToken: apns_voip_token ?? null,
          apnsAlertToken: apns_alert_token ?? null,
          fcmToken: fcm_token ?? null,
          platform,
          appVersion: app_version ?? null,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: [schema.mobileDevices.userId, schema.mobileDevices.deviceId],
          set: {
            apnsVoipToken: apns_voip_token ?? null,
            apnsAlertToken: apns_alert_token ?? null,
            fcmToken: fcm_token ?? null,
            platform,
            appVersion: app_version ?? null,
            lastSeenAt: now,
            updatedAt: now,
          },
        });
      res.json({ success: true });
    } catch (err) {
      log.error("POST /api/mobile/devices failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to register device.");
    }
  },
);

// ── DELETE /api/mobile/devices/:deviceId — unregister on sign-out ──────────
router.delete(
  "/api/mobile/devices/:deviceId",
  authenticateUser,
  mobileSensitiveRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await drizzle
        .delete(schema.mobileDevices)
        .where(
          and(
            eq(schema.mobileDevices.userId, req.user.id),
            eq(schema.mobileDevices.deviceId, req.params.deviceId),
          ),
        );
      res.json({ success: true });
    } catch (err) {
      log.error("DELETE /api/mobile/devices failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to unregister device.");
    }
  },
);

// ── POST /api/mobile/calls/outbound — "call the doctor, I'll be 5 min late" ─
// Mirrors POST /api/outbound/dial exactly: same spend/trial guard, the same DNC
// + TCPA gates, and the same `placeOutboundCall` client (which builds the
// dynamic system prompt server-side from the agent's stored config). The app
// sends only the target + a free-text context; no prompt logic on device.
const mobileDialSchema = z.object({
  agentId: z.string().min(1, "agentId is required"),
  customerNumber: z
    .string()
    .min(1, "customerNumber is required")
    .regex(
      /^\+?[1-9]\d{6,14}$/,
      "Invalid phone number format — expected E.164 (e.g. +15551234567)",
    ),
  customerName: z.string().max(200).optional(),
  context: z.string().max(2000).optional(),
  hasExpressWrittenConsent: z.boolean().optional().default(false),
});

router.post(
  "/api/mobile/calls/outbound",
  authenticateUser,
  mobileSensitiveRateLimiter,
  outboundVoiceGuard("manual"),
  validate({ body: mobileDialSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { agentId, customerName, customerNumber, context, hasExpressWrittenConsent } = req.body;

      if (await isDncBlocked(req.user.id, customerNumber)) {
        log.warn("Mobile outbound dial blocked by DNC list", { customerNumber });
        return res.status(403).json({
          code: "FORBIDDEN",
          error: "This number is on the Do Not Call list and cannot be dialed.",
          dncBlocked: true,
        });
      }

      const tcpaDecision = evaluateOutboundConsent({
        phone: customerNumber,
        is_internal_dnc: false,
        is_marketing_call: true,
        has_express_written_consent: !!hasExpressWrittenConsent,
      });
      if (!tcpaDecision.allowed) {
        log.warn("Mobile outbound dial blocked by TCPA consent gate", {
          customerNumber,
          abort_reason: tcpaDecision.abort_reason,
        });
        return res.status(403).json({
          code: "FORBIDDEN",
          error: tcpaDecision.disclosure_script || "Call blocked by TCPA consent rules.",
          tcpaBlocked: true,
          tcpa: tcpaDecision,
        });
      }

      const result = await placeOutboundCall({
        userId: req.user.id,
        agentId,
        customerName,
        customerNumber,
        context,
      });
      if (!result.ok) {
        return res.status(result.status).json({ code: "ERROR", error: result.error });
      }

      await drizzle.insert(schema.outboundLeads).values({
        userId: req.user.id,
        agentId,
        customerName,
        customerNumber,
        context,
        callId: result.callId,
        status: "Dialing",
        attempts: 1,
        metadata: { has_express_written_consent: !!hasExpressWrittenConsent, source: "mobile" },
      });

      res.json({ success: true, callId: result.callId });
    } catch (err) {
      log.error("Mobile outbound call failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to dispatch call.");
    }
  },
);

// ── GET /api/mobile/calls/active — poll fallback when a push is missed ─────
router.get(
  "/api/mobile/calls/active",
  authenticateUser,
  mobileRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rows = await drizzle
        .select({
          callId: schema.signalPresence.id,
          agentId: schema.signalPresence.agentId,
          customerNumber: schema.signalPresence.customerNumber,
          status: schema.signalPresence.status,
          label: schema.signalPresence.label,
          type: schema.signalPresence.type,
          startedAt: schema.signalPresence.startedAt,
        })
        .from(schema.signalPresence)
        .where(eq(schema.signalPresence.userId, req.user.id))
        .orderBy(desc(schema.signalPresence.startedAt))
        .limit(50);
      res.json({ calls: rows });
    } catch (err) {
      log.error("GET /api/mobile/calls/active failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to load active calls.");
    }
  },
);

// ── GET /api/mobile/calls/recent — completed-call history + recaps ─────────
// Powers the in-app Calls list and the Siri intents ("summarize my last call",
// "what needs my attention"). callLogs.id is a bigint → stringify it so JSON
// serialization doesn't choke on a BigInt.
router.get(
  "/api/mobile/calls/recent",
  authenticateUser,
  mobileRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const limitRaw = parseInt(String(req.query.limit ?? ""), 10);
      const limit = Math.min(Math.max(1, Number.isNaN(limitRaw) ? 20 : limitRaw), 50);
      const rows = await drizzle
        .select({
          id: schema.callLogs.id,
          agentId: schema.callLogs.agentId,
          direction: schema.callLogs.direction,
          customerNumber: schema.callLogs.customerNumber,
          durationSeconds: schema.callLogs.durationSeconds,
          summary: schema.callLogs.summary,
          sentiment: schema.callLogs.sentiment,
          outcomeTag: schema.callLogs.outcomeTag,
          intentLabel: schema.callLogs.intentLabel,
          createdAt: schema.callLogs.createdAt,
        })
        .from(schema.callLogs)
        .where(and(eq(schema.callLogs.userId, req.user.id), eq(schema.callLogs.demo, false)))
        .orderBy(desc(schema.callLogs.createdAt))
        .limit(limit);

      res.json({
        calls: rows.map((r) => ({ ...r, id: String(r.id) })),
        // Lightweight "needs attention" rollup the Siri digest reads.
        needsAttention: rows.filter((r) => r.outcomeTag === "followup").length,
      });
    } catch (err) {
      log.error("GET /api/mobile/calls/recent failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to load recent calls.");
    }
  },
);

const e164 = z.string().regex(/^\+?[1-9]\d{6,14}$/, "Expected E.164 (e.g. +15551234567)");

// ── PUT /api/mobile/settings — Account Holder's mobile-app preferences ───────────
// Currently just the callback number used for "take this call" handoffs.
const mobileSettingsSchema = z.object({
  handoffPhone: e164.nullable().optional(),
});

router.put(
  "/api/mobile/settings",
  authenticateUser,
  mobileSensitiveRateLimiter,
  validate({ body: mobileSettingsSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { handoffPhone } = req.body as { handoffPhone?: string | null };
      if (handoffPhone !== undefined) {
        await drizzle
          .update(schema.settings)
          .set({ handoffPhone: handoffPhone || null })
          .where(eq(schema.settings.userId, req.user.id));
      }
      res.json({ success: true, handoff_phone: handoffPhone ?? null });
    } catch (err) {
      log.error("PUT /api/mobile/settings failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to save settings.");
    }
  },
);

// ── POST /api/mobile/calls/:callId/handoff — "take this call" ──────────────
// Warm-transfers an in-progress call to the Account Holder's number via Vapi live
// control (no Twilio). Destination is the request's `to` or the saved
// handoff_phone. Ownership is enforced by scoping the presence row to user.
const handoffSchema = z.object({ to: e164.optional() });

router.post(
  "/api/mobile/calls/:callId/handoff",
  authenticateUser,
  mobileSensitiveRateLimiter,
  validate({ body: handoffSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [presence] = await drizzle
        .select({ controlUrl: schema.signalPresence.controlUrl })
        .from(schema.signalPresence)
        .where(
          and(
            eq(schema.signalPresence.id, req.params.callId),
            eq(schema.signalPresence.userId, req.user.id),
          ),
        )
        .limit(1);

      if (!presence) {
        return res.status(404).json({ code: "NOT_FOUND", error: "That call isn't active." });
      }
      if (!presence.controlUrl) {
        return res.status(409).json({
          code: "HANDOFF_UNAVAILABLE",
          error: "This call can't be taken over yet — the carrier hasn't reported control info.",
        });
      }

      let destination = (req.body as { to?: string }).to;
      if (!destination) {
        const [s] = await drizzle
          .select({ handoffPhone: schema.settings.handoffPhone })
          .from(schema.settings)
          .where(eq(schema.settings.userId, req.user.id))
          .limit(1);
        destination = s?.handoffPhone || undefined;
      }
      if (!destination) {
        return res.status(400).json({
          code: "NO_CALLBACK_NUMBER",
          error: "Set a callback number first so we know where to send the call.",
        });
      }

      const result = await transferLiveCall(presence.controlUrl, destination);
      if (!result.ok) {
        return res.status(result.status).json({ code: "ERROR", error: result.error });
      }
      res.json({ success: true });
    } catch (err) {
      log.error("POST /api/mobile/calls/:callId/handoff failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to take the call.");
    }
  },
);

// ── GET /api/mobile/calls/:callId/detail — full recap incl. transcript ─────
router.get(
  "/api/mobile/calls/:callId/detail",
  authenticateUser,
  mobileRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { callId } = req.params;
      // callLogs.id is a bigint — reject non-numeric ids before the PG cast.
      if (!/^\d+$/.test(callId)) {
        return res.status(404).json({ code: "NOT_FOUND", error: "Call not found." });
      }
      const [call] = await drizzle
        .select({
          id: schema.callLogs.id,
          agentId: schema.callLogs.agentId,
          direction: schema.callLogs.direction,
          customerNumber: schema.callLogs.customerNumber,
          durationSeconds: schema.callLogs.durationSeconds,
          summary: schema.callLogs.summary,
          transcript: schema.callLogs.transcript,
          sentiment: schema.callLogs.sentiment,
          outcomeTag: schema.callLogs.outcomeTag,
          intentLabel: schema.callLogs.intentLabel,
          recordingUrl: schema.callLogs.recordingUrl,
          createdAt: schema.callLogs.createdAt,
        })
        .from(schema.callLogs)
        .where(and(eq(schema.callLogs.id, BigInt(callId)), eq(schema.callLogs.userId, req.user.id)))
        .limit(1);
      if (!call) {
        return res.status(404).json({ code: "NOT_FOUND", error: "Call not found." });
      }
      res.json({ call: { ...call, id: String(call.id) } });
    } catch (err) {
      log.error("GET /api/mobile/calls/:callId/detail failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to load call.");
    }
  },
);

// ── GET /api/mobile/wallet — prepaid credit balance + recent ledger ────────
// READ-ONLY. Top-ups happen on the web (Stripe); the app never sells credits
// in-app, which keeps Wireline clear of Apple's IAP requirement.
router.get(
  "/api/mobile/wallet",
  authenticateUser,
  mobileRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [balanceUsd, ledger] = await Promise.all([
        getCreditBalanceUsd(req.user.id),
        getRecentLedger(req.user.id, 20),
      ]);
      res.json({ balance_usd: balanceUsd, ledger });
    } catch (err) {
      log.error("GET /api/mobile/wallet failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to load wallet.");
    }
  },
);

export default router;
