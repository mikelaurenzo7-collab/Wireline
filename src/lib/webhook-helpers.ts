/* eslint-disable @typescript-eslint/no-explicit-any -- job and webhook payloads are stored as Postgres jsonb. */
import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, lte } from "drizzle-orm";
import { getErrorMessage } from "./server-utils";
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
  | "slo.enrichment.dead";

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
];

/** Semantic version for CRM consumers parsing `call.completed.data`. Bump when shape changes. */
export const WIREFLINE_CALL_OUTCOME_SCHEMA_VERSION = "2026-05-01";

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

export async function attemptWebhookDelivery(deliveryId: string | number) {
  const deliveryIdBig = typeof deliveryId === "string" ? BigInt(deliveryId) : BigInt(deliveryId);

  const deliveryWithHook = await drizzle.query.webhookDeliveries.findFirst({
    where: eq(schema.webhookDeliveries.id, deliveryIdBig),
    with: {
      webhook: true,
    },
  });

  if (!deliveryWithHook) {
    log.error("Webhook delivery fetch failed", { deliveryId });
    return;
  }

  const hookRaw = deliveryWithHook.webhook;
  // Drizzle `with` relations may infer as array; normalize to single object.
  const hook = Array.isArray(hookRaw) ? hookRaw[0] : hookRaw;
  if (!hook?.url) {
    await drizzle
      .update(schema.webhookDeliveries)
      .set({ status: "failed", nextAttemptAt: null })
      .where(eq(schema.webhookDeliveries.id, deliveryIdBig));
    return;
  }

  const body = JSON.stringify(deliveryWithHook.payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (hook.secret) {
    // Note: hook.secret might be encrypted, but historically it was plaintext in this helper.
    // If it's encrypted, we'd need decryptSecret(hook.secret). Assuming plaintext or pre-decrypted here for parity.
    headers["x-wireline-signature"] = createHmac("sha256", hook.secret).update(body).digest("hex");
  }

  let statusCode: number | null = null;
  let success = false;
  try {
    const res = await fetchWithTimeout(hook.url, { method: "POST", headers, body }, 10_000);
    statusCode = res.status;
    success = res.ok;
  } catch (err: any) {
    log.warn("Webhook delivery attempt failed", { deliveryId, error: getErrorMessage(err) });
  }

  const newAttempts = (deliveryWithHook.attempts || 0) + 1;
  const maxAttempts = deliveryWithHook.maxAttempts || 5;
  const reachedDead = !success && newAttempts >= maxAttempts;
  const nextAttemptAt =
    success || reachedDead ? null : new Date(Date.now() + Math.pow(2, newAttempts) * 60_000);

  await drizzle
    .update(schema.webhookDeliveries)
    .set({
      status: success ? "success" : reachedDead ? "failed" : "pending",
      lastStatusCode: statusCode,
      attempts: newAttempts,
      lastAttemptAt: new Date(),
      nextAttemptAt: nextAttemptAt,
    })
    .where(eq(schema.webhookDeliveries.id, deliveryIdBig));

  if (reachedDead) {
    SentryEvents.webhookDeliveryFailed({
      webhook_id: deliveryWithHook.webhookId,
      attempt: newAttempts,
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

    await Promise.all((inserted || []).map((d: any) => attemptWebhookDelivery(Number(d.id))));
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
          eq(schema.webhookDeliveries.status, "pending"),
          lte(schema.webhookDeliveries.nextAttemptAt, new Date()),
        ),
      )
      .limit(25);

    if (due && due.length > 0) {
      await Promise.all(due.map((d) => attemptWebhookDelivery(Number(d.id))));
    }
  } catch (err: any) {
    log.error("Webhook retry cycle failed", { error: getErrorMessage(err) });
  } finally {
    _webhookSchedRunning = false;
  }
}
