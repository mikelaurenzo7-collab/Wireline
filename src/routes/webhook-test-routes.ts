import { Router, type Response } from "express";
import { and, eq } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { drizzle, auditLogger, requirePermission } from "../lib/server-context";
import { attemptWebhookDelivery } from "../lib/webhook-helpers";
import { authenticateUser } from "../middleware/auth";
import { webhooksRateLimit } from "../middleware/api-rate-limits";
import * as schema from "../db/schema";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

router.post(
  "/:id/test",
  authenticateUser,
  requirePermission("webhooks.manage"),
  webhooksRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const [hook] = await drizzle
      .select({ id: schema.webhooks.id, active: schema.webhooks.active })
      .from(schema.webhooks)
      .where(and(eq(schema.webhooks.id, req.params.id), eq(schema.webhooks.userId, req.user.id)))
      .limit(1);
    if (!hook) throw AppError.fromHttpStatus(404, "Webhook not found.");

    const payload = {
      event: "task.created",
      timestamp: new Date().toISOString(),
      data: {
        test: true,
        message: "This is a test ping from Wireline.",
        webhook_id: hook.id,
        at: new Date().toISOString(),
      },
    };
    const [delivery] = await drizzle
      .insert(schema.webhookDeliveries)
      .values({
        userId: req.user.id,
        webhookId: hook.id,
        event: "task.created",
        payload,
      })
      .returning({ id: schema.webhookDeliveries.id });
    if (!delivery) throw AppError.fromHttpStatus(500, "Could not create test delivery.");

    await attemptWebhookDelivery(delivery.id.toString());
    const [result] = await drizzle
      .select({
        id: schema.webhookDeliveries.id,
        status: schema.webhookDeliveries.status,
        attempts: schema.webhookDeliveries.attempts,
        lastStatusCode: schema.webhookDeliveries.lastStatusCode,
        lastError: schema.webhookDeliveries.lastError,
        nextAttemptAt: schema.webhookDeliveries.nextAttemptAt,
        deliveredAt: schema.webhookDeliveries.deliveredAt,
      })
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.id, delivery.id))
      .limit(1);

    void auditLogger
      .logWebhook("tested", {
        userId: req.user.id,
        webhookId: hook.id,
        ip: req.ip,
        metadata: {
          delivery_id: delivery.id.toString(),
          delivery_status: result?.status || "unknown",
          status_code: result?.lastStatusCode || null,
        },
      })
      .catch(() => {});

    const body = {
      success: result?.status === "success",
      delivery: result
        ? {
            ...result,
            id: result.id.toString(),
          }
        : { id: delivery.id.toString(), status: "unknown" },
      message:
        result?.status === "success"
          ? "The selected webhook accepted the test delivery."
          : result?.status === "pending"
            ? "The selected webhook did not accept the first attempt; a retry is scheduled."
            : "The selected webhook test failed.",
    };

    if (result?.status === "success") return res.json(body);
    if (result?.status === "pending") return res.status(202).json(body);
    return res.status(502).json(body);
  },
);

export default router;
