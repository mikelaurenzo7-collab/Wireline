/* eslint-disable @typescript-eslint/no-explicit-any -- API response shapes vary by endpoint and aren't shared as client types yet. */
/**
 * SMS Inbox API — list threads, fetch messages, send replies.
 *
 * Backs the SmsThreads UI in /inbox. Per-tenant scoped; every query
 * filters on req.user.id. Sending replies reuses sendTenantMessage so
 * the same Twilio config + opt-out compliance applies.
 */

import { Router, Response } from "express";
import { createHash } from "node:crypto";
import { AppError, rethrowIfAppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { validateBody, smsReplySchema } from "../lib/api-validation";
import { smsRateLimit } from "../middleware/api-rate-limits";
import { withAudit } from "../middleware/audit-middleware";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { enforceSpendCap } from "../lib/spend-guards";
import { evaluateSmsThreadReplyGate } from "../lib/sms-reply-compliance";
import {
  ACCOUNT_ENVIRONMENT_UNAVAILABLE,
  assertExternalEntityActionAllowed,
  assertLiveExternalActionAllowed,
} from "../lib/account-environment-policy";
import {
  refundReservedTenantMessageAttempt,
  sendTenantMessage,
  SmsProviderAttemptAlreadyClaimedError,
} from "../lib/twilio-service";
import { AgentTextReplyReviewRequiredError, generateAgentTextReply } from "../lib/agent-text-reply";
import { isRuntimeAvailable } from "../lib/ai-client";
import { customerSafeSmsFailureReason } from "../lib/sms-customer-errors";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

type SmsSendOperation = {
  id: string;
  requestHash: string;
  status: string;
  providerSid: string | null;
  providerStatus: string | null;
  failureCode: string | null;
};

const SMS_PRE_PROVIDER_REFUND_UNCONFIRMED = "SMS_PRE_PROVIDER_REFUND_UNCONFIRMED";

function smsReplyOperationKey(req: AuthenticatedRequest): string {
  const supplied = String(req.get("Idempotency-Key") || "").trim();
  if (!supplied) {
    throw new AppError(
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "SMS replies require an Idempotency-Key so interrupted requests can be retried safely.",
    );
  }
  if (supplied.length > 200 || !/^[A-Za-z0-9._:/-]+$/.test(supplied)) {
    throw new AppError(400, "INVALID_IDEMPOTENCY_KEY", "The SMS send operation key is invalid.");
  }
  return supplied;
}

function smsReplyRequestHash(input: {
  threadId: string;
  customerNumber: string;
  destinationNumber: string;
  body: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify([input.threadId, input.customerNumber, input.destinationNumber, input.body]),
    )
    .digest("hex");
}

async function loadSmsSendOperation(
  userId: string,
  idempotencyKey: string,
): Promise<SmsSendOperation | null> {
  const [operation] = await drizzle
    .select({
      id: schema.smsSendOperations.id,
      requestHash: schema.smsSendOperations.requestHash,
      status: schema.smsSendOperations.status,
      providerSid: schema.smsSendOperations.providerSid,
      providerStatus: schema.smsSendOperations.providerStatus,
      failureCode: schema.smsSendOperations.failureCode,
    })
    .from(schema.smsSendOperations)
    .where(
      and(
        eq(schema.smsSendOperations.userId, userId),
        eq(schema.smsSendOperations.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return operation || null;
}

function assertSmsSendOperationMatchesRequest(
  operation: SmsSendOperation,
  requestHash: string,
): void {
  if (operation.requestHash !== requestHash) {
    throw new AppError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "This SMS operation key was already used for a different message.",
    );
  }
}

async function reserveSmsSendOperation(input: {
  userId: string;
  threadId: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<SmsSendOperation> {
  const [created] = await drizzle
    .insert(schema.smsSendOperations)
    .values({
      userId: input.userId,
      threadId: input.threadId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      status: "reserved",
    })
    .onConflictDoNothing()
    .returning({
      id: schema.smsSendOperations.id,
      requestHash: schema.smsSendOperations.requestHash,
      status: schema.smsSendOperations.status,
      providerSid: schema.smsSendOperations.providerSid,
      providerStatus: schema.smsSendOperations.providerStatus,
      failureCode: schema.smsSendOperations.failureCode,
    });
  const operation = created || (await loadSmsSendOperation(input.userId, input.idempotencyKey));
  if (!operation)
    throw new Error("SMS send operation could not be resolved after insert conflict.");
  assertSmsSendOperationMatchesRequest(operation, input.requestHash);
  return operation;
}

async function claimSmsProviderAttempt(userId: string, operationId: string): Promise<void> {
  const [claimed] = await drizzle
    .update(schema.smsSendOperations)
    .set({ status: "attempting", updatedAt: new Date() })
    .where(
      and(
        eq(schema.smsSendOperations.id, operationId),
        eq(schema.smsSendOperations.userId, userId),
        eq(schema.smsSendOperations.status, "reserved"),
      ),
    )
    .returning({ id: schema.smsSendOperations.id });
  if (!claimed) throw new SmsProviderAttemptAlreadyClaimedError();
}

async function claimSmsPreProviderAccountingHold(
  userId: string,
  operationId: string,
): Promise<boolean> {
  const [held] = await drizzle
    .update(schema.smsSendOperations)
    .set({
      status: "ambiguous",
      failureCode: SMS_PRE_PROVIDER_REFUND_UNCONFIRMED,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.smsSendOperations.id, operationId),
        eq(schema.smsSendOperations.userId, userId),
        eq(schema.smsSendOperations.status, "reserved"),
      ),
    )
    .returning({ id: schema.smsSendOperations.id });
  return Boolean(held?.id);
}

/**
 * Confirm the attempt-scoped Runtime Balance debit is neutralized before a
 * no-provider failure is advertised as safe to retry under a new operation.
 * The refund helper uses the persisted burn and an idempotent credit key, so a
 * replay can finish this after a transient ledger outage without over-crediting.
 */
async function settleSmsPreProviderAccountingHold(
  userId: string,
  operationId: string,
  idempotencyKey: string,
): Promise<boolean> {
  try {
    await refundReservedTenantMessageAttempt({
      userId,
      idempotencyKey,
      reservationAttempt: 1,
      channel: "sms",
    });
  } catch (error) {
    log.error("SMS pre-provider accounting hold remains unsettled", {
      userId,
      operationId,
      error: getErrorMessage(error),
    });
    return false;
  }

  const [settled] = await drizzle
    .update(schema.smsSendOperations)
    .set({
      status: "rejected",
      failureCode: "SMS_SEND_PRE_PROVIDER_FAILED",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.smsSendOperations.id, operationId),
        eq(schema.smsSendOperations.userId, userId),
        eq(schema.smsSendOperations.status, "ambiguous"),
        eq(schema.smsSendOperations.failureCode, SMS_PRE_PROVIDER_REFUND_UNCONFIRMED),
      ),
    )
    .returning({ id: schema.smsSendOperations.id });
  if (settled?.id) return true;

  const current = await loadSmsSendOperation(userId, idempotencyKey);
  return current?.status === "rejected";
}

function replaySmsSendOperation(operation: SmsSendOperation) {
  if (operation.status === "accepted") {
    return {
      ok: true,
      duplicate: true,
      sid: operation.providerSid,
      status: operation.providerStatus,
      reconciliation_pending: false,
    };
  }
  if (operation.status === "rejected") {
    return {
      ok: false,
      duplicate: true,
      code: operation.failureCode || "SMS_SEND_REJECTED",
      reason: "This send was definitively not accepted. Start a new send to retry.",
      provider_outcome_ambiguous: false,
      do_not_resend: false,
    };
  }
  if (operation.failureCode === SMS_PRE_PROVIDER_REFUND_UNCONFIRMED) {
    return {
      ok: false,
      duplicate: true,
      code: SMS_PRE_PROVIDER_REFUND_UNCONFIRMED,
      reason:
        "Twilio was not called, but this send's Runtime Balance refund is still being reconciled. Do not start a new send yet.",
      provider_outcome_ambiguous: false,
      do_not_resend: true,
    };
  }
  return {
    ok: false,
    duplicate: true,
    code: "SMS_SEND_ALREADY_ATTEMPTED",
    reason:
      "This send is already in progress or its carrier outcome is not yet conclusive. Do not resend it.",
    provider_outcome_ambiguous: true,
    do_not_resend: true,
  };
}

/**
 * Manual replies are authenticated, but authentication alone must never make
 * a demo/test workspace or inert showcase contact eligible for live carrier
 * work. Keep this admission check ahead of the shared compliance gate because
 * that gate may consult the Federal DNC service. Unknown classification
 * failures are mapped to the same stable, fail-closed response as a missing
 * account environment.
 */
async function assertSmsReplyExternalActionAllowed(userId: string, phone: string): Promise<void> {
  try {
    await assertLiveExternalActionAllowed(userId, "sms_thread_reply");
    await assertExternalEntityActionAllowed(userId, "sms_thread_reply", { phone });
  } catch (error) {
    if (error instanceof AppError) throw error;
    log.warn("SMS reply account environment or target could not be verified", {
      userId,
      error: getErrorMessage(error),
    });
    throw new AppError(
      503,
      ACCOUNT_ENVIRONMENT_UNAVAILABLE,
      "SMS replies are temporarily unavailable until this workspace can be verified.",
    );
  }
}

router.get(
  "/api/sms/threads",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const requestedAgentId =
        typeof req.query.agent_id === "string" ? req.query.agent_id.trim() : "";
      const where = requestedAgentId
        ? and(
            eq(schema.smsThreads.userId, req.user.id),
            eq(schema.smsThreads.agentId, requestedAgentId),
          )
        : eq(schema.smsThreads.userId, req.user.id);
      const threads = await drizzle
        .select()
        .from(schema.smsThreads)
        .where(where)
        .orderBy(desc(schema.smsThreads.lastMessageAt))
        .limit(200);
      res.json({ threads: mapObjectToSnake(threads || []) });
    } catch (e: any) {
      rethrowIfAppError(e);
      log.error("/api/sms/threads failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load SMS threads");
    }
  },
);

router.get(
  "/api/sms/threads/:id/messages",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const threadId = req.params.id;
      const [thread] = await drizzle
        .select({ id: schema.smsThreads.id })
        .from(schema.smsThreads)
        .where(and(eq(schema.smsThreads.id, threadId), eq(schema.smsThreads.userId, req.user.id)))
        .limit(1);
      if (!thread) throw AppError.fromHttpStatus(404, "Thread not found");

      const messages = await drizzle
        .select()
        .from(schema.smsMessages)
        .where(eq(schema.smsMessages.threadId, threadId))
        .orderBy(schema.smsMessages.createdAt);
      res.json({ messages: mapObjectToSnake(messages || []) });
    } catch (e: any) {
      rethrowIfAppError(e);
      log.error("/api/sms/threads/:id/messages failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load SMS messages");
    }
  },
);

router.post(
  "/api/sms/threads/:id/draft",
  authenticateUser,
  smsRateLimit,
  enforceSpendCap,
  withAudit("sms-reply-draft"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const threadId = req.params.id;
      const [thread] = await drizzle
        .select({
          id: schema.smsThreads.id,
          agentId: schema.smsThreads.agentId,
          destinationNumber: schema.smsThreads.destinationNumber,
          status: schema.smsThreads.status,
        })
        .from(schema.smsThreads)
        .where(and(eq(schema.smsThreads.id, threadId), eq(schema.smsThreads.userId, req.user.id)))
        .limit(1);
      if (!thread) throw AppError.fromHttpStatus(404, "Thread not found");
      if (thread.status === "routing_conflict") {
        throw new AppError(
          409,
          "SMS_THREAD_ROUTING_CONFLICT",
          "This conversation reached more than one Bot number, so its sending line cannot be determined safely.",
        );
      }
      if (!thread.agentId) {
        throw new AppError(
          409,
          "SMS_THREAD_UNASSIGNED",
          "This text conversation is not assigned to a Bot yet.",
        );
      }
      if (!thread.destinationNumber) {
        throw new AppError(
          409,
          "SMS_THREAD_DESTINATION_UNRESOLVED",
          "This legacy conversation has no verified Twilio sending line yet.",
        );
      }
      if (!isRuntimeAvailable()) throw AppError.fromHttpStatus(503, "AI runtime not configured");

      const recent = await drizzle
        .select({ direction: schema.smsMessages.direction, body: schema.smsMessages.body })
        .from(schema.smsMessages)
        .where(
          and(
            eq(schema.smsMessages.threadId, threadId),
            eq(schema.smsMessages.userId, req.user.id),
          ),
        )
        .orderBy(desc(schema.smsMessages.createdAt))
        .limit(12);
      const result = await generateAgentTextReply({
        userId: req.user.id,
        agentId: thread.agentId,
        messages: recent.reverse().map((message) => ({
          direction: message.direction === "out" ? "out" : "in",
          body: message.body,
        })),
      });

      res.json({
        reply: result.reply,
        requires_human: result.requiresHuman,
        reason: result.reason || null,
      });
    } catch (error) {
      if (error instanceof AgentTextReplyReviewRequiredError) {
        throw new AppError(409, "BOT_SETUP_REVIEW_REQUIRED", error.message);
      }
      rethrowIfAppError(error);
      log.error("SMS Bot reply draft failed", {
        userId: req.user.id,
        threadId: req.params.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Could not write a Bot reply.");
    }
  },
);

router.post(
  "/api/sms/threads/:id/reply",
  authenticateUser,
  smsRateLimit,
  enforceLaunchHardGate,
  validateBody(smsReplySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const threadId = req.params.id;
      const body = req.body.body.trim();

      const [thread] = await drizzle
        .select({
          id: schema.smsThreads.id,
          customerNumber: schema.smsThreads.customerNumber,
          destinationNumber: schema.smsThreads.destinationNumber,
          status: schema.smsThreads.status,
          agentId: schema.smsThreads.agentId,
        })
        .from(schema.smsThreads)
        .where(and(eq(schema.smsThreads.id, threadId), eq(schema.smsThreads.userId, req.user.id)))
        .limit(1);
      if (!thread) throw AppError.fromHttpStatus(404, "Thread not found");
      if (thread.status === "routing_conflict") {
        throw new AppError(
          409,
          "SMS_THREAD_ROUTING_CONFLICT",
          "This conversation reached more than one Bot number, so BotBound cannot choose a safe sending line.",
        );
      }
      if (!thread.destinationNumber) {
        throw new AppError(
          409,
          "SMS_THREAD_DESTINATION_UNRESOLVED",
          "This legacy conversation has no verified Twilio sending line, so BotBound will not guess a sender.",
        );
      }

      const idempotencyKey = smsReplyOperationKey(req);
      const requestHash = smsReplyRequestHash({
        threadId,
        customerNumber: thread.customerNumber!,
        destinationNumber: thread.destinationNumber,
        body,
      });
      const existingOperation = await loadSmsSendOperation(req.user.id, idempotencyKey);
      if (existingOperation) {
        assertSmsSendOperationMatchesRequest(existingOperation, requestHash);
        if (existingOperation.failureCode === SMS_PRE_PROVIDER_REFUND_UNCONFIRMED) {
          await settleSmsPreProviderAccountingHold(
            req.user.id,
            existingOperation.id,
            idempotencyKey,
          );
          const reconciled = await loadSmsSendOperation(req.user.id, idempotencyKey);
          res.json(replaySmsSendOperation(reconciled || existingOperation));
          return;
        }
        // Accepted, rejected, attempting, and ambiguous outcomes are immutable
        // for this operation. Replay them before mutable environment/DNC gates
        // so a lost HTTP response can never turn into a new provider send.
        if (existingOperation.status !== "reserved") {
          res.json(replaySmsSendOperation(existingOperation));
          return;
        }
      }

      await assertSmsReplyExternalActionAllowed(req.user.id, thread.customerNumber!);

      const gate = await evaluateSmsThreadReplyGate({
        userId: req.user.id,
        threadId,
        phone: thread.customerNumber!,
      });
      if (!gate.allowed) {
        if (gate.reason === "federal_dnc_unconfigured") {
          throw new AppError(
            503,
            gate.federalDncCode || "FEDERAL_DNC_UNCONFIGURED",
            gate.federalDncMessage ||
              "Screening has to clear this sales outreach before it goes out. Answering calls still works.",
          );
        }
        throw new AppError(
          403,
          "FORBIDDEN",
          gate.federalDncMessage || "Outbound SMS blocked by compliance policy for this number.",
          { reason: gate.reason },
        );
      }

      // A new operation is reserved only after every mutable launch,
      // environment, entitlement, and compliance gate has passed. A prior
      // `reserved` operation also reruns those gates before its first attempt.
      const operation = await reserveSmsSendOperation({
        userId: req.user.id,
        threadId,
        idempotencyKey,
        requestHash,
      });
      if (operation.status !== "reserved") {
        res.json(replaySmsSendOperation(operation));
        return;
      }

      let providerAttemptClaimed = false;
      let result: Awaited<ReturnType<typeof sendTenantMessage>>;
      try {
        result = await sendTenantMessage(req.user.id, {
          to: thread.customerNumber!,
          body,
          channel: "sms",
          fromNumber: thread.destinationNumber,
          idempotencyKey,
          reservationAttempt: 1,
          beforeProviderAttempt: async () => {
            await claimSmsProviderAttempt(req.user.id, operation.id);
            providerAttemptClaimed = true;
          },
        });
      } catch (error) {
        const current = await loadSmsSendOperation(req.user.id, idempotencyKey);
        if (!providerAttemptClaimed) {
          if (current && current.status !== "reserved") {
            res.json(replaySmsSendOperation(current));
            return;
          }
          const holdClaimed = await claimSmsPreProviderAccountingHold(req.user.id, operation.id);
          if (!holdClaimed) {
            const latest = await loadSmsSendOperation(req.user.id, idempotencyKey);
            if (latest) {
              res.json(replaySmsSendOperation(latest));
              return;
            }
            throw new Error("SMS pre-provider accounting hold could not be resolved.");
          }

          const settled = await settleSmsPreProviderAccountingHold(
            req.user.id,
            operation.id,
            idempotencyKey,
          );
          log.error("SMS reply failed before the carrier attempt", {
            userId: req.user.id,
            threadId,
            accountingSettled: settled,
            error: getErrorMessage(error),
          });
          if (!settled) {
            res.status(503).json({
              ok: false,
              code: SMS_PRE_PROVIDER_REFUND_UNCONFIRMED,
              reason:
                "Twilio was not called, but this send's Runtime Balance refund is still being reconciled. Do not start a new send yet.",
              provider_outcome_ambiguous: false,
              do_not_resend: true,
            });
            return;
          }
          res.status(503).json({
            ok: false,
            code: "SMS_SEND_PRE_PROVIDER_FAILED",
            reason: "The carrier was not called. You can safely try again.",
            provider_outcome_ambiguous: false,
            do_not_resend: false,
          });
          return;
        }

        await drizzle
          .update(schema.smsSendOperations)
          .set({
            status: "ambiguous",
            failureCode: "SMS_PROVIDER_OUTCOME_AMBIGUOUS",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.smsSendOperations.id, operation.id),
              eq(schema.smsSendOperations.userId, req.user.id),
            ),
          );
        log.error("SMS reply carrier attempt ended without a conclusive result", {
          userId: req.user.id,
          threadId,
          error: getErrorMessage(error),
        });
        res.json({
          ok: false,
          code: "SMS_PROVIDER_OUTCOME_AMBIGUOUS",
          reason: "The carrier outcome is unknown. Do not resend this message.",
          provider_outcome_ambiguous: true,
          do_not_resend: true,
        });
        return;
      }

      const operationStatus = result.ok
        ? "accepted"
        : result.providerOutcomeAmbiguous
          ? "ambiguous"
          : "rejected";
      await drizzle
        .update(schema.smsSendOperations)
        .set({
          status: operationStatus,
          providerSid: result.sid || null,
          providerStatus: result.status || null,
          failureCode: result.ok ? null : result.code || "SMS_SEND_REJECTED",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.smsSendOperations.id, operation.id),
            eq(schema.smsSendOperations.userId, req.user.id),
          ),
        );
      if (!result.ok) {
        log.warn("SMS reply was not accepted", {
          userId: req.user.id,
          configured: result.configured,
          enabled: result.enabled,
          code: result.code,
          providerReason: result.reason,
        });
        res.json({
          ok: false,
          reason: customerSafeSmsFailureReason(result),
          code: result.code,
          recovery_path: result.recovery_path,
          provider_outcome_ambiguous: result.providerOutcomeAmbiguous ?? false,
          do_not_resend: result.doNotResend ?? false,
        });
        return;
      }
      res.json({
        ok: true,
        reason: null,
        status: result.status ?? null,
        reconciliation_pending: result.reconciliationPending ?? false,
      });
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      log.error("SMS reply failed", { error: e?.message });
      throw AppError.fromHttpStatus(500, "Reply failed");
    }
  },
);

router.post(
  "/api/sms/threads/:id/mark-read",
  authenticateUser,
  smsRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await drizzle
        .update(schema.smsThreads)
        .set({ unreadCount: 0 })
        .where(
          and(eq(schema.smsThreads.id, req.params.id), eq(schema.smsThreads.userId, req.user.id)),
        );
      res.json({ ok: true });
    } catch (e: any) {
      rethrowIfAppError(e);
      log.error("SMS mark-read failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to mark SMS thread read");
    }
  },
);

export default router;
