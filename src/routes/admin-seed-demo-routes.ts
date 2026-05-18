/**
 * Owner-only endpoint that seeds the marketing/demo account with rich
 * showcase data so the founder's wife (and other marketing folks) can
 * sign in and capture screenshots/video of a fully-populated console
 * rather than empty states.
 *
 * Default seed target email: qa-final-2026@wireline.app (overridable via
 * POST body { email }). Re-running is safe — every insert is gated by a
 * "do we already have this many rows for this user?" check so we never
 * inflate beyond the intended sample size.
 *
 * Auth: requesting user's email must match OWNER_EMAIL env var.
 */

import { Router, Response } from "express";
import { drizzle, log } from "../lib/server-context";
import { sql, eq } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import type { AuthenticatedRequest } from "../types/auth";
import {
  agents as agentsTable,
  callLogs,
  outboundLeads,
  appointments,
  knowledge,
  dncList,
} from "../db/schema";

const router = Router();

const DEFAULT_DEMO_EMAIL = "qa-final-2026@wireline.app";

interface SeedReport {
  table: string;
  before: number;
  inserted: number;
  after: number;
}

const TARGET = {
  callLogs: 24,
  leads: 18,
  appointments: 8,
  knowledge: 6,
  dncList: 5,
};

const SAMPLE_CUSTOMERS = [
  { name: "Alex Rivera", phone: "+14155551011", email: "alex.rivera@northstarmfg.com" },
  { name: "Jordan Park", phone: "+12125551042", email: "jordan.park@apexrealty.io" },
  { name: "Priya Shah", phone: "+16175552031", email: "priya@shaadvisory.com" },
  { name: "Marcus Lee", phone: "+13105551108", email: "marcus.lee@beaconconsult.com" },
  { name: "Hana Tanaka", phone: "+12065552287", email: "hana.tanaka@meridianlab.io" },
  { name: "Diego Morales", phone: "+13125552233", email: "diego@morales-fit.com" },
  { name: "Sofia Romano", phone: "+19173145555", email: "sofia.romano@cypress-cap.com" },
  { name: "Ethan Wright", phone: "+14025558810", email: "ethan@wrightoptical.com" },
  { name: "Naomi Klein", phone: "+12063339090", email: "naomi.k@klein-builds.com" },
  { name: "Wes Park", phone: "+15103445454", email: "wes.park@apex-pivot.io" },
  { name: "Carmen Diaz", phone: "+17029990606", email: "carmen@diazdental.com" },
  { name: "Trevor Hill", phone: "+19035552031", email: "trevor.hill@altitudefit.io" },
];

const SAMPLE_SUMMARIES = [
  "Qualified inbound lead, asked about pricing for 5-seat plan. Booked Maya for demo Thursday 2pm.",
  "Existing customer — confused about overage line on invoice. Walked them through the meter, sent recap email.",
  "Discovery call. Prospect runs 3-person concierge medical practice, wants HIPAA story before committing.",
  "Outbound cold call. Lead asked us to call back Tuesday, scheduled in CRM.",
  "Voicemail left — referenced our website, asked for sales callback.",
  "Tech support — webhook signature error, walked them through rotating the secret.",
  "Tier comparison call. Customer downgrading from Pro to Starter, captured why (seasonal slowdown).",
  "Demo booked. Prospect coming over from Air, wants to see outbound playbook.",
  "Renewal conversation. Customer happy, asked about Business tier supervisor cockpit.",
  "Sales qual — 50-seat call-center prospect, routed to Liam for enterprise quote.",
  "Refund request. Charged twice during pause, refunded one and emailed receipt.",
  "Knowledge gap detected — customer asked about Slack DLP, captured to docs queue.",
];

const SAMPLE_INTENTS = [
  "buy_now",
  "schedule_demo",
  "support_question",
  "billing_query",
  "renewal",
  "cancel_request",
  "tech_issue",
  "comparison",
];

const SAMPLE_SENTIMENTS = ["positive", "positive", "neutral", "positive", "neutral"];

const SAMPLE_KNOWLEDGE = [
  "Our standard demo runs 25 minutes — 5 min discovery, 15 min live agent demo on their actual phone, 5 min Q&A + next-step.",
  "Business+ customers get a dedicated CSM. CSM hands off after first 90 days unless customer asks to keep them.",
  "Refund window: 14 days from invoice for any new charge. Beyond that we offer credits but not refunds.",
  "When troubleshooting webhook signature errors, always rotate VAPI_WEBHOOK_SECRET in Vercel first, then update the assistant + every pool number's server.secret in lockstep.",
  "Our biggest competitor is Air — they're cheaper but lack two-way SMS, no email agents, and no supervisor cockpit. Use that triple as the wedge.",
  "Enterprise legal redlines: we accept SCC, DPA, BAA on request. SOC2 Type 2 available under NDA.",
];

const SAMPLE_APPOINTMENT_TYPES = [
  "Discovery Call",
  "Live Demo",
  "Onboarding Walkthrough",
  "Quarterly Business Review",
  "Pricing Review",
  "Renewal Conversation",
];

async function pickDemoUserId(email: string): Promise<string | null> {
  const rows: any = await drizzle.execute(
    sql`SELECT id FROM auth.users WHERE email = ${email} LIMIT 1`,
  );
  const data = (rows.rows ?? rows) as Array<{ id: string }>;
  return data[0]?.id ?? null;
}

async function pickFirstAgentId(userId: string): Promise<string | null> {
  const rows = await drizzle
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.userId, userId))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function countRows(table: string, userId: string): Promise<number> {
  const rows: any = await drizzle.execute(
    sql.raw(`SELECT COUNT(*)::int AS c FROM ${table} WHERE user_id = '${userId}'`),
  );
  const data = (rows.rows ?? rows) as Array<{ c: number }>;
  return Number(data[0]?.c ?? 0);
}

function randomCreatedAt(daysBack: number): Date {
  const ms = Date.now() - Math.random() * daysBack * 86400_000;
  return new Date(ms);
}

router.post(
  "/api/admin/seed-demo-account",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const ownerEmail = process.env.OWNER_EMAIL;
    if (!ownerEmail || req.user?.email !== ownerEmail) {
      return res.status(403).json({ error: "Owner only." });
    }

    const targetEmail =
      (typeof req.body?.email === "string" && req.body.email) || DEFAULT_DEMO_EMAIL;

    const userId = await pickDemoUserId(targetEmail);
    if (!userId) {
      return res.status(404).json({ error: `Demo user not found: ${targetEmail}` });
    }
    const agentId = await pickFirstAgentId(userId);
    if (!agentId) {
      return res.status(412).json({
        error: `Demo user has no agents. Create at least one agent before seeding.`,
      });
    }

    const report: SeedReport[] = [];

    try {
      // CALL LOGS
      {
        const before = await countRows("wireline_call_logs", userId);
        const need = Math.max(0, TARGET.callLogs - before);
        let inserted = 0;
        for (let i = 0; i < need; i++) {
          const cust = SAMPLE_CUSTOMERS[i % SAMPLE_CUSTOMERS.length];
          await drizzle.insert(callLogs).values({
            userId,
            agentId,
            vapiCallId: `seed-call-${userId.slice(0, 6)}-${Date.now()}-${i}`,
            direction: i % 2 === 0 ? "inbound" : "outbound",
            customerNumber: cust.phone,
            durationSeconds: 90 + Math.floor(Math.random() * 480),
            summary: SAMPLE_SUMMARIES[i % SAMPLE_SUMMARIES.length],
            intentLabel: SAMPLE_INTENTS[i % SAMPLE_INTENTS.length],
            sentiment: SAMPLE_SENTIMENTS[i % SAMPLE_SENTIMENTS.length],
            leadScore: 40 + Math.floor(Math.random() * 55),
            qaScore: 70 + Math.floor(Math.random() * 28),
            createdAt: randomCreatedAt(21),
          });
          inserted++;
        }
        report.push({
          table: "wireline_call_logs",
          before,
          inserted,
          after: before + inserted,
        });
      }

      // OUTBOUND LEADS
      {
        const before = await countRows("wireline_outbound_leads", userId);
        const need = Math.max(0, TARGET.leads - before);
        let inserted = 0;
        const statuses = [
          "Completed",
          "Voicemail-Left",
          "Callback-Scheduled",
          "Connected",
          "Pending",
          "Completed",
        ];
        for (let i = 0; i < need; i++) {
          const cust = SAMPLE_CUSTOMERS[i % SAMPLE_CUSTOMERS.length];
          await drizzle.insert(outboundLeads).values({
            userId,
            agentId,
            customerName: cust.name,
            customerNumber: cust.phone,
            phoneNumber: cust.phone,
            email: cust.email,
            context: SAMPLE_SUMMARIES[(i + 3) % SAMPLE_SUMMARIES.length],
            status: statuses[i % statuses.length],
            attempts: 1 + (i % 3),
            source: i % 4 === 0 ? "csv-upload" : i % 4 === 1 ? "api" : "manual",
            lastContactSummary: SAMPLE_SUMMARIES[i % SAMPLE_SUMMARIES.length],
            lastCalledAt: randomCreatedAt(14),
            createdAt: randomCreatedAt(28),
          });
          inserted++;
        }
        report.push({
          table: "wireline_outbound_leads",
          before,
          inserted,
          after: before + inserted,
        });
      }

      // APPOINTMENTS
      {
        const before = await countRows("wireline_appointments", userId);
        const need = Math.max(0, TARGET.appointments - before);
        let inserted = 0;
        for (let i = 0; i < need; i++) {
          const cust = SAMPLE_CUSTOMERS[i % SAMPLE_CUSTOMERS.length];
          const when = new Date(Date.now() + (1 + i) * 86400_000);
          await drizzle.insert(appointments).values({
            userId,
            agentId,
            customerName: cust.name,
            phoneNumber: cust.phone,
            serviceType: SAMPLE_APPOINTMENT_TYPES[i % SAMPLE_APPOINTMENT_TYPES.length],
            date: when.toISOString().slice(0, 10),
            time: ["9:00 AM", "10:30 AM", "1:00 PM", "2:30 PM", "4:00 PM"][i % 5],
            status: "Scheduled",
            notes: SAMPLE_SUMMARIES[(i + 5) % SAMPLE_SUMMARIES.length],
            createdAt: randomCreatedAt(7),
          });
          inserted++;
        }
        report.push({
          table: "wireline_appointments",
          before,
          inserted,
          after: before + inserted,
        });
      }

      // KNOWLEDGE
      {
        const before = await countRows("wireline_knowledge", userId);
        const need = Math.max(0, TARGET.knowledge - before);
        let inserted = 0;
        for (let i = 0; i < need; i++) {
          await drizzle.insert(knowledge).values({
            userId,
            agentId,
            content: SAMPLE_KNOWLEDGE[i % SAMPLE_KNOWLEDGE.length],
            createdAt: randomCreatedAt(35),
          });
          inserted++;
        }
        report.push({
          table: "wireline_knowledge",
          before,
          inserted,
          after: before + inserted,
        });
      }

      // DNC LIST
      {
        const before = await countRows("wireline_dnc_list", userId);
        const need = Math.max(0, TARGET.dncList - before);
        let inserted = 0;
        for (let i = 0; i < need; i++) {
          const cust = SAMPLE_CUSTOMERS[(i + 7) % SAMPLE_CUSTOMERS.length];
          try {
            await drizzle.insert(dncList).values({
              userId,
              phone: cust.phone,
              reason: i % 2 === 0 ? "Customer requested STOP via SMS" : "Manual op-add",
              source: i % 2 === 0 ? "sms-stop" : "manual",
              createdAt: randomCreatedAt(40),
            });
            inserted++;
          } catch {
            // unique constraint — skip
          }
        }
        report.push({
          table: "wireline_dnc_list",
          before,
          inserted,
          after: before + inserted,
        });
      }

      log.info("Demo account seeded", { userId, targetEmail, report });

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
      return res.status(500).json({ error: e?.message || "Seed failed", reportSoFar: report });
    }
  },
);

export default router;
