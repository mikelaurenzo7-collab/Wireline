import { Router, Response } from "express";
import { and, eq } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";
import { getErrorMessage } from "../lib/server-utils";
import { touchNavCounts } from "../lib/nav-counts-invalidate";

const router = Router();

/**
 * Create a single human-review task from an email thread. This is deliberately
 * not an auto-send path: it turns a conversation into a durable next step that
 * an account holder can own, assign, or resolve before anything external happens.
 */
router.post(
  "/api/emails/threads/:id/follow-up",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [thread] = await drizzle
        .select({
          id: schema.emailThreads.id,
          subject: schema.emailThreads.subject,
          customerEmail: schema.emailThreads.customerEmail,
          summary: schema.emailThreads.summary,
        })
        .from(schema.emailThreads)
        .where(
          and(
            eq(schema.emailThreads.id, req.params.id),
            eq(schema.emailThreads.userId, req.user.id),
          ),
        )
        .limit(1);

      if (!thread) throw AppError.fromHttpStatus(404, "Email conversation not found.");

      const [existing] = await drizzle
        .select({ id: schema.followUpTasks.id })
        .from(schema.followUpTasks)
        .where(
          and(
            eq(schema.followUpTasks.userId, req.user.id),
            eq(schema.followUpTasks.sourceType, "email_thread"),
            eq(schema.followUpTasks.sourceId, String(thread.id)),
          ),
        )
        .limit(1);

      if (existing) {
        return res.status(200).json({
          created: false,
          task_id: String(existing.id),
          message: "This conversation already has a follow-up task.",
        });
      }

      const [task] = await drizzle
        .insert(schema.followUpTasks)
        .values({
          userId: req.user.id,
          sourceType: "email_thread",
          sourceId: String(thread.id),
          targetChannel: "manual",
          customerInfo: thread.customerEmail || null,
          taskType: "email_follow_up",
          description: `Review and follow up: ${thread.subject || "Untitled conversation"}`,
          priority: "medium",
          status: "pending",
        })
        .returning({ id: schema.followUpTasks.id });

      touchNavCounts(req.user.id);
      res.status(201).json({
        created: true,
        task_id: task?.id ? String(task.id) : null,
        message: "Follow-up added to your work queue.",
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("email follow-up creation failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Could not create the follow-up task.");
    }
  },
);

export default router;
