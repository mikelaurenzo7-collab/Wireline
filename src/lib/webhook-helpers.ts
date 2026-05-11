import { 
  db, 
  log, 
  fetchWithTimeout, 
  IS_PROD 
} from "./server-context";
import { getErrorMessage } from "./server-utils";
import { SentryEvents } from "./sentry-events";
import { createHmac } from "node:crypto";

export type WebhookEvent = 'call.completed' | 'lead.hot' | 'call.escalated' | 'compliance.flagged' | 'knowledge_updated';

export async function attemptWebhookDelivery(deliveryId: string | number) {
  const { data: delivery, error: fetchErr } = await db
    .from("wireline_webhook_deliveries")
    .select("*, wireline_webhooks(url, secret)")
    .eq("id", deliveryId)
    .single();
  
  if (fetchErr || !delivery) {
    log.error("Webhook delivery fetch failed", { deliveryId, error: fetchErr?.message });
    return;
  }

  const hook = (delivery as any).wireline_webhooks;
  if (!hook?.url) {
    await db.from("wireline_webhook_deliveries").update({ status: "failed", next_attempt_at: null }).eq("id", deliveryId);
    return;
  }

  const body = JSON.stringify(delivery.payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (hook.secret) {
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

  const newAttempts = (delivery.attempts || 0) + 1;
  const reachedDead = !success && newAttempts >= 5;
  const nextAttemptAt = success || reachedDead ? null : new Date(Date.now() + Math.pow(2, newAttempts) * 60_000).toISOString();

  await db.from("wireline_webhook_deliveries").update({
    status: success ? "success" : reachedDead ? "failed" : "pending",
    last_status_code: statusCode,
    attempts: newAttempts,
    last_attempt_at: new Date().toISOString(),
    next_attempt_at: nextAttemptAt,
  }).eq("id", deliveryId);

  if (reachedDead) {
    SentryEvents.webhookDeliveryFailed({
      webhook_id: (delivery as any).webhook_id,
      attempt: newAttempts,
      status_code: statusCode || undefined,
    });
  }
}

export async function dispatchWebhook(userId: string, event: WebhookEvent, data: any) {
  try {
    const { data: hooks } = await db.from("wireline_webhooks")
      .select("id, events")
      .eq("user_id", userId)
      .eq("active", true);
    
    const targetIds = (hooks || [])
      .filter((h: any) => Array.isArray(h.events) && h.events.includes(event))
      .map((h: any) => h.id);
    
    if (!targetIds.length) return;

    const payload = { event, timestamp: new Date().toISOString(), data };
    const rows = targetIds.map((webhook_id: string) => ({
      user_id: userId,
      webhook_id,
      event,
      payload,
    }));
    
    const { data: inserted, error } = await db
      .from("wireline_webhook_deliveries")
      .insert(rows)
      .select("id");
    
    if (error) {
      log.error("Webhook delivery insert failed", { error: error.message });
      return;
    }

    await Promise.all((inserted || []).map((d: any) => attemptWebhookDelivery(d.id)));
  } catch (err: any) {
    log.error("Webhook dispatch failed", { error: getErrorMessage(err) });
  }
}

let _webhookSchedRunning = false;
export async function processWebhookRetries() {
  if (_webhookSchedRunning) return;
  _webhookSchedRunning = true;
  try {
    const { data: due } = await db
      .from("wireline_webhook_deliveries")
      .select("id")
      .eq("status", "pending")
      .lte("next_attempt_at", new Date().toISOString())
      .limit(25);
    
    if (due && due.length > 0) {
      await Promise.all(due.map(d => attemptWebhookDelivery(d.id)));
    }
  } catch (err: any) {
    log.error("Webhook retry cycle failed", { error: getErrorMessage(err) });
  } finally {
    _webhookSchedRunning = false;
  }
}
