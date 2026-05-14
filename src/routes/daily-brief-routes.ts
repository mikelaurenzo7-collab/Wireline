import { Router, Response } from "express";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { sendDailyBriefEmail } from "../lib/daily-brief";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

// Settings: GET / PUT for the daily-brief schedule.
router.get("/api/daily-brief/settings", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [settings] = await drizzle
      .select({
        dailyBriefEnabled: schema.settings.dailyBriefEnabled,
        dailyBriefSendAt: schema.settings.dailyBriefSendAt,
        dailyBriefRecipient: schema.settings.dailyBriefRecipient,
        dailyBriefLastSentAt: schema.settings.dailyBriefLastSentAt,
        dailyBriefLastError: schema.settings.dailyBriefLastError
      })
      .from(schema.settings)
      .where(eq(schema.settings.userId, req.user.id))
      .limit(1);

    const accounts = await drizzle
      .select({ emailAddress: schema.emailAccounts.emailAddress })
      .from(schema.emailAccounts)
      .where(eq(schema.emailAccounts.userId, req.user.id))
      .limit(1);

    res.json({
      settings: {
        enabled: !!settings?.dailyBriefEnabled,
        send_at: settings?.dailyBriefSendAt || "13:00",
        recipient: settings?.dailyBriefRecipient || req.user.email || null,
        last_sent_at: settings?.dailyBriefLastSentAt || null,
        last_error: settings?.dailyBriefLastError || null,
      },
      gmail_connected: !!accounts?.[0]?.emailAddress,
      gmail_address: accounts?.[0]?.emailAddress || null,
    });
  } catch (e: any) {
    log.error("Failed to load settings", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to load settings" });
  }
});

router.put("/api/daily-brief/settings", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const enabled = req.body?.enabled === true;
    const send_at = (req.body?.send_at || "13:00").toString();
    if (!/^\d{2}:\d{2}$/.test(send_at)) return res.status(400).json({ error: "send_at must be HH:MM (UTC)." });
    const [hh, mm] = send_at.split(":").map(Number);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return res.status(400).json({ error: "send_at must be a valid HH:MM." });
    const recipient = (req.body?.recipient || "").toString().trim() || null;
    if (recipient && !/^\S+@\S+\.\S+$/.test(recipient)) return res.status(400).json({ error: "recipient must be a valid email." });

    await drizzle
      .insert(schema.settings)
      .values({
        userId: req.user.id,
        dailyBriefEnabled: enabled,
        dailyBriefSendAt: send_at,
        dailyBriefRecipient: recipient,
      })
      .onConflictDoUpdate({
        target: schema.settings.userId,
        set: {
          dailyBriefEnabled: enabled,
          dailyBriefSendAt: send_at,
          dailyBriefRecipient: recipient,
        }
      });

    res.json({ success: true });
  } catch (e: any) {
    log.error("Failed to save settings", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// Send-now — operator-triggered preview email.
router.post("/api/daily-brief/send-now", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await sendDailyBriefEmail(req.user.id, { force: true });
    res.json({ success: true, ...result });
  } catch (e: any) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "CLAUDE_OFFLINE") return res.status(503).json({ error: err.message, code: err.code });
    res.status(500).json({ error: "Send failed" });
  }
});

export default router;
