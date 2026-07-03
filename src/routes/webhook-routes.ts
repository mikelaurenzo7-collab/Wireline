/* eslint-disable @typescript-eslint/no-explicit-any -- vendor webhook payloads are JSON envelopes with provider-specific shapes. */
import express, { Response } from "express";
import { AppError } from "../lib/api-error";
import { log, auditLogger, requirePermission, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getErrorMessage } from "../lib/server-utils";
import { authenticateUser } from "../middleware/auth";
import { validateBody, createWebhookSchema, updateWebhookSchema } from "../lib/api-validation";
import { validateWebhookUrl } from "../lib/webhook-validators";
import {
  WEBHOOK_EVENTS,
  type WebhookEvent,
  attemptWebhookDelivery,
  dispatchWebhook,
} from "../lib/webhook-helpers";
import { encryptSecret, lastFour, isVaultConfigured } from "../lib/secret-vault";
import { runInBackground } from "../lib/background-work";
import { webhooksRateLimit } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

const router = express.Router();

router.get("/", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const webhooks = await drizzle
      .select({
        id: schema.webhooks.id,
        userId: schema.webhooks.userId,
        name: schema.webhooks.name,
        url: schema.webhooks.url,
        events: schema.webhooks.events,
        active: schema.webhooks.active,
        lastTriggeredAt: schema.webhooks.lastTriggeredAt,
        lastStatus: schema.webhooks.lastStatus,
        lastError: schema.webhooks.lastError,
        deliveryCount: schema.webhooks.deliveryCount,
        createdAt: schema.webhooks.createdAt,
        secretLastFour: schema.webhooks.secretLastFour,
      })
      .from(schema.webhooks)
      .where(eq(schema.webhooks.userId, req.user.id))
      .orderBy(desc(schema.webhooks.createdAt));

    res.json({ webhooks: webhooks || [], available_events: WEBHOOK_EVENTS });
  } catch (e: any) {
    if (e instanceof AppError) throw e;
    log.error("Failed to load webhooks", { error: getErrorMessage(e) });
    throw AppError.fromHttpStatus(500, "Failed to load webhooks");
  }
});

router.post(
  "/",
  authenticateUser,
  requirePermission("webhooks.manage"),
  webhooksRateLimit,
  validateBody(createWebhookSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, url, events, secret, active } = req.body;
      if (!name || !url || !Array.isArray(events) || events.length === 0) {
        throw AppError.fromHttpStatus(400, "name, url, and events[] required.");
      }
      const urlErr = await validateWebhookUrl(url);
      if (urlErr) throw AppError.fromHttpStatus(400, String(urlErr));
      const bad = events.filter((e: string) => !WEBHOOK_EVENTS.includes(e as WebhookEvent));
      if (bad.length) throw AppError.fromHttpStatus(400, `Unknown events: ${bad.join(", ")}`);
      let plaintextSecret: string | null = null;
      if (secret !== undefined && secret !== null && secret !== "") {
        if (String(secret).length < 16) {
          throw AppError.fromHttpStatus(400, "Webhook secret must be at least 16 characters.");
        }
        plaintextSecret = String(secret);
      }
      if (plaintextSecret && !isVaultConfigured()) {
        return res.status(503).json({
          error:
            "Webhook secret storage is unavailable: WIRELINE_DATA_KEY is not configured on the server.",
          code: "VAULT_UNCONFIGURED",
        });
      }

      const values: any = {
        userId: req.user.id,
        name,
        url,
        events,
        active: active ?? true,
      };
      if (plaintextSecret) {
        values.secretEncrypted = encryptSecret(plaintextSecret);
        values.secretLastFour = lastFour(plaintextSecret);
        values.secret = null;
      }

      const [data] = (await drizzle.insert(schema.webhooks).values(values).returning()) as any[];

      void auditLogger
        .logWebhook("created", {
          userId: req.user.id,
          webhookId: data.id,
          url: data.url,
          events: data.events,
          active: data.active,
          ip: req.ip,
        })
        .catch(() => {});
      res.json({ webhook: data });
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      log.error("Failed to create webhook", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to create webhook");
    }
  },
);

router.patch(
  "/:id",
  authenticateUser,
  requirePermission("webhooks.manage"),
  webhooksRateLimit,
  validateBody(updateWebhookSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const patch: any = {};
      if (req.body.name !== undefined) patch.name = req.body.name;
      if (req.body.url !== undefined) {
        patch.url = req.body.url;
        const urlErr = await validateWebhookUrl(patch.url as string);
        if (urlErr) throw AppError.fromHttpStatus(400, String(urlErr));
      }
      if (req.body.events !== undefined) {
        patch.events = req.body.events;
        if (
          !Array.isArray(patch.events) ||
          (patch.events as string[]).some(
            (e: string) => !WEBHOOK_EVENTS.includes(e as WebhookEvent),
          )
        ) {
          throw AppError.fromHttpStatus(400, "Invalid events.");
        }
      }
      if (req.body.active !== undefined) patch.active = !!req.body.active;

      if (req.body.secret !== undefined) {
        const s = req.body.secret;
        if (s === null || s === "") {
          patch.secretEncrypted = null;
          patch.secretLastFour = null;
          patch.secret = null;
        } else {
          if (String(s).length < 16) {
            return res
              .status(400)
              .json({ error: "Webhook secret must be at least 16 characters." });
          }
          if (!isVaultConfigured()) {
            return res.status(503).json({
              error:
                "Webhook secret storage is unavailable: WIRELINE_DATA_KEY is not configured on the server.",
              code: "VAULT_UNCONFIGURED",
            });
          }
          patch.secretEncrypted = encryptSecret(String(s));
          patch.secretLastFour = lastFour(String(s));
          patch.secret = null;
        }
      }

      if (Object.keys(patch).length === 0)
        throw AppError.fromHttpStatus(400, "Provide at least one field to update.");

      const [data] = (await drizzle
        .update(schema.webhooks)
        .set(patch)
        .where(and(eq(schema.webhooks.id, req.params.id), eq(schema.webhooks.userId, req.user.id)))
        .returning()) as any[];

      if (!data) throw AppError.fromHttpStatus(404, "Webhook not found.");

      void auditLogger
        .logWebhook("updated", {
          userId: req.user.id,
          webhookId: data.id,
          url: data.url,
          events: data.events,
          active: data.active,
          ip: req.ip,
        })
        .catch(() => {});
      res.json({ webhook: data });
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      log.error("Failed to update", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to update");
    }
  },
);

router.delete(
  "/:id",
  authenticateUser,
  requirePermission("webhooks.manage"),
  webhooksRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      await drizzle
        .delete(schema.webhooks)
        .where(and(eq(schema.webhooks.id, req.params.id), eq(schema.webhooks.userId, req.user.id)));
      void auditLogger
        .logWebhook("deleted", {
          userId: req.user.id,
          webhookId: req.params.id,
          ip: req.ip,
        })
        .catch(() => {});
      res.json({ success: true });
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      log.error("Failed to delete", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to delete");
    }
  },
);

router.post(
  "/:id/test",
  authenticateUser,
  requirePermission("webhooks.manage"),
  webhooksRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [hook] = await drizzle
        .select({ id: schema.webhooks.id })
        .from(schema.webhooks)
        .where(and(eq(schema.webhooks.id, req.params.id), eq(schema.webhooks.userId, req.user.id)))
        .limit(1);
      if (!hook) throw AppError.fromHttpStatus(404, "Webhook not found.");
      await dispatchWebhook(req.user.id, "task.created", {
        test: true,
        message: "This is a test ping from Wireline.",
        at: new Date().toISOString(),
      });
      void auditLogger
        .logWebhook("tested", {
          userId: req.user.id,
          webhookId: req.params.id,
          ip: req.ip,
        })
        .catch(() => {});
      res.json({ success: true, message: "Test dispatched. Check the URL." });
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      log.error("Test failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Test failed");
    }
  },
);

router.get(
  "/:id/deliveries",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = parseInt((req.query.limit as string) || "50");
      const limit = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 50, 1), 200);
      const [hook] = await drizzle
        .select({ id: schema.webhooks.id })
        .from(schema.webhooks)
        .where(and(eq(schema.webhooks.id, req.params.id), eq(schema.webhooks.userId, req.user.id)))
        .limit(1);
      if (!hook) throw AppError.fromHttpStatus(404, "Webhook not found.");

      const deliveries = await drizzle
        .select({
          id: schema.webhookDeliveries.id,
          event: schema.webhookDeliveries.event,
          attempts: schema.webhookDeliveries.attempts,
          maxAttempts: schema.webhookDeliveries.maxAttempts,
          status: schema.webhookDeliveries.status,
          lastStatusCode: schema.webhookDeliveries.lastStatusCode,
          lastError: schema.webhookDeliveries.lastError,
          nextAttemptAt: schema.webhookDeliveries.nextAttemptAt,
          deliveredAt: schema.webhookDeliveries.deliveredAt,
          createdAt: schema.webhookDeliveries.createdAt,
        })
        .from(schema.webhookDeliveries)
        .where(eq(schema.webhookDeliveries.webhookId, req.params.id))
        .orderBy(desc(schema.webhookDeliveries.createdAt))
        .limit(limit);

      res.json({ deliveries: deliveries || [] });
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      log.error("Failed to load deliveries", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load deliveries");
    }
  },
);

router.post(
  "/deliveries/:id/retry",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id)) throw AppError.fromHttpStatus(400, "Invalid delivery id.");
      const [row] = await drizzle
        .select({ id: schema.webhookDeliveries.id, userId: schema.webhookDeliveries.userId })
        .from(schema.webhookDeliveries)
        .where(eq(schema.webhookDeliveries.id, BigInt(id)))
        .limit(1);
      if (!row || row.userId !== req.user.id)
        throw AppError.fromHttpStatus(404, "Delivery not found.");

      await drizzle
        .update(schema.webhookDeliveries)
        .set({
          status: "pending",
          nextAttemptAt: new Date(),
          lastError: null,
          lastStatusCode: null,
        })
        .where(eq(schema.webhookDeliveries.id, BigInt(id)));

      runInBackground(`webhook delivery retry ${id}`, () => attemptWebhookDelivery(id));
      res.json({ success: true });
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      log.error("Retry failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Retry failed");
    }
  },
);

router.delete(
  "/deliveries/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (!Number.isFinite(id)) throw AppError.fromHttpStatus(400, "Invalid delivery id.");
      await drizzle
        .delete(schema.webhookDeliveries)
        .where(
          and(
            eq(schema.webhookDeliveries.id, BigInt(id)),
            eq(schema.webhookDeliveries.userId, req.user.id),
          ),
        );
      res.json({ success: true });
    } catch (e: any) {
      if (e instanceof AppError) throw e;
      log.error("Discard failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Discard failed");
    }
  },
);

export default router;
