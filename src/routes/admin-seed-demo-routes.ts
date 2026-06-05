/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
/**
 * Owner-only endpoints for marketing/demo showcase data and founder fleet seed.
 */

import { Router, Response } from "express";
import { drizzle, log } from "../lib/server-context";
import { eq, and, inArray, like } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { requirePlatformAdmin } from "../middleware/platform-admin";
import { invalidateDashboard } from "../lib/dashboard-cache";
import { seedFounderFleet, resolveFounderUserId } from "../lib/founder-fleet-seed";
import {
  DEFAULT_DEMO_EMAIL,
  DEMO_SMS_NUMBERS,
  resolveDemoUserId,
  seedDemoAccountData,
  ensureDemoProSubscription,
} from "../lib/demo-account-seed";
import type { AuthenticatedRequest } from "../types/auth";
import {
  callLogs,
  outboundLeads,
  appointments,
  dncList,
  emailThreads,
  emailMessages,
  smsThreads,
  smsMessages,
} from "../db/schema";

const router = Router();

router.post(
  "/api/admin/seed-demo-account",
  authenticateUser,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const targetEmail =
      (typeof req.body?.email === "string" && req.body.email.trim()) || DEFAULT_DEMO_EMAIL;

    const userId = await resolveDemoUserId(targetEmail);
    if (!userId) {
      return res.status(404).json({ error: `Demo user not found: ${targetEmail}` });
    }

    try {
      await ensureDemoProSubscription(userId);
      const { agentId, report } = await seedDemoAccountData(userId);
      return res.json({
        ok: true,
        targetEmail,
        userId,
        agentId,
        report,
        loginInstructions: {
          email: targetEmail,
          note: "Password is set out-of-band — see ops doc.",
        },
      });
    } catch (e: any) {
      log.error("Demo seed failed", { error: e?.message, userId, targetEmail });
      return res.status(500).json({ error: e?.message || "Seed failed" });
    }
  },
);

router.post(
  "/api/admin/seed-founder-fleet",
  authenticateUser,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const targetEmail = (typeof req.body?.email === "string" && req.body.email.trim()) || undefined;
    try {
      const userId = await resolveFounderUserId(targetEmail);
      if (!userId) {
        return res.status(412).json({
          error: targetEmail
            ? `No user found for ${targetEmail}`
            : "OWNER_EMAIL is not set or no matching user exists.",
        });
      }
      const report = await seedFounderFleet(userId);
      invalidateDashboard(userId);
      return res.json({ ok: true, userId, email: targetEmail || process.env.OWNER_EMAIL, report });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Founder fleet seed failed";
      log.error("Founder fleet seed failed", { error: msg });
      return res.status(500).json({ error: msg });
    }
  },
);

router.delete(
  "/api/admin/demo-data",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) return res.status(401).json({ error: "Unauthorized" });
    const userId = req.user.id;
    try {
      const counts = {
        call_logs: 0,
        outbound_leads: 0,
        appointments: 0,
        dnc_list: 0,
        email_threads: 0,
        sms_threads: 0,
      };
      await drizzle.transaction(async (tx) => {
        const r1 = await tx
          .delete(callLogs)
          .where(and(eq(callLogs.userId, userId), eq(callLogs.demo, true)))
          .returning({ id: callLogs.id });
        counts.call_logs = r1.length;
        const r2 = await tx
          .delete(outboundLeads)
          .where(and(eq(outboundLeads.userId, userId), eq(outboundLeads.demo, true)))
          .returning({ id: outboundLeads.id });
        counts.outbound_leads = r2.length;
        const r3 = await tx
          .delete(appointments)
          .where(and(eq(appointments.userId, userId), eq(appointments.demo, true)))
          .returning({ id: appointments.id });
        counts.appointments = r3.length;
        const r4 = await tx
          .delete(dncList)
          .where(and(eq(dncList.userId, userId), eq(dncList.demo, true)))
          .returning({ id: dncList.id });
        counts.dnc_list = r4.length;

        const seedEmails = await tx
          .select({ id: emailThreads.id })
          .from(emailThreads)
          .where(and(eq(emailThreads.userId, userId), like(emailThreads.threadId, "seed-email-%")));
        for (const row of seedEmails) {
          await tx.delete(emailMessages).where(eq(emailMessages.threadId, row.id));
        }
        const r5 = await tx
          .delete(emailThreads)
          .where(and(eq(emailThreads.userId, userId), like(emailThreads.threadId, "seed-email-%")))
          .returning({ id: emailThreads.id });
        counts.email_threads = r5.length;

        const seedSms = await tx
          .select({ id: smsThreads.id })
          .from(smsThreads)
          .where(
            and(
              eq(smsThreads.userId, userId),
              inArray(smsThreads.customerNumber, DEMO_SMS_NUMBERS),
            ),
          );
        for (const row of seedSms) {
          await tx.delete(smsMessages).where(eq(smsMessages.threadId, row.id));
        }
        const r6 = await tx
          .delete(smsThreads)
          .where(
            and(
              eq(smsThreads.userId, userId),
              inArray(smsThreads.customerNumber, DEMO_SMS_NUMBERS),
            ),
          )
          .returning({ id: smsThreads.id });
        counts.sms_threads = r6.length;
      });

      invalidateDashboard(userId);
      log.info("Demo data wiped", { userId, counts });
      return res.json({ ok: true, deleted: counts });
    } catch (e: any) {
      log.error("Demo data wipe failed", { userId, error: e?.message });
      return res.status(500).json({ error: e?.message || "Wipe failed" });
    }
  },
);

export default router;
