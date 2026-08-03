/* eslint-disable @typescript-eslint/no-explicit-any -- job and webhook payloads are stored as Postgres jsonb. */
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, isNull, lte, or, sql } from "drizzle-orm";
import { getErrorMessage } from "./server-utils";
import { decryptSecret } from "./secret-vault";
import {
  postWebhookSafely,
  type WebhookBlockReason,
} from "./safe-webhook-delivery";
import {
  WEBHOOK_DELIVERY_FAILED,
  WEBHOOK_DELIVERY_PENDING,
  WEBHOOK_DELIVERY_SUCCESS,
  type WebhookDeliveryStatus,
} from "./webhook-delivery-status";
import { SentryEvents } from "./sentry-events";
import { createHmac } from "node:crypto";

export type WebhookEvent =
  | "call.completed"
  | "lead.hot"
  | "call.escalated"
  | "compliance.flagged"
  | "knowledge_updated"
  | "spend.exceeded"
  | "spend.warning"
  | "task.created"
  | "lead.received"
  | "subscription.changed"
  | "email.received"
  | "appointment.booked"
  | "slack.message_sent"
  | "slo.jobs.critical"
  | "slo.webhooks.degraded"
  | "slo.enrichment.dead"
  | "voice.degradation";

/** All webhook event identifiers that can be subscribed to. Keep in sync with WebhookEvent. */
export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "call.completed",
  "lead.hot",
  "call.escalated",
  "compliance.flagged",
  "knowledge_updated",
  "spend.exceeded",
  "spend.warning",
  "task.created",
  "lead.received",
  "subscription.changed",
  "email.received",
  "appointment.booked",
  "slack.message_sent",
  "slo.jobs.critical",
  "slo.webhooks.degraded",
  "slo.enrichment.dead",
  "voice.degradation",
];

/** Semantic version for CRM consumers parsing `call.completed.data`. Bump when shape changes. */
export const WIREFLINE_CALL_OUTCOME_SCHEMA_VERSION = "2026-05-01";
const WEBHOOK_DELIVERY_LEASE_MS = 2 * 60_000;

export interface WirelineCallCompletedOutcome {
  outcome_schema_version: typeof WIREFLINE_CALL_OUTCOME_SCHEMA_VERSION;
  vapi_call_id: string;
  agent_id?: string | null;
  customer_number?: string | null;
  direction: "inbound" | "outbound";
  duration_seconds?: number;
  enrichment_source: "sync_vapi_webhook" | "async_post_call_job";
  enrichment?: {
    lead_score?: number | null;
    intent_label?: string | null;
    sentiment?: string | null;
    coaching_note?: string | null;
    lesson_extracted?: boolean;
  } | null;
}

export function buildCallCompletedOutcome(
  opts: Omit<WirelineCallCompletedOutcome, "outcome_schema_version">,
): WirelineCallCompletedOutcome {
  return {
    outcome_schema_version: WIREFLINE_CALL_OUTCOME_SCHEMA_VERSION,
    ...opts,
  };
}

type DeliveryAttemptOutcome = {
  deliveryId: bigint;
  webhookId: string;
  status: WebhookDeliveryStatus;
  statusCode: number | null;
  attempts: number;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  lastError: string | null;
};

/** Keep delivery history and the endpoint summary synchronized in one commit. */
async function persistDeliveryOutcome(outcome: DeliveryAttemptOutcome): Promise<void> {
  const attemptedAt = new Date();
  await drizzle.transaction(async (tx) => {
    await tx
      .update(schema.webhookDeliveries)
      .set({
        status: outcome.status,
        lastStatusCode: outcome.statusCode,
        lastError: outcome.lastError,
        attempts: outcome.attempts,
        nextAttemptAt: outcome.nextAttemptAt,
        deliveredAt: outcome.deliveredAt,
      })
      .where(eq(schema.webhookDeliveries.id, outcome.deliveryId));

    await tx
      .update(schema.webhooks)
      .set({
        lastTriggeredAt: attemptedAt,
        lastStatus: outcome.statusCode,
        lastError: outcome.lastError,
        ...(outcome.status === WEBHOOK_DELIVERY_SUCCESS
          ? { deliveryCount: sql`coalesce(${schema.webhooks.deliveryCount}, 0) + 1` }
          : {}),
      })
      .where(eq(schema.webhooks.id, outcome.webhookId));
  });
}

/**
 * Atomically lease one pending delivery before any DNS or network work. Vercel
 * may run multiple retry workers at once; without this conditional update they
 * can select the same due row and send duplicate customer webhooks. A crashed
 * worker leaves the row pending and the short lease makes it eligible again.
 */
async function claimWebhookDelivery(deliveryId: bigint): Promise<number | null> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + WEBHOOK_DELIVERY_LEASE_MS);
  const [claimed] = await drizzle
    .update(schema.webhookDeliveries)
    .set({
      attempts: sql`coalesce(${schema.webhookDeliveries.attempts}, 0) + 1`,
      nextAttemptAt: leaseUntil,
    })
    .where(
      and(
        eq(schema.webhookDeliveries.id, deliveryId),
        eq(schema.webhookDeliveries.status, WEBHOOK_DELIVERY_PENDING),
        or(
          isNull(schema.webhookDeliveries.nextAttemptAt),
          lte(schema.webhookDeliveries.nextAttemptAt, now),
        ),
      ),
    )
    .returning({ attempts: schema.webhookDeliveries.attempts });
  return claimed?.attempts ?? null;
}

function blockedDeliveryReason(reason: WebhookBlockReason): string {
  if (reason === "private_destination") return "blocked_private_destination";
  if (reason === "unsupported_protocol") return "unsupported_protocol";
  if (reason === "invalid_url") return "invalid_url";
  return "dns_resolution_failed";
}

export async function attemptWebhookDelivery(deliveryId: string | number) {
  const deliveryIdBig = BigInt(deliveryId);
  const nextAttempts = await claimWebhookDelivery(deliveryIdBig);
  if (nextAttempts === null) return;

  const deliveryWithHook = await drizzle.query.webhookDeliveries.findFirst({
    where: eq(schema.webhookDeliveries.id, deliveryIdBig),
    with: {
      webhook: true,
    },
  });

  if (!deliveryWithHook) {
    log.error("Webhook delivery fetch failed after lease", { deliveryId });
    return;
  }

  type DeliveryHook = {
    id: string;
    url: string;
    secret: string | null;
    secretEncrypted: string | null;
  };
  const hookRaw = (
    deliveryWithHook as unknown as {
      webhook?: DeliveryHook | DeliveryHook[];
    }
  ).webhook;
  const hook = Array.isArray(hookRaw) ? hookRaw[0] : hookRaw;

  if (!hook?.url) {
    await persistDeliveryOutcome({
      deliveryId: deliveryIdBig,
      webhookId: deliveryWithHook.webhookId,
      status: WEBHOOK_DELIVERY_FAILED,
      statusCode: null,
      attempts: nextAttempts,
      nextAttemptAt: null,
      deliveredAt: null,
      lastError: "webhook_missing",
    });
    return;
  }

  let signingSecret: string | null = hook.secret;
  if (hook.secretEncrypted) {
    try {
      signingSecret = decryptSecret(hook.secretEncrypted);
    } catch (err: unknown) {
      log.error("Webhook delivery blocked — secret decryption failed", {
        deliveryId: String(deliveryId),
        webhookId: hook.id,
        error: getErrorMessage(err),
      });
      await persistDeliveryOutcome({
        deliveryId: deliveryIdBig,
        webhookId: hook.id,
        status: WEBHOOK_DELIVERY_FAILED,
        statusCode: null,
        attempts: nextAttempts,
        nextAttemptAt: null,
        deliveredAt: null,
        lastError: "secret_decrypt_failed",
      });
      return;
    }
  }

  const body = JSON.stringify(deliveryWithHook.payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    // Delivery is deliberately at-least-once. These stable headers let a
    // recipient suppress a replay after an acknowledged send whose local
    // success update was interrupted.
    "x-wireline-delivery-id": deliveryIdBig.toString(),
    "x-wireline-delivery-attempt": String(nextAttempts),
    "x-wireline-event": String(deliveryWithHook.event),
  };
  const payloadTimestamp =
    deliveryWithHook.payload &&
    typeof deliveryWithHook.payload === "object" &&
    !Array.isArray(deliveryWithHook.payload) &&
    typeof (deliveryWithHook.payload as Record<string, unknown>).timestamp === "string"
      ? String((deliveryWithHook.payload as Record<string, unknown>).timestamp)
      : null;
  if (payloadTimestamp) headers["x-wireline-timestamp"] = payloadTimestamp;
  if (signingSecret) {
    headers["x-wireline-signature"] = createHmac("sha256", signingSecret)
      .update(body)
      .digest("hex");
  }

  let statusCode: number | null = null;
  let success = false;
  let lastError: string | null = null;
  try {
    const response = await postWebhookSafely(hook.url, headers, body, 10_000);
    if (response.status === "blocked") {
      lastError = blockedDeliveryReason(response.reason);
      log.warn("Webhook delivery blocked — destination guard", {
        deliveryId: String(deliveryId),
        webhookId: hook.id,
        reason: lastError,
      });
      await persistDeliveryOutcome({
        deliveryId: deliveryIdBig,
        webhookId: hook.id,
        status: WEBHOOK_DELIVERY_FAILED,
        statusCode: null,
        attempts: nextAttempts,
        nextAttemptAt: null,
        deliveredAt: null,
        lastError,
      });
      return;
    }

    statusCode = response.statusCode;
    if (response.redirect) {
      lastError = "redirect_blocked";
      log.warn("Webhook delivery blocked — endpoint attempted a redirect", {
        deliveryId: String(deliveryId),
        webhookId: hook.id,
        statusCode,
      });
    } else {
      success = response.ok;
      lastError = success ? null : `http_${response.statusCode}`;
    }
  } catch (err: unknown) {
    lastError = "request_failed";
    log.warn("Webhook delivery attempt failed", { deliveryId, error: getErrorMessage(err) });
  }

  const maxAttempts = deliveryWithHook.maxAttempts || 5;
  const reachedDead = !success && nextAttempts >= maxAttempts;
  const nextAttemptAt =
    success || reachedDead ? null : new Date(Date.now() + Math.pow(2, nextAttempts) * 60_000);
  const nextStatus: WebhookDeliveryStatus = success
    ? WEBHOOK_DELIVERY_SUCCESS
    : reachedDead
      ? WEBHOOK_DELIVERY_FAILED
      : WEBHOOK_DELIVERY_PENDING;
  const deliveredAt = success ? new Date() : null;

  await persistDeliveryOutcome({
    deliveryId: deliveryIdBig,
    webhookId: hook.id,
    status: nextStatus,
    statusCode,
    attempts: nextAttempts,
    nextAttemptAt,
    deliveredAt,
    lastError,
  });

  if (reachedDead) {
    SentryEvents.webhookDeliveryFailed({
      webhook_id: deliveryWithHook.webhookId,
      attempt: nextAttempts,
      status_code: statusCode || undefined,
    });
  }
}

export async function dispatchWebhook(userId: string, event: WebhookEvent, data: any) {
  try {
    const hooks = await drizzle
      .select({ id: schema.webhooks.id, events: schema.webhooks.events })
      .from(schema.webhooks)
      .where(and(eq(schema.webhooks.userId, userId), eq(schema.webhooks.active, true)));

    const targetIds = (hooks || [])
      .filter((h: any) => Array.isArray(h.events) && h.events.includes(event))
      .map((h: any) => h.id);

    if (!targetIds.length) return;

    const payload = { event, timestamp: new Date().toISOString(), data };
    const values = targetIds.map((webhookId: string) => ({
      userId,
      webhookId,
      event,
      payload,
    }));

    const inserted = await drizzle
      .insert(schema.webhookDeliveries)
      .values(values)
      .returning({ id: schema.webhookDeliveries.id });

    await Promise.all((inserted || []).map((delivery: any) => attemptWebhookDelivery(delivery.id)));
  } catch (err: any) {
    log.error("Webhook dispatch failed", { error: getErrorMessage(err) });
  }
}

let _webhookSchedRunning = false;
export async function processWebhookRetries() {
  if (_webhookSchedRunning) return;
  _webhookSchedRunning = true;
  try {
    const due = await drizzle
      .select({ id: schema.webhookDeliveries.id })
      .from(schema.webhookDeliveries)
      .where(
        and(
          eq(schema.webhookDeliveries.status, WEBHOOK_DELIVERY_PENDING),
          lte(schema.webhookDeliveries.nextAttemptAt, new Date()),
        ),
      )
      .limit(25);

    if (due.length > 0) {
      await Promise.all(due.map((delivery) => attemptWebhookDelivery(delivery.id.toString())));
    }
  } catch (err: any) {
    log.error("Webhook retry cycle failed", { error: getErrorMessage(err) });
  } finally {
    _webhookSchedRunning = false;
  }
}
