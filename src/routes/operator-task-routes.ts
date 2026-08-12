import { Router, type NextFunction, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";

import { AppError } from "../lib/api-error";
import { ACTIVE_HANDOFF_TASK_STATUSES } from "../lib/conversation-outcome";
import { touchNavCounts } from "../lib/nav-counts-invalidate";
import { drizzle, log } from "../lib/server-context";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import * as schema from "../db/schema";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();
const HUMAN_HANDOFF_TASK_TYPE = "human_handoff";

type HandoffSourceType = "email_thread" | "sms_thread";

async function syncConversationFromHandoff(
  tx: Parameters<Parameters<typeof drizzle.transaction>[0]>[0],
  input: {
    userId: string;
    sourceType: string | null;
    sourceId: string | null;
    status: "resolved" | "open" | "escalated";
  },
): Promise<void> {
  if (!input.sourceId) return;
  const sourceType = input.sourceType as HandoffSourceType | null;
  if (sourceType === "email_thread") {
    await tx
      .update(schema.emailThreads)
      .set({ status: input.status })
      .where(
        and(
          eq(schema.emailThreads.id, input.sourceId),
          eq(schema.emailThreads.userId, input.userId),
        ),
      );
  } else if (sourceType === "sms_thread") {
    await tx
      .update(schema.smsThreads)
      .set({ status: input.status })
      .where(
        and(eq(schema.smsThreads.id, input.sourceId), eq(schema.smsThreads.userId, input.userId)),
      );
  }
}

/**
 * The canonical task route accepts one concrete status at a time. Approvals is
 * an operator work queue, so `status=active` means every still-owned state —
 * pending, open, or in progress — without widening the public task semantics.
 */
router.get(
  "/api/Assistants/tasks",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.query.status !== "active") return next();
    try {
      const tasks = await drizzle
        .select({
          id: schema.followUpTasks.id,
          userId: schema.followUpTasks.userId,
          sourceType: schema.followUpTasks.sourceType,
          sourceId: schema.followUpTasks.sourceId,
          targetChannel: schema.followUpTasks.targetChannel,
          agentId: schema.followUpTasks.agentId,
          customerInfo: schema.followUpTasks.customerInfo,
          payload: schema.followUpTasks.payload,
          taskType: schema.followUpTasks.taskType,
          description: schema.followUpTasks.description,
          status: schema.followUpTasks.status,
          priority: schema.followUpTasks.priority,
          dueDate: schema.followUpTasks.dueDate,
          resolutionNotes: schema.followUpTasks.resolutionNotes,
          createdAt: schema.followUpTasks.createdAt,
          agent: { name: schema.agents.name },
        })
        .from(schema.followUpTasks)
        .leftJoin(schema.agents, eq(schema.followUpTasks.agentId, schema.agents.id))
        .where(
          and(
            eq(schema.followUpTasks.userId, req.user.id),
            inArray(schema.followUpTasks.status, [...ACTIVE_HANDOFF_TASK_STATUSES]),
          ),
        )
        .orderBy(desc(schema.followUpTasks.createdAt))
        .limit(1000);

      res.setHeader("Cache-Control", "private, no-store, max-age=0");
      res.json({ tasks: mapObjectToSnake(tasks || []) });
    } catch (error) {
      log.error("Fetch active operator tasks failed", {
        userId: req.user?.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Failed to load active operator work");
    }
  },
);

/**
 * A human handoff is not an ActionItem. Shadow the generic approve route only
 * for this task type so the UI can say Complete without passing unsupported
 * `human_handoff` into the AI action engine. Other task types fall through to
 * the canonical action approval route unchanged.
 */
router.post(
  "/api/Assistants/tasks/:id/approve",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const [task] = await drizzle
        .select({
          id: schema.followUpTasks.id,
          taskType: schema.followUpTasks.taskType,
          status: schema.followUpTasks.status,
          sourceType: schema.followUpTasks.sourceType,
          sourceId: schema.followUpTasks.sourceId,
        })
        .from(schema.followUpTasks)
        .where(
          and(eq(schema.followUpTasks.id, req.params.id), eq(schema.followUpTasks.userId, req.user.id)),
        )
        .limit(1);

      if (!task || task.taskType !== HUMAN_HANDOFF_TASK_TYPE) return next();
      if (task.status === "completed") return res.json({ success: true, already_completed: true });
      if (!ACTIVE_HANDOFF_TASK_STATUSES.includes(task.status as (typeof ACTIVE_HANDOFF_TASK_STATUSES)[number])) {
        throw AppError.fromHttpStatus(409, "This handoff is no longer active.");
      }

      await drizzle.transaction(async (tx) => {
        const completed = await tx
          .update(schema.followUpTasks)
          .set({
            status: "completed",
            resolutionNotes: "Human handoff completed from Approvals",
          })
          .where(
            and(
              eq(schema.followUpTasks.id, task.id),
              eq(schema.followUpTasks.userId, req.user.id),
              inArray(schema.followUpTasks.status, [...ACTIVE_HANDOFF_TASK_STATUSES]),
            ),
          )
          .returning({ id: schema.followUpTasks.id });
        if (!completed.length) {
          throw AppError.fromHttpStatus(409, "This handoff changed in another session.");
        }
        await syncConversationFromHandoff(tx, {
          userId: req.user.id,
          sourceType: task.sourceType,
          sourceId: task.sourceId,
          status: "resolved",
        });
      });

      touchNavCounts(req.user.id);
      res.json({ success: true, manual_handoff: true });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Complete human handoff failed", {
        userId: req.user?.id,
        taskId: req.params.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Could not complete this handoff");
    }
  },
);

router.post(
  "/api/Assistants/tasks/:id/dismiss-handoff",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [task] = await drizzle
        .select({
          id: schema.followUpTasks.id,
          taskType: schema.followUpTasks.taskType,
          status: schema.followUpTasks.status,
          sourceType: schema.followUpTasks.sourceType,
          sourceId: schema.followUpTasks.sourceId,
        })
        .from(schema.followUpTasks)
        .where(
          and(eq(schema.followUpTasks.id, req.params.id), eq(schema.followUpTasks.userId, req.user.id)),
        )
        .limit(1);

      if (!task) throw AppError.fromHttpStatus(404, "Task not found");
      if (task.taskType !== HUMAN_HANDOFF_TASK_TYPE) {
        throw AppError.fromHttpStatus(400, "Only human handoffs can use this route.");
      }
      if (!ACTIVE_HANDOFF_TASK_STATUSES.includes(task.status as (typeof ACTIVE_HANDOFF_TASK_STATUSES)[number])) {
        throw AppError.fromHttpStatus(409, "This handoff is no longer active.");
      }

      await drizzle.transaction(async (tx) => {
        const dismissed = await tx
          .update(schema.followUpTasks)
          .set({
            status: "cancelled",
            resolutionNotes: "Human handoff dismissed from Approvals",
          })
          .where(
            and(
              eq(schema.followUpTasks.id, task.id),
              eq(schema.followUpTasks.userId, req.user.id),
              inArray(schema.followUpTasks.status, [...ACTIVE_HANDOFF_TASK_STATUSES]),
            ),
          )
          .returning({ id: schema.followUpTasks.id });
        if (!dismissed.length) {
          throw AppError.fromHttpStatus(409, "This handoff changed in another session.");
        }
        await syncConversationFromHandoff(tx, {
          userId: req.user.id,
          sourceType: task.sourceType,
          sourceId: task.sourceId,
          status: "open",
        });
      });

      touchNavCounts(req.user.id);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof AppError) throw error;
      log.error("Dismiss human handoff failed", {
        userId: req.user?.id,
        taskId: req.params.id,
        error: getErrorMessage(error),
      });
      throw AppError.fromHttpStatus(500, "Could not dismiss this handoff");
    }
  },
);

export default router;
