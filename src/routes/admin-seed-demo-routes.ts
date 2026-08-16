/* eslint-disable @typescript-eslint/no-explicit-any -- API route handlers process heterogeneous request/response payloads and Postgres jsonb columns. */
/**
 * Owner-only endpoints for marketing/demo showcase data and founder Assistants seed.
 */

import { Router, Response } from "express";
import { AppError } from "../lib/api-error";
import { drizzle, log } from "../lib/server-context";
import { eq, and, inArray, like } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { requirePlatformAdmin } from "../middleware/platform-admin";
import { invalidateDashboard } from "../lib/dashboard-cache";
import { seedFounderAssistant, resolveFounderUserId } from "../lib/founder-fleet-seed";
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
      throw AppError.fromHttpStatus(404, `Demo user not found: ${targetEmail}`);
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
          note: "Password is set out-of-band, see ops doc.",
        },
      });
    } catch (e: any) {
      log.error("Demo seed failed", { error: e?.message, userId, targetEmail });
      throw AppError.fromHttpStatus(500, String(e?.message || "Seed failed"));
    }
  },
);

router.post(
  "/api/admin/seed-founder-Assistants",
  authenticateUser,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const targetEmail = (typeof req.body?.email === "string" && req.body.email.trim()) || undefined;
    try {
      const userId = await resolveFounderUserId(targetEmail);
      if (!userId) {
        return res.status(412).json({
          code: "ERROR",
          error: targetEmail
            ? `No user found for ${targetEmail}`
            : "OWNER_EMAIL is not set or no matching user exists.",
        });
      }
      const report = await seedFounderAssistant(userId);
      invalidateDashboard(userId);
      return res.json({ ok: true, userId, email: targetEmail || process.env.OWNER_EMAIL, report });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Founder Assistants seed failed";
      log.error("Founder Assistants seed failed", { error: msg });
      throw AppError.fromHttpStatus(500, String(msg));
    }
  },
);

router.delete(
  "/api/admin/demo-data",
  authenticateUser,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user?.id) throw AppError.fromHttpStatus(401, "Unauthorized");
    const targetEmail =
      (typeof req.query.email === "string" && req.query.email.trim()) ||
      (typeof req.body?.email === "string" && req.body.email.trim()) ||
      DEFAULT_DEMO_EMAIL;
    const userId = await resolveDemoUserId(targetEmail);
    if (!userId) {
      throw AppError.fromHttpStatus(404, `Demo user not found: ${targetEmail}`);
    }
    try {
      const readCounts = async (db: typeof drizzle) => {
        const counts = {
          call_logs: 0,
          outbound_leads: 0,
          appointments: 0,
          dnc_list: 0,
          email_threads: 0,
          sms_threads: 0,
        };
        counts.call_logs = (
          await db
            .select({ id: callLogs.id })
            .from(callLogs)
            .where(and(eq(callLogs.userId, userId), eq(callLogs.demo, true)))
        ).length;
        counts.outbound_leads = (
          await db
            .select({ id: outboundLeads.id })
            .from(outboundLeads)
            .where(and(eq(outboundLeads.userId, userId), eq(outboundLeads.demo, true)))
        ).length;
        counts.appointments = (
          await db
            .select({ id: appointments.id })
            .from(appointments)
            .where(and(eq(appointments.userId, userId), eq(appointments.demo, true)))
        ).length;
        counts.dnc_list = (
          await db
            .select({ id: dncList.id })
            .from(dncList)
            .where(and(eq(dncList.userId, userId), eq(dncList.demo, true)))
        ).length;
        counts.email_threads = (
          await db
            .select({ id: emailThreads.id })
            .from(emailThreads)
            .where(
              and(eq(emailThreads.userId, userId), like(emailThreads.threadId, "seed-email-%")),
            )
        ).length;
        counts.sms_threads = (
          await db
            .select({ id: smsThreads.id })
            .from(smsThreads)
            .where(
              and(
                eq(smsThreads.userId, userId),
                inArray(smsThreads.customerNumber, DEMO_SMS_NUMBERS),
              ),
            )
        ).length;
        return counts;
      };

      const bodyDryRun = (req.body as { dry_run?: boolean } | undefined)?.dry_run;
      const queryDryRun = (req.query.dry_run as string | undefined)?.toLowerCase();
      const dryRun = bodyDryRun !== undefined ? bodyDryRun !== false : queryDryRun !== "false";

      if (dryRun) {
        const counts = await readCounts(drizzle);
        log.info("Demo data wipe dry run", { userId, targetEmail, counts });
        return res.json({ ok: true, dry_run: true, targetEmail, userId, would_delete: counts });
      }

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
      log.info("Demo data wiped", { userId, targetEmail, counts });
      return res.json({ ok: true, dry_run: false, targetEmail, userId, deleted: counts });
    } catch (e: any) {
      log.error("Demo data wipe failed", { userId, targetEmail, error: e?.message });
      throw AppError.fromHttpStatus(500, String(e?.message || "Wipe failed"));
    }
  },
);

export default router;
