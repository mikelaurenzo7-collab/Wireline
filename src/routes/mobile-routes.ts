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
import { randomUUID } from "node:crypto";
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
import { isFederalDncListed, assertFederalDncForMarketing } from "../lib/federal-dnc-service";
import {
  buildOutboundComplianceStatus,
  outboundComplianceBlock,
} from "../lib/outbound-compliance-status";
import {
  OUTBOUND_CALL_PURPOSES,
  isMarketingCallPurpose,
  normalizedExpressConsent,
  outboundConsentMetadata,
} from "../lib/outbound-call-purpose";
import { placeOutboundCall, transferLiveCall } from "../lib/vapi-client";
import { getCreditBalanceUsd, getRecentLedger } from "../lib/credit-wallet";
import { getErrorMessage } from "../lib/server-utils";
import { pickRotatedVoiceId } from "../data/voice-roster";
import { businessAgentVideoPresenterDefaults } from "../lib/video-presenter/liveavatar-service";
import {
  getDefaultAgentTools,
  isAgentToolName,
  normalizeEnabledTools,
  type AgentToolName,
} from "../lib/agent-capabilities";
import { resolveAgentVideoPresenter } from "../lib/video-presenter/resolve-agent-presenter";
import type { AuthenticatedRequest } from "../types/auth";
import {
  AGENT_CREATE_DEFAULT_ROLE_ID,
  canonicalizeAgentRoleForCreate,
  listAgentRolesForApi,
  resolveAgentRoleArchetype,
  validateAgentRoleForCreate,
} from "../lib/agent-role-definitions";

const router = Router();

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function ownedAgent(agentId: string, userId: string) {
  const [agent] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  return agent;
}

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
        compliance: buildOutboundComplianceStatus(),
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

// ── GET /api/mobile/agents/roles — shared role catalog ─────────────────────
router.get(
  "/api/mobile/agents/roles",
  authenticateUser,
  mobileRateLimiter,
  (_req: AuthenticatedRequest, res: Response) => {
    res.json({ roles: listAgentRolesForApi() });
  },
);

// ── POST /api/mobile/agents — native-safe agent creation adapter ──────────
const mobileCreateAgentSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.string().max(80).optional(),
  is_business_agent: z.boolean().optional().default(false),
});

router.post(
  "/api/mobile/agents",
  authenticateUser,
  mobileSensitiveRateLimiter,
  validate({ body: mobileCreateAgentSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = cleanText(req.body?.name, 120);
      const rawRole = cleanText(req.body?.role, 80) || AGENT_CREATE_DEFAULT_ROLE_ID;
      const roleError = validateAgentRoleForCreate(rawRole);
      if (roleError) {
        return res.status(400).json({ code: "UNKNOWN_AGENT_ROLE", error: roleError });
      }
      const role = canonicalizeAgentRoleForCreate(rawRole);
      const isBusinessAgent = req.body?.is_business_agent === true;
      const [{ count }] = await drizzle
        .select({ count: sql<number>`count(*)` })
        .from(schema.agents)
        .where(eq(schema.agents.userId, req.user.id));
      const [settingsRow] = await drizzle
        .select({
          subscriptionStatus: schema.settings.subscriptionStatus,
          maxAgents: schema.settings.maxAgents,
          extraAgents: schema.settings.extraAgents,
          planId: schema.subscriptions.plan,
        })
        .from(schema.settings)
        .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
        .where(eq(schema.settings.userId, req.user.id))
        .limit(1);
      const entitlement = resolveAgentEntitlement({
        isOwner: isOwnerEmail(req.user.email),
        subscriptionStatus: settingsRow?.subscriptionStatus,
        planId: settingsRow?.planId,
        maxAgents: settingsRow?.maxAgents,
        extraAgents: settingsRow?.extraAgents,
      });
      if (agentCapHit(Number(count), entitlement)) {
        return res.status(402).json({
          code: "AGENT_CAPACITY_REACHED",
          error: "Your plan has reached its agent capacity.",
        });
      }

      const id = `agent-${randomUUID()}`;
      const existing = Number(count);
      const voiceId = pickRotatedVoiceId(existing);
      const enabledTools = getDefaultAgentTools();
      const videoPresenter = isBusinessAgent ? businessAgentVideoPresenterDefaults() : {};
      await drizzle.insert(schema.agents).values({
        id,
        userId: req.user.id,
        name,
        role,
        channel: "voice",
        archetype: resolveAgentRoleArchetype(role),
        voiceId,
        voiceProvider: "11labs",
        enabledTools,
        firstMessage: `Hi, this is ${name}. How can I help?`,
        isBusinessAgent,
        ...videoPresenter,
      });
      res.status(201).json({
        id,
        name,
        role,
        archetype: resolveAgentRoleArchetype(role),
        channels: ["voice"],
        voiceId,
        isBusinessAgent,
      });
    } catch (err) {
      log.error("POST /api/mobile/agents failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to create agent.");
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

// ── GET /api/mobile/agents/:id/config — native setup adapter ──────────────
router.get(
  "/api/mobile/agents/:id/config",
  authenticateUser,
  mobileRateLimiter,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await ownedAgent(req.params.id, req.user.id))) {
        throw AppError.fromHttpStatus(404, "Agent not found.");
      }
      const [agentRows, personalities, directives, knowledge] = await Promise.all([
        drizzle
          .select({
            name: schema.agents.name,
            role: schema.agents.role,
            archetype: schema.agents.archetype,
            enabledTools: schema.agents.enabledTools,
            voiceId: schema.agents.voiceId,
            voiceProvider: schema.agents.voiceProvider,
            isBusinessAgent: schema.agents.isBusinessAgent,
            videoPresenterProvider: schema.agents.videoPresenterProvider,
            videoPresenterAvatarId: schema.agents.videoPresenterAvatarId,
            videoPresenterConsentStatus: schema.agents.videoPresenterConsentStatus,
          })
          .from(schema.agents)
          .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)))
          .limit(1),
        drizzle
          .select({ content: schema.personality.content })
          .from(schema.personality)
          .where(
            and(
              eq(schema.personality.agentId, req.params.id),
              eq(schema.personality.userId, req.user.id),
            ),
          )
          .limit(1),
        drizzle
          .select()
          .from(schema.directives)
          .where(
            and(
              eq(schema.directives.agentId, req.params.id),
              eq(schema.directives.userId, req.user.id),
            ),
          )
          .orderBy(desc(schema.directives.priority)),
        drizzle
          .select()
          .from(schema.knowledge)
          .where(
            and(
              eq(schema.knowledge.agentId, req.params.id),
              eq(schema.knowledge.userId, req.user.id),
            ),
          )
          .orderBy(desc(schema.knowledge.createdAt)),
      ]);
      const record = agentRows[0];
      const identity = record
        ? resolveAgentVideoPresenter({
            id: req.params.id,
            name: record.name,
            role: record.role,
            isBusinessAgent: record.isBusinessAgent ?? false,
            videoPresenterProvider: record.videoPresenterProvider,
            videoPresenterAvatarId: record.videoPresenterAvatarId,
            videoPresenterConsentStatus: record.videoPresenterConsentStatus,
          })
        : null;
      res.json({
        role: record?.role || "customer_service",
        archetype: record?.archetype || "Assistant",
        enabledTools: normalizeEnabledTools(record?.enabledTools),
        personality: personalities[0]?.content || "",
        directives,
        knowledge,
        identity,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("GET /api/mobile/agents/:id/config failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to load agent setup.");
    }
  },
);

const mobileManualConfigSchema = z.object({
  type: z.enum(["personality", "directive", "knowledge", "flow"]),
  content: z.string().min(1).max(12000),
});

router.post(
  "/api/mobile/agents/:id/config/manual",
  authenticateUser,
  mobileSensitiveRateLimiter,
  validate({ body: mobileManualConfigSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await ownedAgent(req.params.id, req.user.id))) {
        throw AppError.fromHttpStatus(404, "Agent not found.");
      }
      const type = req.body.type as "personality" | "directive" | "knowledge" | "flow";
      const content = cleanText(req.body.content, 12000);
      if (type === "personality") {
        await drizzle
          .insert(schema.personality)
          .values({ agentId: req.params.id, userId: req.user.id, content })
          .onConflictDoUpdate({
            target: schema.personality.agentId,
            set: { userId: req.user.id, content },
          });
      } else if (type === "directive") {
        await drizzle
          .insert(schema.directives)
          .values({ agentId: req.params.id, userId: req.user.id, content, priority: 5 });
      } else if (type === "knowledge") {
        await drizzle.insert(schema.knowledge).values({
          agentId: req.params.id,
          userId: req.user.id,
          content,
        });
      } else {
        await drizzle
          .update(schema.agents)
          .set({ flowConfig: content })
          .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)));
      }
      res.json({ success: true });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("POST /api/mobile/agents/:id/config/manual failed", {
        error: getErrorMessage(err),
      });
      throw AppError.fromHttpStatus(500, "Failed to save agent setup.");
    }
  },
);

const mobileToolsSchema = z.object({ enabled_tools: z.array(z.string()).default([]) });

router.post(
  "/api/mobile/agents/:id/tools",
  authenticateUser,
  mobileSensitiveRateLimiter,
  validate({ body: mobileToolsSchema }),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!(await ownedAgent(req.params.id, req.user.id))) {
        throw AppError.fromHttpStatus(404, "Agent not found.");
      }
      const raw = req.body.enabled_tools as string[];
      if (raw.some((tool) => !isAgentToolName(tool))) {
        throw AppError.fromHttpStatus(400, "enabled_tools must contain known agent tools");
      }
      const enabledTools = normalizeEnabledTools(raw as AgentToolName[]);
      await drizzle
        .update(schema.agents)
        .set({ enabledTools })
        .where(and(eq(schema.agents.id, req.params.id), eq(schema.agents.userId, req.user.id)));
      res.json({ success: true, enabledTools });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("POST /api/mobile/agents/:id/tools failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to update agent tools.");
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
  callPurpose: z.enum(OUTBOUND_CALL_PURPOSES),
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
      const {
        agentId,
        customerName,
        customerNumber,
        context,
        callPurpose,
        hasExpressWrittenConsent,
      } = req.body;
      const expressConsent = normalizedExpressConsent({ callPurpose, hasExpressWrittenConsent });

      if (isMarketingCallPurpose(callPurpose)) {
        const federalGate = assertFederalDncForMarketing();
        if (!federalGate.allowed) {
          const complianceBlock = outboundComplianceBlock("FEDERAL_DNC_NOT_CONFIGURED");
          return res.status(503).json({
            code: federalGate.code,
            error: federalGate.message,
            compliance: buildOutboundComplianceStatus(),
            blocked_call: complianceBlock,
          });
        }
      }

      if (await isDncBlocked(req.user.id, customerNumber)) {
        log.warn("Mobile outbound dial blocked by DNC list", { customerNumber });
        const complianceBlock = outboundComplianceBlock("TENANT_DNC_BLOCKED");
        return res.status(403).json({
          code: "FORBIDDEN",
          error: "This number is on the Do Not Call list and cannot be dialed.",
          dncBlocked: true,
          compliance: buildOutboundComplianceStatus(),
          blocked_call: complianceBlock,
        });
      }

      const isFederalDnc = await isFederalDncListed(customerNumber);
      const tcpaDecision = evaluateOutboundConsent({
        phone: customerNumber,
        is_internal_dnc: false,
        is_federal_dnc: isFederalDnc,
        is_marketing_call: isMarketingCallPurpose(callPurpose),
        has_express_written_consent: expressConsent,
      });
      if (!tcpaDecision.allowed) {
        log.warn("Mobile outbound dial blocked by TCPA consent gate", {
          customerNumber,
          abort_reason: tcpaDecision.abort_reason,
        });
        const complianceBlock = outboundComplianceBlock(
          tcpaDecision.abort_reason === "dnc_federal"
            ? "FEDERAL_DNC_BLOCKED"
            : "EXPRESS_WRITTEN_CONSENT_REQUIRED",
        );
        return res.status(403).json({
          code: "FORBIDDEN",
          error: tcpaDecision.disclosure_script || "Call blocked by TCPA consent rules.",
          tcpaBlocked: true,
          tcpa: tcpaDecision,
          compliance: buildOutboundComplianceStatus(),
          blocked_call: complianceBlock,
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
        metadata: outboundConsentMetadata({
          callPurpose,
          hasExpressWrittenConsent,
          source: "mobile",
        }),
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
