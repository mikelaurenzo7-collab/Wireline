import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- inbound lead payloads are vendor-defined JSON envelopes. */
import express, { Request, Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import {
  createIntakeKeySchema,
  updateIntakeKeySchema,
  validateBody,
} from "../lib/api-validation";
import { runInBackground } from "../lib/background-work";
import { CALLBACK_REQUEST_MARKER } from "../lib/callback-engine";
import { evaluateOutboundDialGate } from "../lib/outbound-dial-gate";
import { distributedLimiterStatus, rateLimit } from "../lib/rate-limit";
import { auditLogger, drizzle, log, tenantStore } from "../lib/server-context";
import { getErrorMessage, toJsonbSafe } from "../lib/server-utils";
import { placeOutboundCall } from "../lib/voice/outbound-call-service";
import { assertOutboundVoiceAllowed } from "../lib/voice-spend-control";
import { dispatchWebhook } from "../lib/webhook-helpers";
import type { AuthenticatedRequest } from "../types/auth";

const router = express.Router();
const INTAKE_KEY_PREFIX = "wlk_";

async function sha256Hex(value: string): Promise<string> {
  const crypto = await import("node:crypto");
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function generateIntakeKey(): Promise<{ plaintext: string; prefix: string; hash: string }> {
  const crypto = await import("node:crypto");
  const raw = crypto
    .randomBytes(32)
    .toString("base64")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 36);
  const plaintext = `${INTAKE_KEY_PREFIX}${raw}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 12),
    hash: await sha256Hex(plaintext),
  };
}

interface IntakeKey {
  id: string;
  user_id: string;
  name: string;
  default_agent_id: string | null;
  active: boolean;
  use_count: number;
  auto_dial: boolean;
}

async function resolveIntakeKey(provided: string | undefined): Promise<IntakeKey | null> {
  if (!provided || typeof provided !== "string" || !provided.startsWith(INTAKE_KEY_PREFIX)) {
    return null;
  }
  const hash = await sha256Hex(provided.trim());
  const [data] = await drizzle
    .select({
      id: schema.intakeKeys.id,
      user_id: schema.intakeKeys.userId,
      name: schema.intakeKeys.name,
      default_agent_id: schema.intakeKeys.defaultAgentId,
      active: schema.intakeKeys.active,
      use_count: schema.intakeKeys.useCount,
      auto_dial: schema.intakeKeys.autoDial,
    })
    .from(schema.intakeKeys)
    .where(eq(schema.intakeKeys.keyHash, hash))
    .limit(1);

  if (!data || !data.active) return null;
  return data as any;
}

const INTAKE_RATE_WINDOW_MS = 60_000;
const INTAKE_RATE_MAX = 60;
const INTAKE_PREAUTH_RATE_MAX = 120;

type IntakeRateCheck =
  | { ok: true }
  | { ok: false; status: 429; retry_after_s: number; code: "INTAKE_RATE_LIMIT"; error: string }
  | { ok: false; status: 503; code: "RATE_LIMITER_UNAVAILABLE"; error: string };

function isIntakeRateFailure(
  result: IntakeRateCheck,
): result is Exclude<IntakeRateCheck, { ok: true }> {
  return !result.ok;
}

async function checkIntakeRate(keyId: string, cost = 1): Promise<IntakeRateCheck> {
  const limiter = distributedLimiterStatus();
  if (!limiter.ok) {
    return {
      ok: false,
      status: 503,
      code: "RATE_LIMITER_UNAVAILABLE",
      error: limiter.reason || "Distributed rate limiter is unavailable.",
    };
  }

  try {
    const result = await rateLimit(keyId, {
      bucket: "public_intake",
      windowMs: INTAKE_RATE_WINDOW_MS,
      max: INTAKE_RATE_MAX,
      cost,
      failClosedOnError: true,
    });
    if (result.allowed) return { ok: true };
    const retryAfter = Math.max(1, Math.ceil(result.resetMs / 1000));
    return {
      ok: false,
      status: 429,
      retry_after_s: retryAfter,
      code: "INTAKE_RATE_LIMIT",
      error: `Rate limit exceeded for this intake key (${INTAKE_RATE_MAX}/min). Retry in ${retryAfter}s.`,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.error("Intake rate limiter failed", { keyId, error: getErrorMessage(error) });
    return {
      ok: false,
      status: 503,
      code: "RATE_LIMITER_UNAVAILABLE",
      error:
        "Distributed rate limiter is unavailable for intake traffic. Configure Upstash Redis or enable WIRELINE_ALLOW_INMEMORY_RATE_LIMIT for single-node deployments.",
    };
  }
}

async function checkIntakePreAuthRate(req: Request): Promise<IntakeRateCheck> {
  const limiter = distributedLimiterStatus();
  if (!limiter.ok) {
    return {
      ok: false,
      status: 503,
      code: "RATE_LIMITER_UNAVAILABLE",
      error: limiter.reason || "Distributed rate limiter is unavailable.",
    };
  }

  const clientKey = req.ip || req.socket.remoteAddress || "unknown";
  try {
    const result = await rateLimit(clientKey, {
      bucket: "public_intake_pre_auth",
      windowMs: INTAKE_RATE_WINDOW_MS,
      max: INTAKE_PREAUTH_RATE_MAX,
      failClosedOnError: true,
    });
    if (result.allowed) return { ok: true };
    const retryAfter = Math.max(1, Math.ceil(result.resetMs / 1000));
    return {
      ok: false,
      status: 429,
      retry_after_s: retryAfter,
      code: "INTAKE_RATE_LIMIT",
      error: `Too many intake requests from this client. Retry in ${retryAfter}s.`,
    };
  } catch (error) {
    log.error("Intake pre-auth rate limiter failed", { error: getErrorMessage(error) });
    return {
      ok: false,
      status: 503,
      code: "RATE_LIMITER_UNAVAILABLE",
      error: "Distributed rate limiter is unavailable for intake traffic.",
    };
  }
}

type IntakeLeadInput = {
  customer_number?: string;
  phone?: string;
  phone_number?: string;
  customer_name?: string;
  name?: string;
  context?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  agent_id?: string;
  idempotency_key?: string;
};

type IntakeLeadResult = {
  ok: boolean;
  lead_id?: number;
  status?: string;
  call_id?: string | null;
  idempotent_replay?: boolean;
  auto_dial_initiated?: boolean;
  error?: string;
  code?: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function writeAutoDialFailure(input: {
  leadId: bigint;
  userId: string;
  status: string;
  error: string;
  providerStatus?: number;
  doNotRetry?: boolean;
}) {
  await drizzle.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`xai-outbound:${String(input.leadId)}`}))`,
    );
    const [lead] = await tx
      .select({ metadata: schema.outboundLeads.metadata })
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.id, input.leadId),
          eq(schema.outboundLeads.userId, input.userId),
        ),
      )
      .limit(1);
    const metadata = record(lead?.metadata);
    const nativeVoice = record(metadata.native_voice);
    await tx
      .update(schema.outboundLeads)
      .set({
        status: input.status,
        metadata: toJsonbSafe({
          ...metadata,
          native_voice: {
            ...nativeVoice,
            ...(input.doNotRetry ? { do_not_retry: true } : {}),
          },
          auto_dial_error: input.error,
          auto_dial_status: input.providerStatus ?? "internal_error",
          auto_dial_do_not_retry: input.doNotRetry === true,
        }) as any,
      })
      .where(
        and(
          eq(schema.outboundLeads.id, input.leadId),
          eq(schema.outboundLeads.userId, input.userId),
        ),
      );
  });
}

async function processIntakeLead(
  key: IntakeKey,
  input: IntakeLeadInput,
  idemHeaderOverride?: string | null,
): Promise<IntakeLeadResult> {
  const customerNumber = (input.customer_number || input.phone || input.phone_number || "")
    .toString()
    .trim();
  if (!customerNumber) {
    return { ok: false, error: "customer_number (or phone) is required.", code: "MISSING_NUMBER" };
  }

  const phoneClean = customerNumber.replace(/[\s\-().]/g, "");
  if (!/^\+?[0-9]{7,20}$/.test(phoneClean)) {
    return {
      ok: false,
      error: "customer_number must be a valid phone number (7 to 20 digits, optional leading +).",
      code: "INVALID_NUMBER",
    };
  }

  const customerName = (input.customer_name || input.name || "").toString().slice(0, 200);
  const context = (input.context || input.message || "").toString().slice(0, 4000);
  let metadata: Record<string, unknown> | null = null;
  if (input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)) {
    const entries = Object.entries(input.metadata as Record<string, unknown>)
      .filter(([keyName]) => keyName !== CALLBACK_REQUEST_MARKER)
      .slice(0, 50);
    metadata = Object.fromEntries(
      entries.map(([keyName, value]) => [String(keyName).slice(0, 100), value]),
    );
  }
  const agentId = input.agent_id || key.default_agent_id || null;
  const idempotencyKey =
    idemHeaderOverride !== undefined ? idemHeaderOverride : input.idempotency_key || null;
  const idempotencyKeyTrimmed = idempotencyKey
    ? String(idempotencyKey).trim().slice(0, 255)
    : null;

  if (idempotencyKeyTrimmed) {
    const [existing] = await drizzle
      .select({
        id: schema.outboundLeads.id,
        callId: schema.outboundLeads.callId,
        status: schema.outboundLeads.status,
      })
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.userId, key.user_id),
          eq(schema.outboundLeads.idempotencyKey, idempotencyKeyTrimmed),
        ),
      )
      .limit(1);
    if (existing) {
      return {
        ok: true,
        lead_id: Number(existing.id),
        idempotent_replay: true,
        status: existing.status ?? undefined,
        call_id: existing.callId,
        auto_dial_initiated: false,
      };
    }
  }

  const now = new Date();
  let insertedId: bigint | undefined;
  try {
    const [inserted] = await drizzle
      .insert(schema.outboundLeads)
      .values({
        userId: key.user_id,
        agentId,
        customerName: customerName || null,
        customerNumber,
        phoneNumber: customerNumber,
        context: context || null,
        status: "Pending",
        source: "inbound",
        metadata: metadata as any,
        receivedAt: now,
        idempotencyKey: idempotencyKeyTrimmed,
      })
      .returning({ id: schema.outboundLeads.id });
    insertedId = inserted.id;
  } catch (error: any) {
    if (
      idempotencyKeyTrimmed &&
      (error.code === "23505" || /duplicate key/i.test(error.message || ""))
    ) {
      const [replay] = await drizzle
        .select({
          id: schema.outboundLeads.id,
          callId: schema.outboundLeads.callId,
          status: schema.outboundLeads.status,
        })
        .from(schema.outboundLeads)
        .where(
          and(
            eq(schema.outboundLeads.userId, key.user_id),
            eq(schema.outboundLeads.idempotencyKey, idempotencyKeyTrimmed),
          ),
        )
        .limit(1);
      if (replay) {
        return {
          ok: true,
          lead_id: Number(replay.id),
          idempotent_replay: true,
          status: replay.status ?? undefined,
          call_id: replay.callId,
          auto_dial_initiated: false,
        };
      }
    }
    log.error("intake lead insert failed", { error: error?.message || String(error) });
    return { ok: false, error: "Could not store the lead. Try again.", code: "INSERT_FAILED" };
  }

  runInBackground("lead.received webhook dispatch", () =>
    dispatchWebhook(key.user_id, "lead.received", {
      lead_id: insertedId ? Number(insertedId) : undefined,
      customer_name: customerName || null,
      customer_number: customerNumber,
      context: context || null,
      metadata,
      agent_id: agentId,
      intake_key: { id: key.id, name: key.name },
      auto_dial: !!key.auto_dial && !!agentId,
      at: now.toISOString(),
    }),
  );

  let autoDialInitiated = false;
  if (key.auto_dial && agentId && insertedId) {
    autoDialInitiated = true;
    runInBackground("intake auto-dial", async () => {
      try {
        const gate = await evaluateOutboundDialGate({
          userId: key.user_id,
          phone: customerNumber,
          leadId: insertedId!,
          metadata: (metadata || {}) as Record<string, unknown>,
        });

        if (!gate.allowed) {
          if (gate.reason === "outside_permitted_calling_hours") {
            await drizzle
              .update(schema.outboundLeads)
              .set({
                callbackScheduledAt: new Date(Date.now() + 60 * 60 * 1000),
                metadata: toJsonbSafe({
                  ...((gate.metadataPatch || metadata || {}) as Record<string, unknown>),
                  auto_dial_status: "deferred_quiet_hours",
                }) as any,
              })
              .where(eq(schema.outboundLeads.id, insertedId!));
            log.info("Auto-dial deferred to next permitted window", {
              leadId: String(insertedId),
            });
            return;
          }
          await drizzle
            .update(schema.outboundLeads)
            .set({
              status: gate.status,
              metadata: toJsonbSafe(gate.metadataPatch || metadata || {}) as any,
            })
            .where(eq(schema.outboundLeads.id, insertedId!));
          log.warn("Auto-dial blocked by outbound gate", {
            leadId: String(insertedId),
            reason: gate.reason,
            status: gate.status,
          });
          return;
        }

        try {
          await assertOutboundVoiceAllowed({
            userId: key.user_id,
            source: "automation",
            units: 0,
          });
        } catch (spendError) {
          await writeAutoDialFailure({
            leadId: insertedId!,
            userId: key.user_id,
            status: "AutoDialFailed",
            error:
              spendError instanceof Error ? spendError.message : "voice spend controls blocked",
          });
          log.warn("Auto-dial blocked by voice spend controls", {
            leadId: String(insertedId),
            error: spendError instanceof Error ? spendError.message : String(spendError),
          });
          return;
        }

        const result = await placeOutboundCall({
          userId: key.user_id,
          agentId,
          customerName: customerName || null,
          customerNumber,
          context: context || `Inbound lead via ${key.name}`,
          callPurpose: "marketing_or_sales",
          leadId: insertedId,
        });
        if (result.ok && result.callId) {
          await drizzle
            .update(schema.outboundLeads)
            .set({
              callId: result.callId,
              status: "Dialing",
              lastCalledAt: new Date(),
            })
            .where(eq(schema.outboundLeads.id, insertedId!));
          return;
        }

        const doNotRetry =
          result.doNotRetry === true ||
          result.providerOutcomeAmbiguous === true ||
          (result.ok && !result.callId);
        await writeAutoDialFailure({
          leadId: insertedId!,
          userId: key.user_id,
          status: doNotRetry ? "Error" : "AutoDialFailed",
          error: result.error || "Native voice placement did not return a call id.",
          providerStatus: result.status,
          doNotRetry,
        });
        log.warn("Auto-dial failed for lead", {
          leadId: String(insertedId),
          status: result.status,
          doNotRetry,
          error: result.error,
        });
      } catch (error: any) {
        await writeAutoDialFailure({
          leadId: insertedId!,
          userId: key.user_id,
          status: "AutoDialFailed",
          error: getErrorMessage(error),
        }).catch(() => {});
        log.warn("Auto-dial threw for lead", {
          leadId: String(insertedId),
          error: getErrorMessage(error),
        });
      }
    });
  }

  return {
    ok: true,
    lead_id: insertedId ? Number(insertedId) : undefined,
    idempotent_replay: false,
    auto_dial_initiated: autoDialInitiated,
  };
}

router.post("/lead", async (req: Request, res: Response) => {
  try {
    const preAuthRate = await checkIntakePreAuthRate(req);
    if (isIntakeRateFailure(preAuthRate)) {
      if (preAuthRate.status === 429) res.set("Retry-After", String(preAuthRate.retry_after_s));
      return res.status(preAuthRate.status).json({
        error: preAuthRate.error,
        code: preAuthRate.code,
        ...(preAuthRate.status === 429 ? { retry_after_s: preAuthRate.retry_after_s } : {}),
      });
    }
    const provided = req.headers["x-wireline-key"] as string | undefined;
    const key = await resolveIntakeKey(provided);
    if (!key) throw AppError.fromHttpStatus(401, "Invalid or missing X-Wireline-Key.");

    const rate = await checkIntakeRate(key.id);
    if (isIntakeRateFailure(rate)) {
      if (rate.status === 429) res.set("Retry-After", String(rate.retry_after_s));
      return res.status(rate.status).json({
        error: rate.error,
        code: rate.code,
        ...(rate.status === 429 ? { retry_after_s: rate.retry_after_s } : {}),
      });
    }

    const idempotencyHeader =
      (req.headers["idempotency-key"] as string | undefined)?.toString().trim() || null;
    const result = await tenantStore.run(key.user_id, () =>
      processIntakeLead(key, req.body || {}, idempotencyHeader),
    );

    if (result.ok) {
      if (!result.idempotent_replay) {
        runInBackground("intake key use-count", () =>
          tenantStore.run(key.user_id, () =>
            drizzle
              .update(schema.intakeKeys)
              .set({
                lastUsedAt: new Date(),
                useCount: sql`COALESCE(${schema.intakeKeys.useCount}, 0) + 1`,
              })
              .where(eq(schema.intakeKeys.id, key.id)),
          ),
        );
      }
      return res.json(result);
    }
    const clientErrorCodes = ["MISSING_NUMBER", "INVALID_NUMBER"];
    const status = clientErrorCodes.includes(result.code ?? "") ? 400 : 500;
    return res.status(status).json({ error: result.error, code: result.code });
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    log.error("Intake lead failed", { error: error?.message || String(error) });
    throw AppError.fromHttpStatus(500, "Intake failed");
  }
});

const INTAKE_BULK_MAX = 100;

router.post("/leads", async (req: Request, res: Response) => {
  try {
    const preAuthRate = await checkIntakePreAuthRate(req);
    if (isIntakeRateFailure(preAuthRate)) {
      if (preAuthRate.status === 429) res.set("Retry-After", String(preAuthRate.retry_after_s));
      return res.status(preAuthRate.status).json({
        error: preAuthRate.error,
        code: preAuthRate.code,
        ...(preAuthRate.status === 429 ? { retry_after_s: preAuthRate.retry_after_s } : {}),
      });
    }
    const provided = req.headers["x-wireline-key"] as string | undefined;
    const key = await resolveIntakeKey(provided);
    if (!key) throw AppError.fromHttpStatus(401, "Invalid or missing X-Wireline-Key.");

    const leads = Array.isArray(req.body?.leads) ? req.body.leads : null;
    if (!leads || leads.length === 0) {
      return res.status(400).json({
        error: "leads must be a non-empty array.",
        code: "EMPTY_BATCH",
      });
    }
    if (leads.length > INTAKE_BULK_MAX) {
      return res.status(400).json({
        error: `Batch too large. Max ${INTAKE_BULK_MAX} leads per request.`,
        code: "BATCH_TOO_LARGE",
        max: INTAKE_BULK_MAX,
      });
    }

    const rate = await checkIntakeRate(key.id, leads.length);
    if (isIntakeRateFailure(rate)) {
      if (rate.status === 429) {
        res.set("Retry-After", String(rate.retry_after_s));
        return res.status(429).json({
          error: `Rate limit would be exceeded by this batch (${INTAKE_RATE_MAX}/min). Retry in ${rate.retry_after_s}s.`,
          code: rate.code,
          retry_after_s: rate.retry_after_s,
          accepted_so_far: 0,
        });
      }
      return res.status(rate.status).json({ error: rate.error, code: rate.code });
    }

    const results = await Promise.all(
      (leads as IntakeLeadInput[]).map((lead) =>
        tenantStore
          .run(key.user_id, () => processIntakeLead(key, lead))
          .catch(
            (error: unknown) =>
              ({
                ok: false,
                error: getErrorMessage(error),
                code: "PROCESS_FAILED",
              }) as IntakeLeadResult,
          ),
      ),
    );

    const successes = results.filter((result) => result.ok).length;
    if (successes > 0) {
      runInBackground("intake key bulk use-count", () =>
        tenantStore.run(key.user_id, () =>
          drizzle
            .update(schema.intakeKeys)
            .set({
              lastUsedAt: new Date(),
              useCount: sql`COALESCE(${schema.intakeKeys.useCount}, 0) + ${successes}`,
            })
            .where(eq(schema.intakeKeys.id, key.id)),
        ),
      );
    }

    res.json({
      ok: true,
      count: leads.length,
      success_count: successes,
      failure_count: leads.length - successes,
      results,
    });
  } catch (error: any) {
    if (error instanceof AppError) throw error;
    log.error("Bulk intake failed", { error: error?.message || String(error) });
    throw AppError.fromHttpStatus(500, "Bulk intake failed");
  }
});

router.get("/keys", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await drizzle
      .select({
        id: schema.intakeKeys.id,
        name: schema.intakeKeys.name,
        key_prefix: schema.intakeKeys.keyPrefix,
        default_agent_id: schema.intakeKeys.defaultAgentId,
        auto_dial: schema.intakeKeys.autoDial,
        active: schema.intakeKeys.active,
        last_used_at: schema.intakeKeys.lastUsedAt,
        use_count: schema.intakeKeys.useCount,
        created_at: schema.intakeKeys.createdAt,
      })
      .from(schema.intakeKeys)
      .where(eq(schema.intakeKeys.userId, req.user.id))
      .orderBy(desc(schema.intakeKeys.createdAt));
    res.json({ keys: data || [] });
  } catch (error: any) {
    log.error("Failed to load keys", { error: getErrorMessage(error) });
    throw AppError.fromHttpStatus(500, "Failed to load keys");
  }
});

router.post(
  "/keys",
  authenticateUser,
  validateBody(createIntakeKeySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = (req.body?.name || "").toString().trim();
      const defaultAgentId = req.body?.default_agent_id || null;
      const autoDial = !!req.body?.auto_dial;

      const { plaintext, prefix, hash } = await generateIntakeKey();
      const [data] = await drizzle
        .insert(schema.intakeKeys)
        .values({
          userId: req.user.id,
          name: name.slice(0, 80),
          keyPrefix: prefix,
          keyHash: hash,
          defaultAgentId,
          autoDial,
          active: true,
        })
        .returning({
          id: schema.intakeKeys.id,
          name: schema.intakeKeys.name,
          key_prefix: schema.intakeKeys.keyPrefix,
          default_agent_id: schema.intakeKeys.defaultAgentId,
          auto_dial: schema.intakeKeys.autoDial,
          active: schema.intakeKeys.active,
          created_at: schema.intakeKeys.createdAt,
        });

      void auditLogger
        .logIntakeKey("created", {
          userId: req.user.id,
          keyId: data.id,
          keyPrefix: data.key_prefix,
          keyName: data.name,
          ip: req.ip,
        })
        .catch(() => {});
      res.json({ key: data, plaintext });
    } catch (error: any) {
      log.error("Failed to create key", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to create key");
    }
  },
);

router.patch(
  "/keys/:id",
  authenticateUser,
  validateBody(updateIntakeKeySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const patch: any = {};
      if (req.body?.name !== undefined) patch.name = String(req.body.name).slice(0, 80);
      if (req.body?.active !== undefined) patch.active = !!req.body.active;
      if (req.body?.default_agent_id !== undefined) {
        patch.defaultAgentId = req.body.default_agent_id || null;
      }
      if (req.body?.auto_dial !== undefined) patch.autoDial = !!req.body.auto_dial;
      if (Object.keys(patch).length === 0) {
        throw AppError.fromHttpStatus(400, "Provide at least one field to update.");
      }

      const [data] = await drizzle
        .update(schema.intakeKeys)
        .set(patch)
        .where(
          and(eq(schema.intakeKeys.id, req.params.id), eq(schema.intakeKeys.userId, req.user.id)),
        )
        .returning({
          id: schema.intakeKeys.id,
          name: schema.intakeKeys.name,
          key_prefix: schema.intakeKeys.keyPrefix,
          default_agent_id: schema.intakeKeys.defaultAgentId,
          auto_dial: schema.intakeKeys.autoDial,
          active: schema.intakeKeys.active,
          last_used_at: schema.intakeKeys.lastUsedAt,
          use_count: schema.intakeKeys.useCount,
          created_at: schema.intakeKeys.createdAt,
        });

      if (!data) throw AppError.fromHttpStatus(404, "Intake key not found.");
      void auditLogger
        .logIntakeKey("updated", {
          userId: req.user.id,
          keyId: data.id,
          keyPrefix: data.key_prefix,
          keyName: data.name,
          ip: req.ip,
        })
        .catch(() => {});
      res.json({ key: data });
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      log.error("Failed to update key", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to update key");
    }
  },
);

router.delete("/keys/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await drizzle
      .delete(schema.intakeKeys)
      .where(
        and(eq(schema.intakeKeys.id, req.params.id), eq(schema.intakeKeys.userId, req.user.id)),
      );

    void auditLogger
      .logIntakeKey("deleted", {
        userId: req.user.id,
        keyId: req.params.id,
        ip: req.ip,
      })
      .catch(() => {});
    res.json({ success: true });
  } catch (error: any) {
    log.error("Failed to delete key", { error: getErrorMessage(error) });
    throw AppError.fromHttpStatus(500, "Failed to delete key");
  }
});

export default router;
