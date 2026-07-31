/* eslint-disable @typescript-eslint/no-explicit-any -- task and job payloads are stored as Postgres jsonb. */
import { Router, Response } from "express";
import { AppError, rethrowIfAppError } from "../lib/api-error";

import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc, like, ne, gte } from "drizzle-orm";
import { presenceStreams } from "../services/presence-stream-service";
import { authenticateUser, authenticateEventStream } from "../middleware/auth";
import { fleetRateLimit } from "../middleware/api-rate-limits";
import { validateBody, updateFollowUpTaskSchema } from "../lib/api-validation";
import { getErrorMessage, mapObjectToSnake } from "../lib/server-utils";
import { touchNavCounts } from "../lib/nav-counts-invalidate";
import { parseFormData, FollowUpTaskCreateSchema } from "../lib/form-validators";
import { compileActivityFeed } from "../lib/fleet-activity";
import { executeAction } from "../lib/action-engine";
import { emitServerProductEventOnce } from "../lib/product-event-server";
import type { ActionItem } from "../lib/action-types";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

const FLEET_TASK_STATUSES = ["pending", "open", "in_progress", "completed", "cancelled"] as const;

/**
 * `wireline_follow_up_tasks.agent_id` has a foreign key to `wireline_agents.id`,
 * but a foreign key only proves the agent exists — the constraint check is not
 * subject to RLS, so it happily accepts another tenant's agent id. Confirm
 * ownership explicitly before writing it onto a task, and turn a stale or
 * foreign id into a 404 instead of a foreign-key 500.
 */
async function assertOwnedAgent(agentId: string, userId: string): Promise<void> {
  const [agent] = await drizzle
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(and(eq(schema.agents.id, agentId), eq(schema.agents.userId, userId)))
    .limit(1);
  if (!agent) throw AppError.fromHttpStatus(404, "Agent not found");
}
const FLEET_TASK_PRIORITIES = ["low", "medium", "high"] as const;

router.post(
  "/api/Assistants/seed",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    // Retired: this path inserted five agents with no entitlement check and
    // blew past Free/Starter caps. Founder seeding lives on
    // POST /api/admin/seed-founder-Assistants; customers create via Studio.
    void req;
    return res.status(410).json({
      code: "FLEET_SEED_RETIRED",
      error:
        "Bulk Assistants seed is retired. Create agents from Studio, or use the founder admin seed when operating as owner.",
    });
  },
);

router.get(
  "/api/Assistants/presence",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const signals = await drizzle
        .select()
        .from(schema.signalPresence)
        .where(eq(schema.signalPresence.userId, req.user.id));

      res.json({ signals });
    } catch (error: any) {
      rethrowIfAppError(error);
      log.error("Presence fetch failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to load Assistants presence");
    }
  },
);

router.get(
  "/api/Assistants/presence/stream",
  authenticateEventStream,
  fleetRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Content-Encoding", "none");

    const userId = req.user.id;
    presenceStreams.register(userId, res);

    try {
      const signals = await drizzle
        .select()
        .from(schema.signalPresence)
        .where(eq(schema.signalPresence.userId, userId));
      res.write(`data: ${JSON.stringify({ type: "presence", signals })}\n\n`);
    } catch (error: any) {
      log.error("Failed to push initial snap to presence stream", { error: error.message });
    }

    // Vercel serverless cannot hold long-lived SSE (no LISTEN/NOTIFY + maxDuration).
    // Send the snapshot and close — Recaps falls back to /api/Assistants/presence polling.
    if (process.env.VERCEL === "1") {
      res.end();
      return;
    }

    req.on("close", () => {
      presenceStreams.unregister(userId, res);
      res.end();
    });
  },
);

router.get(
  "/api/Assistants/tasks",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Mirror the statuses PATCH can actually write. "open" was writable but
      // not filterable, so a task moved to "open" fell out of every status view.
      const VALID_STATUSES = new Set<string>(FLEET_TASK_STATUSES);
      const VALID_PRIORITIES = new Set<string>(FLEET_TASK_PRIORITIES);
      const statusFilter =
        typeof req.query.status === "string" && VALID_STATUSES.has(req.query.status)
          ? req.query.status
          : null;
      const priorityFilter =
        typeof req.query.priority === "string" && VALID_PRIORITIES.has(req.query.priority)
          ? req.query.priority
          : null;

      const whereClauses = [eq(schema.followUpTasks.userId, req.user.id)];
      if (statusFilter) whereClauses.push(eq(schema.followUpTasks.status, statusFilter));
      if (priorityFilter) whereClauses.push(eq(schema.followUpTasks.priority, priorityFilter));

      const tasks = await drizzle
        .select({
          id: schema.followUpTasks.id,
          userId: schema.followUpTasks.userId,
          sourceType: schema.followUpTasks.sourceType,
          sourceId: schema.followUpTasks.sourceId,
          targetChannel: schema.followUpTasks.targetChannel,
          agentId: schema.followUpTasks.agentId,
          customerInfo: schema.followUpTasks.customerInfo,
          // `payload` is the action body that the Account Holder reviews/approves —
          // proposed email body, contract envelope, prospect search args.
          // The ActionFeed UI reads `payload.to`, `payload.body`, etc.
          payload: schema.followUpTasks.payload,
          taskType: schema.followUpTasks.taskType,
          description: schema.followUpTasks.description,
          status: schema.followUpTasks.status,
          priority: schema.followUpTasks.priority,
          dueDate: schema.followUpTasks.dueDate,
          resolutionNotes: schema.followUpTasks.resolutionNotes,
          createdAt: schema.followUpTasks.createdAt,
          agent: {
            name: schema.agents.name,
          },
        })
        .from(schema.followUpTasks)
        .leftJoin(schema.agents, eq(schema.followUpTasks.agentId, schema.agents.id))
        .where(and(...whereClauses))
        .limit(1000);

      const sortedTasks = (tasks || []).sort((a: any, b: any) => {
        if (a.status === "completed" && b.status !== "completed") return 1;
        if (a.status !== "completed" && b.status === "completed") return -1;
        const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
        const weightA = priorityWeight[a.priority?.toLowerCase() || ""] || 0;
        const weightB = priorityWeight[b.priority?.toLowerCase() || ""] || 0;
        if (weightA !== weightB) return weightB - weightA;
        if (a.dueDate && b.dueDate)
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        return new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime();
      });

      res.json({ tasks: sortedTasks });
    } catch (error: any) {
      rethrowIfAppError(error);
      log.error("Fetch tasks failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to load Assistants tasks");
    }
  },
);

router.post(
  "/api/Assistants/tasks",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const validation = parseFormData(FollowUpTaskCreateSchema, req.body);
      if (!validation.success) {
        return res.status(400).json({
          code: "BAD_REQUEST",
          error: "Validation failed",
          errors: validation.errors,
        });
      }
      const {
        description,
        task_type,
        priority,
        source_type,
        source_id,
        target_channel,
        customer_info,
        agent_id,
        due_date,
      } = validation.data!;

      if (agent_id) await assertOwnedAgent(agent_id, req.user.id);

      await drizzle.insert(schema.followUpTasks).values({
        sourceType: source_type,
        sourceId: source_id,
        targetChannel: target_channel,
        customerInfo: customer_info,
        taskType: task_type,
        description,
        agentId: agent_id,
        status: "pending",
        userId: req.user.id,
        priority,
        dueDate: due_date ? new Date(due_date) : null,
      });
      touchNavCounts(req.user.id);
      res.json({ success: true });
    } catch (error: any) {
      rethrowIfAppError(error);
      log.error("Failed to create Assistants task", { error: error.message });
      throw AppError.fromHttpStatus(500, "Failed to create Assistants task");
    }
  },
);

router.patch(
  "/api/Assistants/tasks/:id",
  authenticateUser,
  validateBody(updateFollowUpTaskSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { status, priority, due_date, agent_id, resolution_notes, description, payload } =
        req.body;
      const updateData: any = {};
      if (status !== undefined) {
        const normalizedStatus = status === "done" ? "completed" : status;
        if (!FLEET_TASK_STATUSES.includes(normalizedStatus)) {
          return res
            .status(400)
            .json({ error: `status must be one of: ${FLEET_TASK_STATUSES.join(", ")}` });
        }
        updateData.status = normalizedStatus;
      }
      if (priority !== undefined) {
        if (!FLEET_TASK_PRIORITIES.includes(priority)) {
          return res
            .status(400)
            .json({ error: `priority must be one of: ${FLEET_TASK_PRIORITIES.join(", ")}` });
        }
        updateData.priority = priority;
      }
      if (due_date !== undefined) {
        // `due_date: null` is the documented way to clear a due date. Passing it
        // straight to `new Date()` yielded the Unix epoch (a due date of
        // 1970-01-01), and an unparseable string produced an Invalid Date that
        // threw inside the driver as an opaque 500.
        if (due_date === null || due_date === "") {
          updateData.dueDate = null;
        } else {
          const parsedDueDate = new Date(due_date);
          if (Number.isNaN(parsedDueDate.getTime())) {
            return res
              .status(400)
              .json({ code: "BAD_REQUEST", error: "due_date must be a valid date" });
          }
          updateData.dueDate = parsedDueDate;
        }
      }
      if (agent_id !== undefined) {
        if (agent_id) await assertOwnedAgent(agent_id, req.user.id);
        updateData.agentId = agent_id;
      }
      if (resolution_notes !== undefined) updateData.resolutionNotes = resolution_notes;
      if (description !== undefined) updateData.description = description;
      if (payload !== undefined && payload && typeof payload === "object") {
        updateData.payload = payload;
      }

      // Drizzle throws "No values to set" on an empty update, which surfaced as
      // a 500 for what is really a malformed request.
      if (Object.keys(updateData).length === 0) {
        return res
          .status(400)
          .json({ code: "BAD_REQUEST", error: "No supported task fields to update" });
      }

      // The where clause scopes the update to the caller, so a task belonging to
      // someone else simply matches no rows — but reporting `success: true` for
      // an update that changed nothing tells a client its edit was saved when it
      // was not. A task deleted in another tab reads back as saved and then
      // reverts on refresh. The sibling approve route below already answers 404
      // for the same case.
      const updated = (await drizzle
        .update(schema.followUpTasks)
        .set(updateData)
        .where(
          and(
            eq(schema.followUpTasks.id, req.params.id),
            eq(schema.followUpTasks.userId, req.user.id),
          ),
        )
        .returning()) as unknown[];

      if (!updated.length) {
        return res.status(404).json({ code: "NOT_FOUND", error: "Task not found" });
      }

      if (status !== undefined) touchNavCounts(req.user.id);
      res.json({ success: true });
    } catch (error: any) {
      rethrowIfAppError(error);
      log.error("Failed to update Assistants task", { error: error.message });
      throw AppError.fromHttpStatus(500, "Failed to update Assistants task");
    }
  },
);

router.post(
  "/api/Assistants/tasks/:id/approve",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const taskId = req.params.id;
      const userId = req.user.id;

      const [task] = await drizzle
        .select()
        .from(schema.followUpTasks)
        .where(and(eq(schema.followUpTasks.id, taskId), eq(schema.followUpTasks.userId, userId)))
        .limit(1);

      if (!task) {
        throw AppError.fromHttpStatus(404, "Task not found");
      }

      if (task.status === "completed") {
        throw AppError.fromHttpStatus(400, "Task is already completed");
      }

      // Prefer the structured `payload` (written by the AI Action Engine);
      // fall back to legacy `customerInfo` for rows created before
      // `wireline_follow_up_tasks.payload` existed.
      const actionItem: ActionItem = {
        type: task.taskType as any,
        priority: task.priority as any,
        payload: (task.payload as any) ?? (task.customerInfo as any) ?? {},
        agentId: task.agentId ?? undefined,
      };

      const result = await executeAction(
        userId,
        actionItem,
        {
          sourceId: task.sourceId || taskId,
          sourceType: task.sourceType || "manual_approval",
        },
        "auto",
      );

      if (result.success) {
        await drizzle
          .update(schema.followUpTasks)
          .set({ status: "completed", resolutionNotes: "Approved and executed by Account Holder" })
          .where(eq(schema.followUpTasks.id, taskId));
        touchNavCounts(userId);

        emitServerProductEventOnce({
          event: "first_next_action_approved",
          userId,
          agentId: task.agentId ?? undefined,
          metadata: {
            task_id: taskId,
            task_type: task.taskType,
          },
        });

        const taskType = (task.taskType || "").toLowerCase();
        if (
          taskType.includes("calendar") ||
          taskType.includes("book") ||
          taskType.includes("meeting")
        ) {
          emitServerProductEventOnce({
            event: "first_meeting_booked",
            userId,
            agentId: task.agentId ?? undefined,
            metadata: { task_id: taskId },
          });
        }

        res.json({ success: true });
      } else {
        res.status(500).json({
          code: "INTERNAL_ERROR",
          error: result.error || "Action execution failed",
        });
      }
    } catch (error: any) {
      rethrowIfAppError(error);
      log.error("Task approval failed", { error: getErrorMessage(error) });
      throw AppError.fromHttpStatus(500, "Failed to approve task");
    }
  },
);

router.get(
  "/api/Assistants/activity",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [logs, tasks, lessons, emails] = await drizzle.transaction((tx) =>
        Promise.all([
          tx
            .select({
              id: schema.callLogs.id,
              customerNumber: schema.callLogs.customerNumber,
              leadScore: schema.callLogs.leadScore,
              intentLabel: schema.callLogs.intentLabel,
              summary: schema.callLogs.summary,
              createdAt: schema.callLogs.createdAt,
            })
            .from(schema.callLogs)
            .where(eq(schema.callLogs.userId, req.user.id))
            .orderBy(desc(schema.callLogs.createdAt))
            .limit(5),
          tx
            .select({
              id: schema.followUpTasks.id,
              description: schema.followUpTasks.description,
              status: schema.followUpTasks.status,
              priority: schema.followUpTasks.priority,
              createdAt: schema.followUpTasks.createdAt,
            })
            .from(schema.followUpTasks)
            .where(eq(schema.followUpTasks.userId, req.user.id))
            .orderBy(desc(schema.followUpTasks.createdAt))
            .limit(5),
          tx
            .select({
              id: schema.agentLessons.id,
              lesson: schema.agentLessons.lesson,
              createdAt: schema.agentLessons.createdAt,
            })
            .from(schema.agentLessons)
            .where(eq(schema.agentLessons.userId, req.user.id))
            .orderBy(desc(schema.agentLessons.createdAt))
            .limit(5),
          tx
            .select({
              id: schema.emailThreads.id,
              customerEmail: schema.emailThreads.customerEmail,
              leadScore: schema.emailThreads.leadScore,
              intentLabel: schema.emailThreads.intentLabel,
              createdAt: schema.emailThreads.createdAt,
            })
            .from(schema.emailThreads)
            .where(eq(schema.emailThreads.userId, req.user.id))
            .orderBy(desc(schema.emailThreads.createdAt))
            .limit(5),
        ]),
      );

      const activity = compileActivityFeed({
        logs: logs || [],
        tasks: tasks || [],
        lessons: lessons || [],
        emails: emails || [],
      });

      res.json({ activity });
    } catch (e: any) {
      log.error("Activity feed error", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to fetch activity");
    }
  },
);

//  TRIAGE INBOX — "what needs my attention right now"
// ──────────────────────────────────────────────────────────

router.get("/api/triage", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [hotLeads, complianceTasks, pendingTasks, knowledgeGaps, escalations] =
      await drizzle.transaction((tx) =>
        Promise.all([
          tx
            .select({
              id: schema.callLogs.id,
              agentId: schema.callLogs.agentId,
              customerNumber: schema.callLogs.customerNumber,
              leadScore: schema.callLogs.leadScore,
              intentLabel: schema.callLogs.intentLabel,
              summary: schema.callLogs.summary,
              createdAt: schema.callLogs.createdAt,
            })
            .from(schema.callLogs)
            .where(
              and(
                eq(schema.callLogs.userId, req.user.id),
                gte(schema.callLogs.leadScore, 70),
                gte(schema.callLogs.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
              ),
            )
            .orderBy(desc(schema.callLogs.leadScore))
            .limit(30),
          tx
            .select()
            .from(schema.followUpTasks)
            .where(
              and(
                eq(schema.followUpTasks.userId, req.user.id),
                eq(schema.followUpTasks.taskType, "compliance_review"),
                eq(schema.followUpTasks.status, "pending"),
              ),
            )
            .orderBy(desc(schema.followUpTasks.createdAt))
            .limit(20),
          tx
            .select()
            .from(schema.followUpTasks)
            .where(
              and(
                eq(schema.followUpTasks.userId, req.user.id),
                eq(schema.followUpTasks.status, "pending"),
                ne(schema.followUpTasks.taskType, "compliance_review"),
              ),
            )
            .orderBy(desc(schema.followUpTasks.createdAt))
            .limit(30),
          tx
            .select({
              id: schema.agentLessons.id,
              agentId: schema.agentLessons.agentId,
              lesson: schema.agentLessons.lesson,
              createdAt: schema.agentLessons.createdAt,
            })
            .from(schema.agentLessons)
            .where(
              and(
                eq(schema.agentLessons.userId, req.user.id),
                like(schema.agentLessons.lesson, "[KNOWLEDGE GAP]%"),
              ),
            )
            .orderBy(desc(schema.agentLessons.createdAt))
            .limit(30),
          tx
            .select({
              id: schema.callLogs.id,
              agentId: schema.callLogs.agentId,
              customerNumber: schema.callLogs.customerNumber,
              leadScore: schema.callLogs.leadScore,
              summary: schema.callLogs.summary,
              createdAt: schema.callLogs.createdAt,
            })
            .from(schema.callLogs)
            .where(
              and(
                eq(schema.callLogs.userId, req.user.id),
                eq(schema.callLogs.intentLabel, "escalation"),
              ),
            )
            .orderBy(desc(schema.callLogs.createdAt))
            .limit(20),
        ]),
      );

    // UI reads snake_case (customer_number, lead_score, created_at). Drizzle
    // hands us camelCase. Normalize at the boundary so the triage card stops
    // falling back to "Unknown caller" for every entry.
    res.json({
      hot_leads: mapObjectToSnake(hotLeads || []),
      compliance: mapObjectToSnake(complianceTasks || []),
      pending_tasks: mapObjectToSnake(pendingTasks || []),
      knowledge_gaps: mapObjectToSnake(knowledgeGaps || []),
      escalations: mapObjectToSnake(escalations || []),
      counts: {
        hot_leads: hotLeads?.length || 0,
        compliance: complianceTasks?.length || 0,
        pending_tasks: pendingTasks?.length || 0,
        knowledge_gaps: knowledgeGaps?.length || 0,
        escalations: escalations?.length || 0,
      },
    });
  } catch (e: any) {
    log.error("Triage fetch failed", { error: e instanceof Error ? e.message : String(e) });
    throw AppError.fromHttpStatus(500, "Failed to fetch triage inbox");
  }
});

export default router;
