import { Router, Response } from "express";
import { db, log } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { sendDailyBriefEmail } from "../lib/daily-brief";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

// Settings: GET / PUT for the daily-brief schedule.
router.get("/api/daily-brief/settings", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data } = await db.from("wireline_settings")
      .select("daily_brief_enabled, daily_brief_send_at, daily_brief_recipient, daily_brief_last_sent_at, daily_brief_last_error")
      .eq("user_id", req.user.id).maybeSingle();
    const { data: accounts } = await db.from("wireline_email_accounts")
      .select("email_address").eq("user_id", req.user.id).limit(1);
    res.json({
      settings: {
        enabled: !!data?.daily_brief_enabled,
        send_at: data?.daily_brief_send_at || "13:00",
        recipient: data?.daily_brief_recipient || req.user.email || null,
        last_sent_at: data?.daily_brief_last_sent_at || null,
        last_error: data?.daily_brief_last_error || null,
      },
      gmail_connected: !!accounts?.[0]?.email_address,
      gmail_address: accounts?.[0]?.email_address || null,
    });
  } catch (e: unknown) {
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

    await db.from("wireline_settings").upsert({
      user_id: req.user.id,
      daily_brief_enabled: enabled,
      daily_brief_send_at: send_at,
      daily_brief_recipient: recipient,
    }, { onConflict: "user_id" });

    res.json({ success: true });
  } catch (e: unknown) {
    log.error("Failed to save settings", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// Send-now — operator-triggered preview email.
router.post("/api/daily-brief/send-now", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await sendDailyBriefEmail(req.user.id, { force: true });
    res.json({ success: true, ...result });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "CLAUDE_OFFLINE") return res.status(503).json({ error: err.message, code: err.code });
    res.status(500).json({ error: "Send failed" });
  }
});

export default router;
