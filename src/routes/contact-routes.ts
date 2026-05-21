import { Router, Response } from "express";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql, desc, ilike } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { normalizePhoneTail, buildContactProfile } from "../lib/contact-profile";
import { claudeErr } from "../lib/claude-response-helpers";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

// ──────────────────────────────────────────────────────────
//  CONTACT PROFILE — unified per-customer history
// ──────────────────────────────────────────────────────────

router.get(
  "/api/contacts/:number",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const number = decodeURIComponent(req.params.number);
      const norm = normalizePhoneTail(number);
      if (!norm) return res.status(400).json({ error: "Invalid phone number." });

      // 1. Get lead dossier to find email address
      const [dossier] = await drizzle
        .select({ customerEmail: schema.leadDossiers.customerEmail })
        .from(schema.leadDossiers)
        .where(
          and(
            eq(schema.leadDossiers.userId, req.user.id),
            ilike(schema.leadDossiers.customerNumber, `%${norm}`),
          ),
        )
        .limit(1);

      const customerEmail = dossier?.customerEmail;

      // 2. Fetch all omnichannel activity
      const [calls, leads, appts, emails] = await Promise.all([
        drizzle
          .select({
            id: schema.callLogs.id,
            agent_id: schema.callLogs.agentId,
            direction: schema.callLogs.direction,
            customer_number: schema.callLogs.customerNumber,
            duration_seconds: schema.callLogs.durationSeconds,
            cost: schema.callLogs.cost,
            summary: schema.callLogs.summary,
            transcript: schema.callLogs.transcript,
            recording_url: schema.callLogs.recordingUrl,
            lead_score: schema.callLogs.leadScore,
            intent_label: schema.callLogs.intentLabel,
            created_at: schema.callLogs.createdAt,
          })
          .from(schema.callLogs)
          .where(
            and(
              eq(schema.callLogs.userId, req.user.id),
              ilike(schema.callLogs.customerNumber, `%${norm}`),
            ),
          )
          .orderBy(desc(schema.callLogs.createdAt)),
        drizzle
          .select({
            id: schema.outboundLeads.id,
            agent_id: schema.outboundLeads.agentId,
            customer_name: schema.outboundLeads.customerName,
            status: schema.outboundLeads.status,
            context: schema.outboundLeads.context,
            last_called_at: schema.outboundLeads.lastCalledAt,
            created_at: schema.outboundLeads.createdAt,
            phone_number: schema.outboundLeads.phoneNumber,
          })
          .from(schema.outboundLeads)
          .where(
            and(
              eq(schema.outboundLeads.userId, req.user.id),
              ilike(schema.outboundLeads.phoneNumber, `%${norm}`),
            ),
          )
          .orderBy(desc(schema.outboundLeads.createdAt)),
        drizzle
          .select({
            id: schema.appointments.id,
            agent_id: schema.appointments.agentId,
            customer_name: schema.appointments.customerName,
            service_type: schema.appointments.serviceType,
            date: schema.appointments.date,
            time: schema.appointments.time,
            status: schema.appointments.status,
            created_at: schema.appointments.createdAt,
          })
          .from(schema.appointments)
          .where(
            and(
              eq(schema.appointments.userId, req.user.id),
              ilike(schema.appointments.phoneNumber, `%${norm}`),
            ),
          )
          .orderBy(desc(schema.appointments.createdAt)),
        customerEmail
          ? drizzle
              .select()
              .from(schema.emailThreads)
              .where(
                and(
                  eq(schema.emailThreads.userId, req.user.id),
                  eq(schema.emailThreads.customerEmail, customerEmail),
                ),
              )
              .orderBy(desc(schema.emailThreads.lastMessageAt))
          : Promise.resolve([]),
      ]);

      res.json(
        buildContactProfile({
          number,
          normalized: norm,
          calls: calls || [],
          leads: leads || [],
          appts: appts || [],
          emails: emails || [],
        }),
      );
    } catch (e) {
      log.error("Contact profile fetch failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      claudeErr(res, e);
    }
  },
);

export default router;
