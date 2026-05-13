import express, { Response } from "express";
import { db, log, auditLogger, requirePermission } from "../lib/server-context";
import { getErrorMessage } from "../lib/server-utils";
import { authenticateUser } from "../middleware/auth";
import { validateWebhookUrl } from "../lib/webhook-validators";
import { WEBHOOK_EVENTS, type WebhookEvent, attemptWebhookDelivery, dispatchWebhook } from "../lib/webhook-helpers";
import { encryptSecret, lastFour, isVaultConfigured } from "../lib/secret-vault";
import { webhooksRateLimit } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

const router = express.Router();

const WEBHOOK_PUBLIC_COLUMNS =
  "id, user_id, name, url, events, active, last_triggered_at, last_status, last_error, delivery_count, created_at, secret_last_four";

router.get("/", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data, error } = await db.from("wireline_webhooks")
      .select(WEBHOOK_PUBLIC_COLUMNS).eq("user_id", req.user.id).order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ webhooks: data || [], available_events: WEBHOOK_EVENTS });
  } catch (e: unknown) { log.error("Failed to load webhooks", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to load webhooks" }); }
});

router.post("/", authenticateUser, requirePermission("webhooks.manage"), webhooksRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, url, events, secret, active } = req.body;
    if (!name || !url || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: "name, url, and events[] required." });
    }
    const urlErr = await validateWebhookUrl(url);
    if (urlErr) return res.status(400).json({ error: urlErr });
    const bad = events.filter((e: string) => !WEBHOOK_EVENTS.includes(e as WebhookEvent));
    if (bad.length) return res.status(400).json({ error: `Unknown events: ${bad.join(", ")}` });
    let plaintextSecret: string | null = null;
    if (secret !== undefined && secret !== null && secret !== "") {
      if (String(secret).length < 16) {
        return res.status(400).json({ error: "Webhook secret must be at least 16 characters." });
      }
      plaintextSecret = String(secret);
    }
    if (plaintextSecret && !isVaultConfigured()) {
      return res.status(503).json({
        error: "Webhook secret storage is unavailable: WIRELINE_DATA_KEY is not configured on the server.",
        code: "VAULT_UNCONFIGURED",
      });
    }
    const row: Record<string, unknown> = {
      user_id: req.user.id, name, url, events, active: active ?? true,
    };
    if (plaintextSecret) {
      row.secret_encrypted = encryptSecret(plaintextSecret);
      row.secret_last_four = lastFour(plaintextSecret);
      row.secret = null;
    }

    const { data, error } = await db.from("wireline_webhooks").insert(row)
      .select(WEBHOOK_PUBLIC_COLUMNS).single();
    if (error) throw error;
    void auditLogger.logWebhook('created', {
      userId: req.user.id, webhookId: data.id, url: data.url, events: data.events, active: data.active, ip: req.ip,
    }).catch(() => {});
    res.json({ webhook: data });
  } catch (e: unknown) { log.error("Failed to create webhook", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to create webhook" }); }
});

router.patch("/:id", authenticateUser, requirePermission("webhooks.manage"), webhooksRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "url", "events", "active"]) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }
    if (patch.url) { const urlErr = await validateWebhookUrl(patch.url as string); if (urlErr) return res.status(400).json({ error: urlErr }); }
    if (req.body.secret !== undefined) {
      const s = req.body.secret;
      if (s === null || s === "") {
        patch.secret_encrypted = null;
        patch.secret_last_four = null;
        patch.secret = null;
      } else {
        if (String(s).length < 16) {
          return res.status(400).json({ error: "Webhook secret must be at least 16 characters." });
        }
        if (!isVaultConfigured()) {
          return res.status(503).json({
            error: "Webhook secret storage is unavailable: WIRELINE_DATA_KEY is not configured on the server.",
            code: "VAULT_UNCONFIGURED",
          });
        }
        patch.secret_encrypted = encryptSecret(String(s));
        patch.secret_last_four = lastFour(String(s));
        patch.secret = null;
      }
    }
    if (patch.events) {
      if (!Array.isArray(patch.events) || (patch.events as string[]).some((e: string) => !WEBHOOK_EVENTS.includes(e as WebhookEvent))) {
        return res.status(400).json({ error: "Invalid events." });
      }
    }
    const { data, error } = await db.from("wireline_webhooks").update(patch)
      .eq("id", req.params.id).eq("user_id", req.user.id).select(WEBHOOK_PUBLIC_COLUMNS).single();
    if (error) throw error;
    void auditLogger.logWebhook('updated', {
      userId: req.user.id, webhookId: data.id, url: data.url, events: data.events, active: data.active, ip: req.ip,
    }).catch(() => {});
    res.json({ webhook: data });
  } catch (e: unknown) { log.error("Failed to update", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to update" }); }
});

router.delete("/:id", authenticateUser, requirePermission("webhooks.manage"), webhooksRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await db.from("wireline_webhooks").delete().eq("id", req.params.id).eq("user_id", req.user.id);
    void auditLogger.logWebhook('deleted', {
      userId: req.user.id, webhookId: req.params.id, ip: req.ip,
    }).catch(() => {});
    res.json({ success: true });
  } catch (e: unknown) { log.error("Failed to delete", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to delete" }); }
});

router.post("/:id/test", authenticateUser, requirePermission("webhooks.manage"), webhooksRateLimit, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: hook } = await db.from("wireline_webhooks").select("id").eq("id", req.params.id).eq("user_id", req.user.id).single();
    if (!hook) return res.status(404).json({ error: "Webhook not found." });
    await dispatchWebhook(req.user.id, "task.created", {
      test: true, message: "This is a test ping from Wireline.", at: new Date().toISOString(),
    });
    void auditLogger.logWebhook('tested', {
      userId: req.user.id, webhookId: req.params.id, ip: req.ip,
    }).catch(() => {});
    res.json({ success: true, message: "Test dispatched. Check the URL." });
  } catch (e: unknown) { log.error("Test failed", { error: getErrorMessage(e) }); res.status(500).json({ error: "Test failed" }); }
});

router.get("/:id/deliveries", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt((req.query.limit as string) || "50"), 200);
    const { data: hook } = await db.from("wireline_webhooks")
      .select("id").eq("id", req.params.id).eq("user_id", req.user.id).maybeSingle();
    if (!hook) return res.status(404).json({ error: "Webhook not found." });
    const { data, error } = await db.from("wireline_webhook_deliveries")
      .select("id, event, attempts, max_attempts, status, last_status_code, last_error, next_attempt_at, delivered_at, created_at")
      .eq("webhook_id", req.params.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ deliveries: data || [] });
  } catch (e: unknown) { log.error("Failed to load deliveries", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to load deliveries" }); }
});

router.post("/deliveries/:id/retry", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid delivery id." });
    const { data: row } = await db.from("wireline_webhook_deliveries")
      .select("id, user_id, status").eq("id", id).maybeSingle();
    if (!row || row.user_id !== req.user.id) return res.status(404).json({ error: "Delivery not found." });
    await db.from("wireline_webhook_deliveries").update({
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      last_error: null,
      last_status_code: null,
    }).eq("id", id);
    attemptWebhookDelivery(id).catch((err: unknown) =>
      log.warn("webhook delivery attempt failed", { delivery_id: id, error: err instanceof Error ? err.message : String(err) })
    );
    res.json({ success: true });
  } catch (e: unknown) { log.error("Retry failed", { error: getErrorMessage(e) }); res.status(500).json({ error: "Retry failed" }); }
});

router.delete("/deliveries/:id", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid delivery id." });
    await db.from("wireline_webhook_deliveries")
      .delete().eq("id", id).eq("user_id", req.user.id);
    res.json({ success: true });
  } catch (e: unknown) { log.error("Discard failed", { error: getErrorMessage(e) }); res.status(500).json({ error: "Discard failed" }); }
});

export default router;
