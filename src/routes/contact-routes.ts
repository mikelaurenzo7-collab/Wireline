import { Router, Response } from "express";
import { AppError } from "../lib/api-error";
import { log, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { normalizePhoneTail, buildContactProfile } from "../lib/contact-profile";
import { phoneTailEquals } from "../lib/phone-tail-sql";
import { aiErr } from "../lib/ai-response-helpers";
import type { AuthenticatedRequest } from "../types/auth";

const router = Router();

/** Per-channel cap on contact timeline rows — keeps profile API bounded. */
const CONTACT_HISTORY_LIMIT = 100;

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
      if (!norm) throw AppError.fromHttpStatus(400, "Invalid phone number.");

      // 1. Get lead dossier to find email address
      const [dossier] = await drizzle
        .select({ customerEmail: schema.leadDossiers.customerEmail })
        .from(schema.leadDossiers)
        .where(
          and(
            eq(schema.leadDossiers.userId, req.user.id),
            phoneTailEquals(schema.leadDossiers.customerNumber, norm),
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
              phoneTailEquals(schema.callLogs.customerNumber, norm),
            ),
          )
          .orderBy(desc(schema.callLogs.createdAt))
          .limit(CONTACT_HISTORY_LIMIT),
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
              phoneTailEquals(schema.outboundLeads.phoneNumber, norm),
            ),
          )
          .orderBy(desc(schema.outboundLeads.createdAt))
          .limit(CONTACT_HISTORY_LIMIT),
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
              phoneTailEquals(schema.appointments.phoneNumber, norm),
            ),
          )
          .orderBy(desc(schema.appointments.createdAt))
          .limit(CONTACT_HISTORY_LIMIT),
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
              .limit(CONTACT_HISTORY_LIMIT)
          : Promise.resolve([]),
      ]);

      res.json(
        buildContactProfile({
          number,
          normalized: norm,
          calls: calls || [],
          leads: leads || [],
          appts: appts || [],
          // `emails` is the union of inbound and outbound rows that builds a
          // unified contact timeline; the consumer (buildContactProfile)
          // narrows per-entry, so a structural cast through `unknown` is the
          // honest bridge here rather than `as any`.
          emails: (emails as unknown as Parameters<typeof buildContactProfile>[0]["emails"]) || [],
        }),
      );
    } catch (e) {
      if (e instanceof AppError) throw e;
      log.error("Contact profile fetch failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      aiErr(res, e);
    }
  },
);

export default router;
