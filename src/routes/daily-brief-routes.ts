/* eslint-disable @typescript-eslint/no-explicit-any -- aggregate stats and dashboard rows draw from heterogeneous queries. */
import { Router, Response, type Request } from "express";
import { AppError } from "../lib/api-error";
import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { sendDailyBriefEmail } from "../lib/daily-brief";
import { getErrorMessage } from "../lib/server-utils";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

// Settings: GET / PUT for the daily-brief schedule.
router.get(
  "/api/daily-brief/settings",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [settings] = await drizzle
        .select({
          dailyBriefEnabled: schema.settings.dailyBriefEnabled,
          dailyBriefSendAt: schema.settings.dailyBriefSendAt,
          dailyBriefRecipient: schema.settings.dailyBriefRecipient,
          dailyBriefLastSentAt: schema.settings.dailyBriefLastSentAt,
          dailyBriefLastError: schema.settings.dailyBriefLastError,
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
      throw AppError.fromHttpStatus(500, "Failed to load settings");
    }
  },
);

router.put(
  "/api/daily-brief/settings",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const enabled = req.body?.enabled === true;
      const send_at = (req.body?.send_at || "13:00").toString();
      if (!/^\d{2}:\d{2}$/.test(send_at))
        throw AppError.fromHttpStatus(400, "send_at must be HH:MM (UTC).");
      const [hh, mm] = send_at.split(":").map(Number);
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59)
        throw AppError.fromHttpStatus(400, "send_at must be a valid HH:MM.");
      const recipient = (req.body?.recipient || "").toString().trim() || null;
      if (recipient && !/^\S+@\S+\.\S+$/.test(recipient))
        throw AppError.fromHttpStatus(400, "recipient must be a valid email.");

      await drizzle
        .insert(schema.settings)
        .values({
          id: req.user.id,
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
          },
        });

      res.json({ success: true });
    } catch (e: any) {
      log.error("Failed to save settings", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to save settings");
    }
  },
);

// Send-now — Account Holder-triggered preview email.
router.post(
  "/api/daily-brief/send-now",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await sendDailyBriefEmail(req.user.id, { force: true });
      res.json({ success: true, ...result });
    } catch (e: any) {
      const err = e as { code?: string; message?: string };
      if (err?.code === "CLAUDE_OFFLINE")
        return res.status(503).json({ error: err.message, code: err.code });
      throw AppError.fromHttpStatus(500, "Send failed");
    }
  },
);

/** Vercel cron: send daily briefs for all account holders with the feature enabled (Bearer CRON_SECRET). */
router.post("/api/daily-brief/schedule", async (req: Request, res: Response) => {
  const expected = process.env.CRON_SECRET || "";
  const authz = String(req.headers.authorization || "");
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : "";
  const ok =
    expected.length >= 16 &&
    token.length === expected.length &&
    cryptoTimingSafeEqual(Buffer.from(token, "utf8"), Buffer.from(expected, "utf8"));
  if (!ok) {
    throw AppError.fromHttpStatus(401, "Unauthorized");
  }

  try {
    const rows = await drizzle
      .select({ userId: schema.settings.userId })
      .from(schema.settings)
      .where(eq(schema.settings.dailyBriefEnabled, true));

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const uid = row.userId;
      if (!uid) continue;
      try {
        await sendDailyBriefEmail(uid, { force: false });
        sent++;
      } catch (e: unknown) {
        const msg = getErrorMessage(e);
        if (
          msg.includes("No recipient") ||
          msg.includes("No connected Gmail") ||
          msg.includes("CLAUDE_OFFLINE") ||
          msg.includes("Claude required")
        ) {
          skipped++;
        } else {
          failed++;
          if (errors.length < 5) errors.push(`${uid}: ${msg}`);
        }
        log.warn("Daily brief cron: user skipped or failed", { userId: uid, error: msg });
      }
    }

    res.json({ ok: true, enabled_users: rows.length, sent, skipped, failed, errors });
  } catch (e: unknown) {
    log.error("Daily brief schedule failed", { error: getErrorMessage(e) });
    throw AppError.fromHttpStatus(500, "Schedule run failed");
  }
});

export default router;
