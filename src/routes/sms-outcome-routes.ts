import { Router, type Response } from "express";
import { and, eq, inArray } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import {
  ACTIVE_HANDOFF_TASK_STATUSES,
  conversationOutcomeSchema,
  handoffResolutionNote,
  handoffTaskStatusForOutcome,
} from "../lib/conversation-outcome";
import { touchNavCounts } from "../lib/nav-counts-invalidate";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import * as schema from "../db/schema";
import { validateBody } from "../lib/api-validation";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const SMS_HANDOFF_SOURCE_TYPE = "sms_thread";
const HUMAN_HANDOFF_TASK_TYPE = "human_handoff";

/**
 * SMS uses the same account-holder-owned outcome model as email. The thread is
 * the evidence surface; a human handoff is durable operator work. Updating one
 * reconciles the other so Inbox and Approvals cannot disagree about ownership.
 */
router.patch(
  "/api/sms/threads/:id/outcome",
  authenticateUser,
  validateBody(conversationOutcomeSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status: requestedStatus, handoff } = req.body;
      const status = handoff ? "escalated" : requestedStatus;
      const [thread] = await drizzle
        .select({
          id: schema.smsThreads.id,
          customerNumber: schema.smsThreads.customerNumber,
          summary: schema.smsThreads.summary,
          agentId: schema.smsThreads.agentId,
        })
        .from(schema.smsThreads)
        .where(
          and(
            eq(schema.smsThreads.id, req.params.id),
            eq(schema.smsThreads.userId, req.user.id),
          ),
        )
        .limit(1);

      if (!thread) throw AppError.fromHttpStatus(404, "SMS conversation not found.");

      const { updated, handoffTaskId, taskStateChanged } = await drizzle.transaction(async (tx) => {
        const [nextThread] = await tx
          .update(schema.smsThreads)
          .set({ status })
          .where(
            and(eq(schema.smsThreads.id, thread.id), eq(schema.smsThreads.userId, req.user.id)),
          )
          .returning();

        let nextHandoffTaskId: string | null = null;
        let nextTaskStateChanged = false;

        if (handoff) {
          const [existing] = await tx
            .select({ id: schema.followUpTasks.id })
            .from(schema.followUpTasks)
            .where(
              and(
                eq(schema.followUpTasks.userId, req.user.id),
                eq(schema.followUpTasks.sourceType, SMS_HANDOFF_SOURCE_TYPE),
                eq(schema.followUpTasks.sourceId, thread.id),
                eq(schema.followUpTasks.taskType, HUMAN_HANDOFF_TASK_TYPE),
                inArray(schema.followUpTasks.status, [...ACTIVE_HANDOFF_TASK_STATUSES]),
              ),
            )
            .limit(1);

          if (existing) {
            nextHandoffTaskId = existing.id;
          } else {
            const [task] = await tx
              .insert(schema.followUpTasks)
              .values({
                userId: req.user.id,
                sourceType: SMS_HANDOFF_SOURCE_TYPE,
                sourceId: thread.id,
                targetChannel: "manual",
                agentId: thread.agentId,
                customerInfo: { phone: thread.customerNumber },
                payload: { thread_id: thread.id, status: "escalated" },
                taskType: HUMAN_HANDOFF_TASK_TYPE,
                description: `Review SMS conversation: ${thread.customerNumber}`,
                priority: "high",
                status: "pending",
              })
              .returning({ id: schema.followUpTasks.id });
            nextHandoffTaskId = task?.id ?? null;
            nextTaskStateChanged = Boolean(task?.id);
          }
        } else {
          const handoffStatus = handoffTaskStatusForOutcome(status);
          if (handoffStatus) {
            const reconciled = await tx
              .update(schema.followUpTasks)
              .set({
                status: handoffStatus,
                resolutionNotes: handoffResolutionNote("sms", status),
              })
              .where(
                and(
                  eq(schema.followUpTasks.userId, req.user.id),
                  eq(schema.followUpTasks.sourceType, SMS_HANDOFF_SOURCE_TYPE),
                  eq(schema.followUpTasks.sourceId, thread.id),
                  eq(schema.followUpTasks.taskType, HUMAN_HANDOFF_TASK_TYPE),
                  inArray(schema.followUpTasks.status, [...ACTIVE_HANDOFF_TASK_STATUSES]),
                ),
              )
              .returning({ id: schema.followUpTasks.id });
            nextTaskStateChanged = reconciled.length > 0;
          }
        }

        return {
          updated: nextThread,
          handoffTaskId: nextHandoffTaskId,
          taskStateChanged: nextTaskStateChanged,
        };
      });

      if (taskStateChanged) touchNavCounts(req.user.id);

      res.json({
        thread: mapObjectToSnake(updated),
        handoff_task_id: handoffTaskId,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("SMS outcome update failed", {
        userId: req.user?.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Could not update the SMS outcome.");
    }
  },
);

router.get(
  "/api/sms/threads/:id/outcome",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [thread] = await drizzle
        .select({
          id: schema.smsThreads.id,
          status: schema.smsThreads.status,
          customerNumber: schema.smsThreads.customerNumber,
          summary: schema.smsThreads.summary,
          lastMessageAt: schema.smsThreads.lastMessageAt,
        })
        .from(schema.smsThreads)
        .where(
          and(
            eq(schema.smsThreads.id, req.params.id),
            eq(schema.smsThreads.userId, req.user.id),
          ),
        )
        .limit(1);
      if (!thread) throw AppError.fromHttpStatus(404, "SMS conversation not found.");

      const [handoff] = await drizzle
        .select({ id: schema.followUpTasks.id, status: schema.followUpTasks.status })
        .from(schema.followUpTasks)
        .where(
          and(
            eq(schema.followUpTasks.userId, req.user.id),
            eq(schema.followUpTasks.sourceType, SMS_HANDOFF_SOURCE_TYPE),
            eq(schema.followUpTasks.sourceId, thread.id),
            eq(schema.followUpTasks.taskType, HUMAN_HANDOFF_TASK_TYPE),
            inArray(schema.followUpTasks.status, [...ACTIVE_HANDOFF_TASK_STATUSES]),
          ),
        )
        .limit(1);

      res.json({
        thread: mapObjectToSnake(thread),
        handoff: handoff ? mapObjectToSnake(handoff) : null,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("SMS outcome read failed", {
        userId: req.user?.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Could not load the SMS outcome.");
    }
  },
);

export default router;
