import { Router, Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { AppError } from "../lib/api-error";
import {
  ACTIVE_HANDOFF_TASK_STATUSES,
  conversationOutcomeSchema,
  handoffResolutionNote,
  handoffTaskStatusForOutcome,
} from "../lib/conversation-outcome";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import { validateBody } from "../lib/api-validation";
import type { AuthenticatedRequest } from "../types/auth";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import { touchNavCounts } from "../lib/nav-counts-invalidate";

const router = Router();
const EMAIL_HANDOFF_SOURCE_TYPE = "email_thread";
const HUMAN_HANDOFF_TASK_TYPE = "human_handoff";

/**
 * Outcome Center action for an email thread. Status is intentionally explicit:
 * it represents the account holder's approved operating state, not an AI guess.
 * A handoff also becomes a durable follow-up task so the request cannot vanish
 * behind a UI notification.
 *
 * Conversation state and handoff state are kept bidirectionally coherent here:
 * leaving `escalated` completes or withdraws any still-active human handoff,
 * preventing a resolved thread from remaining in the operator queue.
 */
router.patch(
  "/api/emails/threads/:id/outcome",
  authenticateUser,
  validateBody(conversationOutcomeSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status: requestedStatus, handoff } = req.body;
      const status = handoff ? "escalated" : requestedStatus;
      const [thread] = await drizzle
        .select({
          id: schema.emailThreads.id,
          subject: schema.emailThreads.subject,
          customerEmail: schema.emailThreads.customerEmail,
          summary: schema.emailThreads.summary,
          agentId: schema.emailThreads.agentId,
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

      const { updated, handoffTaskId, taskStateChanged } = await drizzle.transaction(async (tx) => {
        const [nextThread] = await tx
          .update(schema.emailThreads)
          .set({ status })
          .where(
            and(eq(schema.emailThreads.id, thread.id), eq(schema.emailThreads.userId, req.user.id)),
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
                eq(schema.followUpTasks.sourceType, EMAIL_HANDOFF_SOURCE_TYPE),
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
                sourceType: EMAIL_HANDOFF_SOURCE_TYPE,
                sourceId: thread.id,
                targetChannel: "manual",
                agentId: thread.agentId,
                customerInfo: { email: thread.customerEmail },
                payload: { thread_id: thread.id, status: "escalated" },
                taskType: HUMAN_HANDOFF_TASK_TYPE,
                description: `Review email conversation: ${thread.subject || "Untitled conversation"}`,
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
                resolutionNotes: handoffResolutionNote("email", status),
              })
              .where(
                and(
                  eq(schema.followUpTasks.userId, req.user.id),
                  eq(schema.followUpTasks.sourceType, EMAIL_HANDOFF_SOURCE_TYPE),
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
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("email outcome update failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Could not update the email outcome.");
    }
  },
);

router.get(
  "/api/emails/threads/:id/outcome",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [thread] = await drizzle
        .select({
          id: schema.emailThreads.id,
          status: schema.emailThreads.status,
          subject: schema.emailThreads.subject,
          customerEmail: schema.emailThreads.customerEmail,
          summary: schema.emailThreads.summary,
          lastMessageAt: schema.emailThreads.lastMessageAt,
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

      const messages = await drizzle
        .select({
          id: schema.emailMessages.id,
          role: schema.emailMessages.role,
          content: schema.emailMessages.content,
          createdAt: schema.emailMessages.createdAt,
        })
        .from(schema.emailMessages)
        .where(
          and(
            eq(schema.emailMessages.threadId, thread.id),
            eq(schema.emailMessages.userId, req.user.id),
          ),
        )
        .orderBy(schema.emailMessages.createdAt);

      const [handoff] = await drizzle
        .select({ id: schema.followUpTasks.id, status: schema.followUpTasks.status })
        .from(schema.followUpTasks)
        .where(
          and(
            eq(schema.followUpTasks.userId, req.user.id),
            eq(schema.followUpTasks.sourceType, EMAIL_HANDOFF_SOURCE_TYPE),
            eq(schema.followUpTasks.sourceId, thread.id),
            eq(schema.followUpTasks.taskType, HUMAN_HANDOFF_TASK_TYPE),
            inArray(schema.followUpTasks.status, [...ACTIVE_HANDOFF_TASK_STATUSES]),
          ),
        )
        .limit(1);

      res.json({
        thread: mapObjectToSnake(thread),
        messages: mapObjectToSnake(messages),
        handoff: handoff ? mapObjectToSnake(handoff) : null,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("email outcome read failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Could not load the email outcome.");
    }
  },
);

export default router;
