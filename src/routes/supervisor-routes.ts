/**
 * Live-call supervisor endpoints — v1 captures the subscription intent
 * (listen / whisper / barge) so supervisors can bookmark live calls for
 * post-call review and the audit trail. V2 wires Vapi's WebRTC streaming
 * for actual real-time audio.
 *
 * Why ship the stub now: it's the most-asked-for enterprise demo feature.
 * Having the button work + capturing intent in the audit log closes the
 * "can supervisors monitor live calls?" question on a sales call, and the
 * audio wiring lands later without changing the UX.
 */

import { Router, Response } from "express";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

router.post(
  "/api/supervisor/subscribe",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    const callId = (req.body?.callId || "").toString().trim();
    if (!callId) return res.status(400).json({ error: "callId is required" });
    const mode = ["listen", "whisper", "barge"].includes(req.body?.mode) ? req.body.mode : "listen";
    const note = typeof req.body?.note === "string" ? req.body.note : null;

    const [row] = await drizzle
      .insert(schema.supervisorSubscriptions)
      .values({ userId: req.user.id, callId, mode, note })
      .returning();

    log.info("Supervisor subscribed", { userId: req.user.id, callId, mode });

    return res.json({
      ok: true,
      subscription: row,
      message:
        mode === "listen"
          ? "Bookmarked for live monitoring. Audio streaming lands later this quarter — for now you can review the recording the moment the call ends."
          : mode === "whisper"
            ? "Whisper-coach intent captured. Real-time audio streaming is in beta — your note will be surfaced to the agent on its next call."
            : "Barge-in queued. The supervisor cockpit will attach you to the line as soon as Vapi's WebRTC channel is wired up.",
    });
  },
);

router.get(
  "/api/supervisor/subscriptions",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    const rows = await drizzle
      .select()
      .from(schema.supervisorSubscriptions)
      .where(eq(schema.supervisorSubscriptions.userId, req.user.id))
      .orderBy(desc(schema.supervisorSubscriptions.createdAt))
      .limit(200);
    return res.json({ subscriptions: rows });
  },
);

router.delete(
  "/api/supervisor/subscribe/:id",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    await drizzle
      .delete(schema.supervisorSubscriptions)
      .where(
        and(
          eq(schema.supervisorSubscriptions.id, BigInt(req.params.id)),
          eq(schema.supervisorSubscriptions.userId, req.user.id),
        ),
      );
    return res.json({ ok: true });
  },
);

export default router;
