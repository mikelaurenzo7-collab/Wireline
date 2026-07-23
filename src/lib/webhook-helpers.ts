/* eslint-disable @typescript-eslint/no-explicit-any -- job and webhook payloads are stored as Postgres jsonb. */
import { drizzle, log, fetchWithTimeout } from "./server-context";
import * as schema from "../db/schema";
import { eq, and, lte } from "drizzle-orm";
import { getErrorMessage } from "./server-utils";
import { decryptSecret } from "./secret-vault";
import { resolveWebhookDeliveryHostname } from "./webhook-validators";
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
  // Drizzle `with` relations may infer as array; normalize to single object.
  const hook = Array.isArray(hookRaw) ? hookRaw[0] : hookRaw;
  if (!hook?.url) {
    await drizzle
      .update(schema.webhookDeliveries)
      .set({ status: WEBHOOK_DELIVERY_FAILED, nextAttemptAt: null })
      .where(eq(schema.webhookDeliveries.id, deliveryIdBig));
    return;
  }

  // Vault-encrypted secrets (secretEncrypted) are how the webhook API stores
  // secrets today; the plaintext column only survives on legacy rows. If a
  // configured secret cannot be decrypted, fail the delivery instead of
  // sending an unsigned request the subscriber cannot verify.
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
      await drizzle
        .update(schema.webhookDeliveries)
        .set({
          status: WEBHOOK_DELIVERY_FAILED,
          lastError: "secret_decrypt_failed",
          nextAttemptAt: null,
        })
        .where(eq(schema.webhookDeliveries.id, deliveryIdBig));
      return;
    }
  }

  const body = JSON.stringify(deliveryWithHook.payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (signingSecret) {
    headers["x-wireline-signature"] = createHmac("sha256", signingSecret)
      .update(body)
      .digest("hex");
  }

  let statusCode: number | null = null;
  let success = false;
  try {
    const hostnameResolution = await resolveWebhookDeliveryHostname(hook.url);
    if (hostnameResolution.status !== "public") {
      const lastError =
        hostnameResolution.status === "private"
          ? "blocked_private_destination"
          : "dns_resolution_failed";
      log.warn("Webhook delivery blocked — hostname guard", {
        deliveryId: String(deliveryId),
        webhookId: hook.id,
        reason: lastError,
      });
      await drizzle
        .update(schema.webhookDeliveries)
        .set({
          status: WEBHOOK_DELIVERY_FAILED,
          lastError,
          nextAttemptAt: null,
        })
        .where(eq(schema.webhookDeliveries.id, deliveryIdBig));
      return;
    }

    // redirect: "manual" closes the SSRF redirect bypass: the hostname guard
    // above validated hook.url, but undici follows 3xx by default to a target
    // that was never validated (a public host can 302 to 169.254.169.254 or
    // an internal address). A redirected webhook is treated as a failed
    // attempt — endpoints that legitimately move should update their URL.
    const res = await fetchWithTimeout(
      hook.url,
      { method: "POST", headers, body, redirect: "manual" },
      10_000,
    );
    // undici surfaces a blocked 3xx as an *opaque-redirect* response
    // (`type: "opaqueredirect"`, `status: 0`, `ok: false`) — not a 300-399
    // status — so detect it by type as well as status range.
    const isRedirect = res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400);
    if (isRedirect) {
      success = false;
      // status is 0 for an opaque redirect; record null rather than a bogus 0.
      statusCode = res.status || null;
      log.warn("Webhook delivery blocked — endpoint attempted a redirect", {
        deliveryId: String(deliveryId),
        webhookId: hook.id,
        responseType: res.type,
      });
    } else {
      statusCode = res.status;
      success = res.ok;
    }
  } catch (err: unknown) {
    log.warn("Webhook delivery attempt failed", { deliveryId, error: getErrorMessage(err) });
  }

  const newAttempts = (deliveryWithHook.attempts || 0) + 1;
  const maxAttempts = deliveryWithHook.maxAttempts || 5;
  const reachedDead = !success && newAttempts >= maxAttempts;
  const nextAttemptAt =
    success || reachedDead ? null : new Date(Date.now() + Math.pow(2, newAttempts) * 60_000);

  const nextStatus: WebhookDeliveryStatus = success
    ? WEBHOOK_DELIVERY_SUCCESS
    : reachedDead
      ? WEBHOOK_DELIVERY_FAILED
      : WEBHOOK_DELIVERY_PENDING;

  await drizzle
    .update(schema.webhookDeliveries)
    .set({
      status: nextStatus,
      lastStatusCode: statusCode,
      attempts: newAttempts,
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
