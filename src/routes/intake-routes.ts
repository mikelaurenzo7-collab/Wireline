import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- inbound lead payloads are vendor-defined JSON envelopes. */
import express, { Request, Response } from "express";
import type { AuthenticatedRequest } from "../types/auth";
import { log, auditLogger, drizzle, tenantStore } from "../lib/server-context";
import { validateBody, createIntakeKeySchema, updateIntakeKeySchema } from "../lib/api-validation";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage, toJsonbSafe } from "../lib/server-utils";
import { dispatchWebhook } from "../lib/webhook-helpers";
import { rateLimit, distributedLimiterStatus } from "../lib/rate-limit";
import { runInBackground } from "../lib/background-work";
import { placeOutboundCall } from "../lib/vapi-client";
import { evaluateOutboundDialGate } from "../lib/outbound-dial-gate";

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
  const prefix = plaintext.slice(0, 12);
  const hash = await sha256Hex(plaintext);
  return { plaintext, prefix, hash };
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
  if (!provided || typeof provided !== "string" || !provided.startsWith(INTAKE_KEY_PREFIX))
    return null;
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

// Per-key distributed rate limit. Public endpoint, so a single noisy
// caller can't drain the Account Holder's Vapi spend or hammer Supabase.
// Rolling window: ≤ 60 requests per 60s per intake key.
const INTAKE_RATE_WINDOW_MS = 60_000;
const INTAKE_RATE_MAX = 60;

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
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error("Intake rate limiter failed", { keyId, error: getErrorMessage(err) });
    return {
      ok: false,
      status: 503,
      code: "RATE_LIMITER_UNAVAILABLE",
      error:
        "Distributed rate limiter is unavailable for intake traffic. Configure Upstash Redis or enable WIRELINE_ALLOW_INMEMORY_RATE_LIMIT for single-node deployments.",
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

async function processIntakeLead(
  key: IntakeKey,
  input: IntakeLeadInput,
  idemHeaderOverride?: string | null,
): Promise<IntakeLeadResult> {
  const customer_number = (input.customer_number || input.phone || input.phone_number || "")
    .toString()
    .trim();
  if (!customer_number) {
    return { ok: false, error: "customer_number (or phone) is required.", code: "MISSING_NUMBER" };
  }

  // Lenient E.164 validation: strip common separators then check for 7–20 digits
  // with an optional leading +. Intentionally not enforcing strict E.164 length
  // to accommodate pre-normalised numbers from account holders; rejects non-phone strings
  // (SQL injection attempts, etc.).
  const PHONE_RE = /^\+?[0-9]{7,20}$/;
  const phoneClean = customer_number.replace(/[\s\-().]/g, "");
  if (!PHONE_RE.test(phoneClean)) {
    return {
      ok: false,
      error: "customer_number must be a valid phone number (7–20 digits, optional leading +).",
      code: "INVALID_NUMBER",
    };
  }

  const customer_name = (input.customer_name || input.name || "").toString().slice(0, 200);
  const context = (input.context || input.message || "").toString().slice(0, 4000);
  let metadata: Record<string, unknown> | null = null;
  if (input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)) {
    const entries = Object.entries(input.metadata as Record<string, unknown>).slice(0, 50);
    metadata = Object.fromEntries(entries.map(([k, v]) => [String(k).slice(0, 100), v]));
  }
  const agent_id = input.agent_id || key.default_agent_id || null;
  const idemKey =
    idemHeaderOverride !== undefined ? idemHeaderOverride : input.idempotency_key || null;
  const idemKeyTrimmed = idemKey ? String(idemKey).trim().slice(0, 255) : null;

  if (idemKeyTrimmed) {
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
          eq(schema.outboundLeads.idempotencyKey, idemKeyTrimmed),
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
        agentId: agent_id,
        customerName: customer_name || null,
        customerNumber: customer_number,
        phoneNumber: customer_number,
        context: context || null,
        status: "Pending",
        source: "inbound",
        metadata: metadata as any,
        receivedAt: now,
        idempotencyKey: idemKeyTrimmed,
      })
      .returning({ id: schema.outboundLeads.id });
    insertedId = inserted.id;
  } catch (error: any) {
    if (idemKeyTrimmed && (error.code === "23505" || /duplicate key/i.test(error.message || ""))) {
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
            eq(schema.outboundLeads.idempotencyKey, idemKeyTrimmed),
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
    return { ok: false, error: error.message || "DB insert failed", code: "INSERT_FAILED" };
  }

  runInBackground("lead.received webhook dispatch", () =>
    dispatchWebhook(key.user_id, "lead.received", {
      lead_id: insertedId ? Number(insertedId) : undefined,
      customer_name: customer_name || null,
      customer_number,
      context: context || null,
      metadata,
      agent_id,
      intake_key: { id: key.id, name: key.name },
      auto_dial: !!key.auto_dial && !!agent_id,
      at: now.toISOString(),
    }),
  );

  let auto_dial_initiated = false;
  if (key.auto_dial && agent_id && insertedId) {
    auto_dial_initiated = true;
    runInBackground("intake auto-dial", async () => {
      try {
        const gate = await evaluateOutboundDialGate({
          userId: key.user_id,
          phone: customer_number,
          leadId: insertedId!,
          metadata: (metadata || {}) as Record<string, unknown>,
        });

        if (!gate.allowed) {
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

        const result = await placeOutboundCall({
          userId: key.user_id,
          agentId: agent_id,
          customerName: customer_name || null,
          customerNumber: customer_number,
          context: context || `Inbound lead via ${key.name}`,
        });
        if (result.ok) {
          await drizzle
            .update(schema.outboundLeads)
            .set({
              callId: result.callId,
              status: "Dialing",
              lastCalledAt: new Date(),
            })
            .where(eq(schema.outboundLeads.id, insertedId!));
        } else {
          await drizzle
            .update(schema.outboundLeads)
            .set({
              status: "AutoDialFailed",
              metadata: toJsonbSafe({
                ...(metadata || {}),
                auto_dial_error: result.error,
                auto_dial_status: result.status,
              }) as any,
            })
            .where(eq(schema.outboundLeads.id, insertedId!));
          log.warn("Auto-dial failed for lead", {
            leadId: String(insertedId),
            status: result.status,
            error: result.error,
          });
        }
      } catch (err: any) {
        await drizzle
          .update(schema.outboundLeads)
          .set({
            status: "AutoDialFailed",
            metadata: toJsonbSafe({
              ...(metadata || {}),
              auto_dial_error: getErrorMessage(err),
            }) as any,
          })
          .where(eq(schema.outboundLeads.id, insertedId!));
        log.warn("Auto-dial threw for lead", {
          leadId: String(insertedId),
          error: getErrorMessage(err),
        });
      }
    });
  }

  return {
    ok: true,
    lead_id: insertedId ? Number(insertedId) : undefined,
    idempotent_replay: false,
    auto_dial_initiated,
  };
}

// POST /lead — public, authenticated by X-Wireline-Key header
router.post("/lead", async (req: Request, res: Response) => {
  try {
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

    const idemHeader =
      (req.headers["idempotency-key"] as string | undefined)?.toString().trim() || null;
    const result = await tenantStore.run(key.user_id, () =>
      processIntakeLead(key, req.body || {}, idemHeader),
    );

    if (result.ok) {
      if (!result.idempotent_replay) {
        runInBackground("intake key use-count", () =>
          tenantStore.run(key.user_id, () =>
            drizzle
              .update(schema.intakeKeys)
              .set({
                lastUsedAt: new Date(),
                useCount: (key.use_count || 0) + 1,
              })
              .where(eq(schema.intakeKeys.id, key.id)),
          ),
        );
      }
      return res.json(result);
    }
    const status = result.code === "MISSING_NUMBER" ? 400 : 500;
    return res.status(status).json({ error: result.error, code: result.code });
  } catch (e: any) {
    if (e instanceof AppError) throw e;
    log.error("Intake lead failed", { error: e?.message || String(e) });
    throw AppError.fromHttpStatus(500, "Intake failed");
  }
});

// POST /leads — bulk intake, up to BULK_MAX leads per request
const INTAKE_BULK_MAX = 100;

router.post("/leads", async (req: Request, res: Response) => {
  try {
    const provided = req.headers["x-wireline-key"] as string | undefined;
    const key = await resolveIntakeKey(provided);
    if (!key) throw AppError.fromHttpStatus(401, "Invalid or missing X-Wireline-Key.");

    const leads = Array.isArray(req.body?.leads) ? req.body.leads : null;
    if (!leads || leads.length === 0) {
      return res
        .status(400)
        .json({ error: "leads must be a non-empty array.", code: "EMPTY_BATCH" });
    }
    if (leads.length > INTAKE_BULK_MAX) {
      return res.status(400).json({
        error: `Batch too large. Max ${INTAKE_BULK_MAX} leads per request.`,
        code: "BATCH_TOO_LARGE",
        max: INTAKE_BULK_MAX,
      });
    }

    const r = await checkIntakeRate(key.id, leads.length);
    if (isIntakeRateFailure(r)) {
      if (r.status === 429) {
        res.set("Retry-After", String(r.retry_after_s));
        return res.status(429).json({
          error: `Rate limit would be exceeded by this batch (${INTAKE_RATE_MAX}/min). Retry in ${r.retry_after_s}s.`,
          code: r.code,
          retry_after_s: r.retry_after_s,
          accepted_so_far: 0,
        });
      }
      return res.status(r.status).json({ error: r.error, code: r.code });
    }

    const results = await Promise.all(
      (leads as IntakeLeadInput[]).map((lead) =>
        tenantStore
          .run(key.user_id, () => processIntakeLead(key, lead))
          .catch(
            (err: unknown) =>
              ({
                ok: false,
                error: getErrorMessage(err),
                code: "PROCESS_FAILED",
              }) as IntakeLeadResult,
          ),
      ),
    );

    const successes = results.filter((r) => r.ok).length;
    if (successes > 0) {
      runInBackground("intake key bulk use-count", () =>
        tenantStore.run(key.user_id, () =>
          drizzle
            .update(schema.intakeKeys)
            .set({
              lastUsedAt: new Date(),
              useCount: (key.use_count || 0) + successes,
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
  } catch (e: any) {
    if (e instanceof AppError) throw e;
    log.error("Bulk intake failed", { error: e?.message || String(e) });
    throw AppError.fromHttpStatus(500, "Bulk intake failed");
  }
});

// GET /keys — list intake keys for the authenticated user
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
  } catch (e: any) {
    log.error("Failed to load keys", { error: getErrorMessage(e) });
    throw AppError.fromHttpStatus(500, "Failed to load keys");
  }
});

// POST /keys — create a new intake key
router.post(
  "/keys",
  authenticateUser,
  validateBody(createIntakeKeySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const name = (req.body?.name || "").toString().trim();
      const default_agent_id = req.body?.default_agent_id || null;
      const auto_dial = !!req.body?.auto_dial;

      const { plaintext, prefix, hash } = await generateIntakeKey();
      const [data] = await drizzle
        .insert(schema.intakeKeys)
        .values({
          userId: req.user.id,
          name: name.slice(0, 80),
          keyPrefix: prefix,
          keyHash: hash,
          defaultAgentId: default_agent_id,
          autoDial: auto_dial,
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
    } catch (e: any) {
      log.error("Failed to create key", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to create key");
    }
  },
);

// PATCH /keys/:id — update an intake key
router.patch(
  "/keys/:id",
  authenticateUser,
  validateBody(updateIntakeKeySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const patch: any = {};
      if (req.body?.name !== undefined) patch.name = String(req.body.name).slice(0, 80);
      if (req.body?.active !== undefined) patch.active = !!req.body.active;
      if (req.body?.default_agent_id !== undefined)
        patch.defaultAgentId = req.body.default_agent_id || null;
      if (req.body?.auto_dial !== undefined) patch.autoDial = !!req.body.auto_dial;
      if (Object.keys(patch).length === 0)
        throw AppError.fromHttpStatus(400, "Provide at least one field to update.");

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
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      log.error("Failed to update key", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to update key");
    }
  },
);

// DELETE /keys/:id — delete an intake key
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
  } catch (e: any) {
    log.error("Failed to delete key", { error: getErrorMessage(e) });
    throw AppError.fromHttpStatus(500, "Failed to delete key");
  }
});

export default router;
