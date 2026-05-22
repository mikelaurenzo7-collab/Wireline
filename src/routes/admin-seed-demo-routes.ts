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
import { sql, eq, and, inArray } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { invalidateDashboard } from "../lib/dashboard-cache";
import type { AuthenticatedRequest } from "../types/auth";
import * as schema from "../db/schema";
import {
  users as usersTable,
  agents as agentsTable,
  callLogs,
  outboundLeads,
  appointments,
  knowledge,
  dncList,
} from "../db/schema";

const router = Router();

const DEFAULT_DEMO_EMAIL = "composer.demo@trywireline.com";

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
  const rows = await drizzle
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function pickFirstAgentId(userId: string): Promise<string | null> {
  const rows = await drizzle
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.userId, userId))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Type-safe row count by table name. Uses a hardcoded table map so the
 * `table` string can never be interpolated into raw SQL, and parameterizes
 * `userId` via drizzle's query builder — closes the SQL injection that
 * the previous `sql.raw('... WHERE user_id = ${userId}')` opened. Even
 * though the endpoint is owner-only-gated, fundamental injection is
 * never acceptable.
 */
const TABLE_MAP: Record<string, any> = {
  wireline_call_logs: callLogs,
  wireline_outbound_leads: outboundLeads,
  wireline_appointments: appointments,
  wireline_knowledge: knowledge,
  wireline_dnc_list: dncList,
};

/**
 * Count rows scoped to a tenant. The seed endpoint counts only demo=true
 * rows when deciding whether to top up; otherwise a tenant that has
 * legitimate real call_logs would be considered "already seeded" and we'd
 * insert 0 showcase rows. Knowledge entries don't have a demo column
 * (per-agent config, not transactional) so they're counted plain.
 */
async function countRows(tableName: string, userId: string): Promise<number> {
  const table = TABLE_MAP[tableName];
  if (!table) throw new Error(`Unknown table: ${tableName}`);
  const filters = [eq(table.userId, userId)];
  if (tableName !== "wireline_knowledge") {
    filters.push(eq(table.demo, true));
  }
  const [row] = await drizzle
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(table)
    .where(and(...filters));
  return Number(row?.c ?? 0);
}

/**
 * Tenant-scoped backfill for pre-audit3 seeded rows. Flips demo=true on
 * any row owned by THIS specific tenant whose phone matches one of the
 * SAMPLE_CUSTOMERS phones. Safe because it's scoped to the explicitly-
 * targeted demo user (not a global UPDATE that could hit real production
 * rows with the same numbers). Runs idempotently on every seed call.
 */
async function backfillTenantDemoRows(userId: string): Promise<void> {
  const seedPhones = SAMPLE_CUSTOMERS.map((c) => c.phone);
  try {
    // Wrap in a single transaction so the four UPDATEs commit together
    // or roll back together. Without this, a mid-loop failure can leave
    // some tables backfilled and others not — countRows() would then
    // undercount demo=true on the un-flipped tables and the seed loop
    // would re-insert duplicates (the same failure mode the PR #138
    // hotfix just closed via inArray binding, surfacing here as a
    // defense-in-depth question).
    await drizzle.transaction(async (tx) => {
      await tx
        .update(schema.outboundLeads)
        .set({ demo: true })
        .where(
          and(
            eq(schema.outboundLeads.userId, userId),
            eq(schema.outboundLeads.demo, false),
            inArray(schema.outboundLeads.customerNumber, seedPhones),
          ),
        );
      await tx
        .update(schema.appointments)
        .set({ demo: true })
        .where(
          and(
            eq(schema.appointments.userId, userId),
            eq(schema.appointments.demo, false),
            inArray(schema.appointments.phoneNumber, seedPhones),
          ),
        );
      await tx
        .update(schema.dncList)
        .set({ demo: true })
        .where(
          and(
            eq(schema.dncList.userId, userId),
            eq(schema.dncList.demo, false),
            inArray(schema.dncList.phone, seedPhones),
          ),
        );
      // call_logs uses LIKE on the vapi_call_id seed signature — no
      // array binding bug applies, and the predicate is narrow enough
      // to stay raw SQL.
      await tx.execute(sql`
        UPDATE wireline_call_logs SET demo = true
        WHERE user_id = ${userId} AND demo = false AND vapi_call_id LIKE 'seed-call-%';
      `);
    });
  } catch (err: any) {
    // Log and re-throw. Swallowing here would let the seed loop proceed
    // with stale countRows() values and re-insert duplicate demo rows
    // on every call — exactly the failure mode PR #138 fixed. Failing
    // fast surfaces the bug to the operator (500 response from the seed
    // endpoint) instead of silently corrupting the demo footprint.
    log.warn("Seed tenant backfill failed", { userId, error: err?.message });
    throw err;
  }
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

    // Tenant-scoped backfill for any pre-audit3 rows that are still
    // demo=false. Safe — only flips rows owned by THIS user whose phone
    // matches a SAMPLE_CUSTOMERS entry, not a global UPDATE. After this
    // runs, countRows() (which counts demo=true) reflects the true
    // demo footprint and we top up to TARGET without piling new rows
    // on top of old stranded ones.
    await backfillTenantDemoRows(userId);

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
            demo: true,
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
            demo: true,
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
            demo: true,
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
              demo: true,
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

      // Bust the per-tenant dashboard cache so call/lead/appointment
      // counts update immediately. Symmetric with the DELETE
      // /api/admin/demo-data path which also calls this.
      invalidateDashboard(userId);

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

/**
 * Self-serve wipe of demo rows. Any authenticated user can clear THEIR
 * OWN demo=true rows across call_logs / outbound_leads / appointments /
 * dnc_list. Real (demo=false) data is untouched.
 *
 * Use case: an operator who got seeded showcase data for their wife's
 * marketing screenshots wants to clear the deck before onboarding a
 * real customer.
 */
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
      };
      // Atomic wipe across all four tables. If any DELETE fails the
      // transaction rolls back so the tenant is never left in a
      // partial-wipe state.
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
      });

      // Dashboard stats (agent counts, call counts, etc.) are cached
      // per-tenant — bust the cache so the operator's dashboard
      // immediately reflects the wipe instead of showing stale numbers.
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
