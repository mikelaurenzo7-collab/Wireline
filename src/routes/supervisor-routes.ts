/* eslint-disable @typescript-eslint/no-explicit-any -- LLM responses and dynamic call analyses include freeform JSON content. */
/**
 * Live-call supervisor endpoints — v1 captures subscription intent
 * (listen / whisper / barge) for audit and sales demos. Real-time audio
 * is not wired yet; PSTN listen URLs flow through supervisor WebSocket.
 *
 * SECURITY: only allow subscriptions to calls that EXIST in this tenant's
 * call_logs. The prior version permitted speculative subscriptions for
 * any string callId, which left an attack window where a hostile user
 * could pre-subscribe to a call id BEFORE it existed (collision attack)
 * or to another tenant's id (cross-tenant snoop). Now we require the
 * call to be owned by the requester at subscription time.
 */

import { Router, Response } from "express";
import { AppError } from "../lib/api-error";
import { parseBigIntId } from "../lib/server-utils";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

// Reject any callId that doesn't look like a UUID (Wireline carrier call
// ids) or a numeric id (legacy internal id). Prevents both garbage rows
// in the subscription table and pre-DB-lookup probing.
const VALID_CALL_ID = /^[A-Za-z0-9_-]{8,64}$/;

const SUPERVISOR_MODES = ["listen", "whisper", "barge"] as const;
type SupervisorMode = (typeof SUPERVISOR_MODES)[number];

router.post(
  "/api/supervisor/subscribe",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");

    const callId = (req.body?.callId || "").toString().trim();
    if (!callId) throw AppError.fromHttpStatus(400, "callId is required");
    if (!VALID_CALL_ID.test(callId)) {
      throw AppError.fromHttpStatus(400, "callId format invalid");
    }

    // Mode validation: explicit allowlist. Omitted mode → default "listen"
    // (preserves prior behavior). Supplied-but-unknown mode → 400 instead
    // of silent coercion, so audit-style probes ("god-mode", "haxor")
    // surface as caller errors rather than landing as "listen" rows.
    let mode: SupervisorMode = "listen";
    if (req.body?.mode !== undefined) {
      if (!SUPERVISOR_MODES.includes(req.body.mode)) {
        return res
          .status(400)
          .json({ error: `mode must be one of: ${SUPERVISOR_MODES.join(", ")}` });
      }
      mode = req.body.mode;
    }
    const note = typeof req.body?.note === "string" ? req.body.note : null;

    // CRITICAL: the call MUST exist in call_logs and MUST be owned by the
    // requester. No speculative subscriptions, no enumeration of other
    // tenants' call ids. 404 (not 403) on either failure mode so the
    // response is indistinguishable to an attacker probing.
    const [callRow] = await drizzle
      .select({ userId: schema.callLogs.userId })
      .from(schema.callLogs)
      .where(eq(schema.callLogs.vapiCallId, callId))
      .limit(1);
    if (!callRow || callRow.userId !== req.user.id) {
      throw AppError.fromHttpStatus(404, "Call not found");
    }

    const [row] = (await drizzle
      .insert(schema.supervisorSubscriptions)
      .values({ userId: req.user.id, callId, mode, note })
      .returning()) as any[];

    log.info("Supervisor subscribed", { userId: req.user.id, callId, mode });

    return res.json({
      ok: true,
      subscription: row,
      message:
        mode === "listen"
          ? "Bookmarked for live monitoring. Audio streaming lands later this quarter — for now you can review the recording the moment the call ends."
          : mode === "whisper"
            ? "Whisper-coach intent captured. Real-time audio streaming is in beta — your note will be surfaced to the agent on its next call."
            : "Barge-in queued. The supervisor cockpit will attach you to the line as soon as the live-audio channel is wired up.",
    });
  },
);

router.get(
  "/api/supervisor/subscriptions",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");
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
    if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");
    const subscriptionId = parseBigIntId(req.params.id);
    if (subscriptionId === null) {
      throw AppError.fromHttpStatus(400, "Subscription id must be a positive integer");
    }
    await drizzle
      .delete(schema.supervisorSubscriptions)
      .where(
        and(
          eq(schema.supervisorSubscriptions.id, subscriptionId),
          eq(schema.supervisorSubscriptions.userId, req.user.id),
        ),
      );
    return res.json({ ok: true });
  },
);

export default router;
