import { Router, Response } from "express";
import { db, log } from "../lib/server-context";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { syncGoogleCalendar } from "../services/google-calendar-sync";
import { syncOutlookCalendar } from "../services/outlook-calendar-sync";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

router.get("/api/calendar/accounts", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const userId: string = req.user.id;
  try {
    const { data, error } = await db
      .from("wireline_calendar_accounts")
      .select("id, email_address, provider, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    res.json({ accounts: data || [] });
  } catch (e: any) { 
    log.error("Calendar accounts fetch failed", { userId, error: getErrorMessage(e) }); 
    res.status(500).json({ error: "Failed to fetch calendar accounts." }); 
  }
});

router.post("/api/calendar/sync", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const userId: string = req.user.id;
  try {
    const [googleResult, outlookResult] = await Promise.allSettled([
      syncGoogleCalendar(userId),
      syncOutlookCalendar(userId),
    ]);
    res.json({
      google:  googleResult.status === 'fulfilled'  ? googleResult.value  : { status: 'error', error: (googleResult.reason as Error)?.message },
      outlook: outlookResult.status === 'fulfilled' ? outlookResult.value : { status: 'error', error: (outlookResult.reason as Error)?.message },
    });
  } catch (e: any) {
    log.error("Calendar sync failed", { userId, error: getErrorMessage(e) });
    res.status(500).json({ error: "Calendar sync failed." });
  }
});

router.get("/api/calendar/events", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  const userId: string = req.user.id;
  try {
    const { data, error } = await db
      .from("wireline_calendar_events")
      .select("id, title, start_time, end_time, status, account_id")
      .eq("user_id", userId)
      .gte("end_time", new Date().toISOString())
      .order("start_time", { ascending: true })
      .limit(100);
    if (error) throw error;
    res.json({ events: data || [] });
  } catch (e: any) {
    log.error("Calendar events fetch failed", { userId, error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to fetch calendar events." });
  }
});

export default router;
