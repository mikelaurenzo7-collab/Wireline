import { Router, type Response } from "express";

import { AppError } from "../lib/api-error";
import {
  getComputerFrame,
  getComputerStatus,
  getComputerTask,
  listComputerTasks,
  replyToComputerTask,
  startComputerTask,
  stopComputerTask,
} from "../lib/cloud-computer/task-runner";
import { authenticateUser } from "../middleware/auth";
import { computerReadRateLimit, computerWriteRateLimit } from "../middleware/api-rate-limits";
import type { AuthenticatedRequest } from "../types/auth";

/**
 * Per-Bot cloud computer. Every route is owner-authenticated and tenant-scoped;
 * a public caller or another account can never read a task, its live frame, or
 * reply to its owner handoff.
 */
const router = Router();

function agentIdFrom(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw AppError.badRequest("Choose a Bot.");
  }
  return value;
}

router.get(
  "/api/computer/status",
  authenticateUser,
  computerReadRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json(await getComputerStatus(req.user.id));
  },
);

router.get(
  "/api/computer/tasks",
  authenticateUser,
  computerReadRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const agentId =
      typeof req.query.agentId === "string" && req.query.agentId
        ? agentIdFrom(req.query.agentId)
        : undefined;
    res.json({ tasks: await listComputerTasks(req.user.id, agentId) });
  },
);

router.post(
  "/api/computer/tasks",
  authenticateUser,
  computerWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const agentId = agentIdFrom(req.body?.agentId);
    const task = await startComputerTask(req.user.id, agentId, req.body);
    res.status(201).json({ task });
  },
);

router.get(
  "/api/computer/tasks/:taskId",
  authenticateUser,
  computerReadRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json({ task: await getComputerTask(req.user.id, String(req.params.taskId)) });
  },
);

router.get(
  "/api/computer/tasks/:taskId/frame",
  authenticateUser,
  computerReadRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    const frame = await getComputerFrame(req.user.id, String(req.params.taskId));
    res.setHeader("Cache-Control", "no-store, private");
    if (!frame) {
      res.status(204).end();
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(frame);
  },
);

router.post(
  "/api/computer/tasks/:taskId/stop",
  authenticateUser,
  computerWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json({ task: await stopComputerTask(req.user.id, String(req.params.taskId)) });
  },
);

router.post(
  "/api/computer/tasks/:taskId/reply",
  authenticateUser,
  computerWriteRateLimit,
  async (req: AuthenticatedRequest, res: Response) => {
    res.json({
      task: await replyToComputerTask(req.user.id, String(req.params.taskId), req.body),
    });
  },
);

export default router;
