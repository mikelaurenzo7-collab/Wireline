import { Router, Response } from "express";
import { drizzle, log } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, gte, desc, asc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { syncGoogleCalendar } from "../services/google-calendar-sync";
import { syncOutlookCalendar } from "../services/outlook-calendar-sync";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

router.get(
  "/api/calendar/accounts",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId: string = req.user.id;
    try {
      const data = await drizzle
        .select({
          id: schema.calendarAccounts.id,
          provider: schema.calendarAccounts.provider,
          createdAt: schema.calendarAccounts.createdAt,
        })
        .from(schema.calendarAccounts)
        .where(eq(schema.calendarAccounts.userId, userId))
        .orderBy(desc(schema.calendarAccounts.createdAt));

      res.json({ accounts: data || [] });
    } catch (e: any) {
      log.error("Calendar accounts fetch failed", { userId, error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to fetch calendar accounts." });
    }
  },
);

router.post(
  "/api/calendar/sync",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId: string = req.user.id;
    try {
      const [googleResult, outlookResult] = await Promise.allSettled([
        syncGoogleCalendar(userId),
        syncOutlookCalendar(userId),
      ]);
      res.json({
        google:
          googleResult.status === "fulfilled"
            ? googleResult.value
            : { status: "error", error: (googleResult.reason as Error)?.message },
        outlook:
          outlookResult.status === "fulfilled"
            ? outlookResult.value
            : { status: "error", error: (outlookResult.reason as Error)?.message },
      });
    } catch (e: any) {
      log.error("Calendar sync failed", { userId, error: getErrorMessage(e) });
      res.status(500).json({ error: "Calendar sync failed." });
    }
  },
);

router.get(
  "/api/calendar/events",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId: string = req.user.id;
    try {
      const data = await drizzle
        .select({
          id: schema.calendarEvents.id,
          title: schema.calendarEvents.title,
          startTime: schema.calendarEvents.startTime,
          endTime: schema.calendarEvents.endTime,
          status: schema.calendarEvents.status,
          accountId: schema.calendarEvents.accountId,
        })
        .from(schema.calendarEvents)
        .where(
          and(
            eq(schema.calendarEvents.userId, userId),
            gte(schema.calendarEvents.endTime, new Date()),
          ),
        )
        .orderBy(asc(schema.calendarEvents.startTime))
        .limit(100);

      res.json({ events: data || [] });
    } catch (e: any) {
      log.error("Calendar events fetch failed", { userId, error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to fetch calendar events." });
    }
  },
);

export default router;
