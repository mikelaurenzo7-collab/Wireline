/**
 * Idempotent showcase data for marketing/demo tenants (call logs, leads,
 * appointments, email + SMS inboxes). Used by POST /api/admin/seed-demo-account
 * and scripts/seed-demo-account.mts.
 */
import { sql, eq, and, inArray, like, desc } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import { invalidateDashboard } from "./dashboard-cache";
import * as schema from "../db/schema";
/** Drizzle client or an open transaction — seed helpers accept both. */
type DemoSeedDb = typeof drizzle | Parameters<Parameters<typeof drizzle.transaction>[0]>[0];

import {
  users as usersTable,
  agents as agentsTable,
  callLogs,
  outboundLeads,
  appointments,
  knowledge,
  dncList,
  emailThreads,
  emailMessages,
  smsThreads,
  smsMessages,
  subscriptions,
} from "../db/schema";

export const DEFAULT_DEMO_EMAIL = "wireline.demo@trywireline.com";

export interface SeedReport {
  table: string;
  before: number;
  inserted: number;
  after: number;
}

export const TARGET = {
  callLogs: 24,
  leads: 12,
  appointments: 8,
  knowledge: 6,
  dncList: 5,
  emailThreads: 6,
  smsThreads: 10,
};

const DEMO_PIPELINE_STAGES = ["cold", "contacted", "qualified", "demo", "won", "lost"] as const;

export const SAMPLE_CUSTOMERS = [
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

/** Fictional SMS numbers reserved for demo seed (avoid clashing with call-log sample phones). */
export const DEMO_SMS_NUMBERS = Array.from(
  { length: TARGET.smsThreads },
  (_, i) => `+1555010${String(i + 1).padStart(4, "0")}`,
);

const SAMPLE_SUMMARIES = [
  "Qualified inbound lead, asked about pricing for 5-seat plan. Booked Maya for demo Thursday 2pm.",
  "Existing customer, confused about overage line on invoice. Walked them through the meter, sent recap email.",
  "Discovery call. Prospect runs 3-person concierge medical practice, wants HIPAA story before committing.",
  "Outbound cold call. Lead asked us to call back Tuesday, scheduled in CRM.",
  "Voicemail left. Referenced our website, asked for sales callback.",
  "Tech support. Webhook signature error, walked them through rotating the secret.",
  "Tier comparison call. Customer downgrading from Pro to Starter, captured why (seasonal slowdown).",
  "Demo booked. Prospect switching from their current provider, wants to see the outbound playbook.",
  "Renewal conversation. Customer happy, asked about Business tier supervisor cockpit.",
  "Sales qual. 50-seat call-center prospect, routed to Liam for enterprise quote.",
  "Refund request. Charged twice during pause, refunded one and emailed receipt.",
  "Knowledge gap detected. Customer asked about Slack DLP, captured to docs queue.",
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
  "Our standard demo runs 25 minutes: 5 min discovery, 15 min live agent demo on their actual phone, 5 min Q&A + next-step.",
  "Business+ customers get a dedicated CSM. CSM hands off after first 90 days unless customer asks to keep them.",
  "Refund window: 14 days from invoice for any new charge. Beyond that we offer credits but not refunds.",
  "When troubleshooting webhook signature errors, rotate the signing secret from the integrations dashboard first, then re-verify delivery on the next event.",
  "Competitive wedge: we win on two-way SMS, email agents, and the supervisor cockpit. Lead with that triple when a prospect is comparing vendors.",
  "Enterprise legal redlines: we accept SCC, DPA, BAA on request. Security review pack available under NDA.",
];

const SAMPLE_APPOINTMENT_TYPES = [
  "Discovery Call",
  "Live Demo",
  "Onboarding Walkthrough",
  "Quarterly Business Review",
  "Pricing Review",
  "Renewal Conversation",
];

const SAMPLE_EMAIL_SUBJECTS = [
  "Pricing for 5-seat plan?",
  "Re: invoice overage line item",
  "HIPAA + Wireline for our practice",
  "Follow-up from yesterday's call",
  "Demo request: outbound playbook",
  "Business tier supervisor cockpit",
  "Refund for duplicate charge",
  "Integration question: Slack alerts",
  "Can Avery handle after-hours?",
  "Enterprise quote: 50 seats",
  "Thanks for the quick support",
  "Scheduling conflict on Thursday demo",
];

const SAMPLE_SMS_SNIPPETS = [
  "Hi, can someone call me about the Business plan?",
  "Yes Thursday 2pm works for the demo.",
  "STOP",
  "What's your HIPAA stance? We're a 3-provider clinic.",
  "Got the recap email, thanks!",
  "Can you text me the onboarding checklist?",
  "Is there a number I can try the agent on?",
  "Running 5 min late to the call",
  "Please confirm my appointment for tomorrow",
  "Interested in outbound SMS, do you support two-way?",
];

function seedEmailThreadId(userId: string, index: number): string {
  return `seed-email-${userId.slice(0, 8)}-${index}`;
}

export async function resolveDemoUserId(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const rows = await drizzle
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(trim(${usersTable.email})) = ${normalized}`)
    .limit(1);
  return rows[0]?.id ?? null;
}

/** Demo / marketing tenants need Pro so Director features are exercisable. */
export async function ensureDemoProSubscription(userId: string): Promise<void> {
  const currentPeriodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  await drizzle.transaction(async (tx) => {
    await tx
      .insert(subscriptions)
      .values({
        userId,
        plan: "pro",
        status: "active",
        entitlementSource: "demo",
        grantReason: "admin_demo_seed",
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
      })
      .onConflictDoUpdate({
        target: [subscriptions.userId],
        set: {
          plan: "pro",
          status: "active",
          entitlementSource: "demo",
          grantReason: "admin_demo_seed",
          currentPeriodEnd,
          cancelAtPeriodEnd: false,
          updatedAt: new Date(),
        },
      });

    await tx
      .insert(schema.settings)
      .values({
        id: userId,
        userId,
        accountEnvironment: "demo",
        subscriptionStatus: "active",
      })
      .onConflictDoUpdate({
        target: schema.settings.userId,
        set: {
          accountEnvironment: "demo",
          subscriptionStatus: "active",
          updatedAt: new Date(),
        },
      });
  });
}

async function pickFirstAgentId(userId: string): Promise<string | null> {
  const rows = await drizzle
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(eq(agentsTable.userId, userId))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function countRows(
  tableName: string,
  userId: string,
  tx: DemoSeedDb = drizzle,
): Promise<number> {
  if (tableName === "wireline_call_logs") {
    const [row] = await tx
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(callLogs)
      .where(and(eq(callLogs.userId, userId), eq(callLogs.demo, true)));
    return Number(row?.c ?? 0);
  }
  if (tableName === "wireline_outbound_leads") {
    const [row] = await tx
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(outboundLeads)
      .where(and(eq(outboundLeads.userId, userId), eq(outboundLeads.demo, true)));
    return Number(row?.c ?? 0);
  }
  if (tableName === "wireline_appointments") {
    const [row] = await tx
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(appointments)
      .where(and(eq(appointments.userId, userId), eq(appointments.demo, true)));
    return Number(row?.c ?? 0);
  }
  if (tableName === "wireline_knowledge") {
    const [row] = await tx
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(knowledge)
      .where(eq(knowledge.userId, userId));
    return Number(row?.c ?? 0);
  }
  if (tableName === "wireline_dnc_list") {
    const [row] = await tx
      .select({ c: sql<number>`COUNT(*)::int` })
      .from(dncList)
      .where(and(eq(dncList.userId, userId), eq(dncList.demo, true)));
    return Number(row?.c ?? 0);
  }
  throw new Error(`Unknown table: ${tableName}`);
}

/** Keep one demo lead per customer phone (legacy seeds overshot TARGET.leads). */
async function pruneDuplicateDemoLeads(userId: string, tx: DemoSeedDb): Promise<number> {
  const pruned = await tx.execute(sql`
    DELETE FROM wireline_outbound_leads AS d
    USING (
      SELECT id,
        ROW_NUMBER() OVER (
          PARTITION BY user_id, customer_number
          ORDER BY id
        ) AS rn
      FROM wireline_outbound_leads
      WHERE user_id = ${userId} AND demo = true
    ) AS ranked
    WHERE d.id = ranked.id AND ranked.rn > 1
  `);
  return Number((pruned as { rowCount?: number }).rowCount ?? 0);
}

/** Drop duplicate marketing inbox rows (legacy seeds wrote indices 0–11). */
async function pruneExcessSeedEmailThreads(userId: string, tx: DemoSeedDb): Promise<number> {
  const userPrefix = userId.slice(0, 8);
  const pruned = await tx
    .delete(emailThreads)
    .where(
      and(
        eq(emailThreads.userId, userId),
        like(emailThreads.threadId, `seed-email-${userPrefix}-%`),
        sql`(regexp_replace(${emailThreads.threadId}, '^.*-', ''))::int >= ${TARGET.emailThreads}`,
      ),
    )
    .returning({ id: emailThreads.id });
  return pruned.length;
}

async function countSeedEmailThreads(userId: string, tx: DemoSeedDb = drizzle): Promise<number> {
  const [row] = await tx
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(emailThreads)
    .where(and(eq(emailThreads.userId, userId), like(emailThreads.threadId, "seed-email-%")));
  return Number(row?.c ?? 0);
}

async function countSeedSmsThreads(userId: string, tx: DemoSeedDb = drizzle): Promise<number> {
  const [row] = await tx
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(smsThreads)
    .where(
      and(eq(smsThreads.userId, userId), inArray(smsThreads.customerNumber, DEMO_SMS_NUMBERS)),
    );
  return Number(row?.c ?? 0);
}

/** Re-apply varied copy when demo rows already exist (idempotent re-seed / bulk-SQL repair). */
async function refreshDemoShowcaseCopy(userId: string, tx: DemoSeedDb): Promise<void> {
  await pruneDuplicateDemoLeads(userId, tx);
  await pruneExcessSeedEmailThreads(userId, tx);

  const calls = await tx
    .select({ id: callLogs.id })
    .from(callLogs)
    .where(and(eq(callLogs.userId, userId), eq(callLogs.demo, true)))
    .orderBy(desc(callLogs.createdAt));
  for (let i = 0; i < calls.length; i++) {
    const idx = i % SAMPLE_SUMMARIES.length;
    await tx
      .update(callLogs)
      .set({
        summary: SAMPLE_SUMMARIES[idx],
        intentLabel: SAMPLE_INTENTS[idx % SAMPLE_INTENTS.length],
        sentiment: SAMPLE_SENTIMENTS[idx % SAMPLE_SENTIMENTS.length],
      })
      .where(eq(callLogs.id, calls[i].id));
  }

  const seedEmails = await tx
    .select({ id: emailThreads.id, threadId: emailThreads.threadId })
    .from(emailThreads)
    .where(and(eq(emailThreads.userId, userId), like(emailThreads.threadId, "seed-email-%")))
    .orderBy(sql`(regexp_replace(${emailThreads.threadId}, '^.*-', ''))::int`);
  for (let i = 0; i < seedEmails.length && i < TARGET.emailThreads; i++) {
    const idx = i % SAMPLE_SUMMARIES.length;
    await tx
      .update(emailThreads)
      .set({
        summary: SAMPLE_SUMMARIES[idx],
        subject: SAMPLE_EMAIL_SUBJECTS[i % SAMPLE_EMAIL_SUBJECTS.length],
        intentLabel: SAMPLE_INTENTS[idx % SAMPLE_INTENTS.length],
        read: true,
      })
      .where(eq(emailThreads.id, seedEmails[i].id));
  }

  for (let i = 0; i < DEMO_SMS_NUMBERS.length; i++) {
    const snippet = SAMPLE_SMS_SNIPPETS[i % SAMPLE_SMS_SNIPPETS.length];
    await tx
      .update(smsThreads)
      .set({ summary: snippet })
      .where(
        and(eq(smsThreads.userId, userId), eq(smsThreads.customerNumber, DEMO_SMS_NUMBERS[i])),
      );
  }

  const leads = await tx
    .select({ id: outboundLeads.id })
    .from(outboundLeads)
    .where(and(eq(outboundLeads.userId, userId), eq(outboundLeads.demo, true)))
    .orderBy(outboundLeads.id);
  for (let i = 0; i < leads.length; i++) {
    const cust = SAMPLE_CUSTOMERS[i % SAMPLE_CUSTOMERS.length];
    const idx = i % SAMPLE_SUMMARIES.length;
    await tx
      .update(outboundLeads)
      .set({
        customerName: cust.name,
        customerNumber: cust.phone,
        phoneNumber: cust.phone,
        email: cust.email,
        context: SAMPLE_SUMMARIES[(idx + 3) % SAMPLE_SUMMARIES.length],
        lastContactSummary: SAMPLE_SUMMARIES[idx],
        pipelineStage: DEMO_PIPELINE_STAGES[i % DEMO_PIPELINE_STAGES.length],
      })
      .where(eq(outboundLeads.id, leads[i].id));
  }
}

async function backfillTenantDemoRows(userId: string, tx: DemoSeedDb = drizzle): Promise<void> {
  const seedPhones = SAMPLE_CUSTOMERS.map((c) => c.phone);
  await tx.transaction(async (nestedTx) => {
    await nestedTx
      .update(schema.outboundLeads)
      .set({ demo: true })
      .where(
        and(
          eq(schema.outboundLeads.userId, userId),
          eq(schema.outboundLeads.demo, false),
          inArray(schema.outboundLeads.customerNumber, seedPhones),
        ),
      );
    await nestedTx
      .update(schema.appointments)
      .set({ demo: true })
      .where(
        and(
          eq(schema.appointments.userId, userId),
          eq(schema.appointments.demo, false),
          inArray(schema.appointments.phoneNumber, seedPhones),
        ),
      );
    await nestedTx
      .update(schema.dncList)
      .set({ demo: true })
      .where(
        and(
          eq(schema.dncList.userId, userId),
          eq(schema.dncList.demo, false),
          inArray(schema.dncList.phone, seedPhones),
        ),
      );
    await nestedTx.execute(sql`
      UPDATE wireline_call_logs SET demo = true
      WHERE user_id = ${userId} AND demo = false AND vapi_call_id LIKE 'seed-call-%';
    `);
  });
}

function randomCreatedAt(daysBack: number): Date {
  const ms = Date.now() - Math.random() * daysBack * 86400_000;
  return new Date(ms);
}

export async function seedDemoAccountData(userId: string): Promise<{
  agentId: string;
  report: SeedReport[];
}> {
  const agentId = await pickFirstAgentId(userId);
  if (!agentId) {
    throw new Error("Demo user has no agents. Create at least one agent before seeding.");
  }

  const report: SeedReport[] = [];
  const userPrefix = userId.slice(0, 8);

  await drizzle.transaction(async (tx) => {
    await backfillTenantDemoRows(userId, tx);

    {
      const before = await countRows("wireline_call_logs", userId, tx);
      const need = Math.max(0, TARGET.callLogs - before);
      let inserted = 0;
      for (let i = 0; i < need; i++) {
        const cust = SAMPLE_CUSTOMERS[i % SAMPLE_CUSTOMERS.length];
        await tx.insert(callLogs).values({
          userId,
          agentId,
          vapiCallId: `seed-call-${userPrefix}-${i}`,
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
      report.push({ table: "wireline_call_logs", before, inserted, after: before + inserted });
    }

    {
      const prunedLeads = await pruneDuplicateDemoLeads(userId, tx);
      const before = await countRows("wireline_outbound_leads", userId, tx);
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
        await tx.insert(outboundLeads).values({
          userId,
          agentId,
          customerName: cust.name,
          customerNumber: cust.phone,
          phoneNumber: cust.phone,
          email: cust.email,
          context: SAMPLE_SUMMARIES[(i + 3) % SAMPLE_SUMMARIES.length],
          status: statuses[i % statuses.length],
          pipelineStage: DEMO_PIPELINE_STAGES[i % DEMO_PIPELINE_STAGES.length],
          attempts: 1 + (i % 3),
          source: i % 4 === 0 ? "csv-upload" : i % 4 === 1 ? "api" : "manual",
          lastContactSummary: SAMPLE_SUMMARIES[i % SAMPLE_SUMMARIES.length],
          lastCalledAt: randomCreatedAt(14),
          demo: true,
          createdAt: randomCreatedAt(28),
        });
        inserted++;
      }
      const afterLeads = await countRows("wireline_outbound_leads", userId, tx);
      if (prunedLeads > 0) {
        log.info("Pruned duplicate demo pipeline leads", { userId, pruned: prunedLeads });
      }
      report.push({ table: "wireline_outbound_leads", before, inserted, after: afterLeads });
    }

    {
      const before = await countRows("wireline_appointments", userId, tx);
      const need = Math.max(0, TARGET.appointments - before);
      let inserted = 0;
      for (let i = 0; i < need; i++) {
        const cust = SAMPLE_CUSTOMERS[i % SAMPLE_CUSTOMERS.length];
        const when = new Date(Date.now() + (1 + i) * 86400_000);
        await tx.insert(appointments).values({
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
      report.push({ table: "wireline_appointments", before, inserted, after: before + inserted });
    }

    {
      const before = await countRows("wireline_knowledge", userId, tx);
      const need = Math.max(0, TARGET.knowledge - before);
      let inserted = 0;
      for (let i = 0; i < need; i++) {
        await tx.insert(knowledge).values({
          userId,
          agentId,
          content: SAMPLE_KNOWLEDGE[i % SAMPLE_KNOWLEDGE.length],
          createdAt: randomCreatedAt(35),
        });
        inserted++;
      }
      report.push({ table: "wireline_knowledge", before, inserted, after: before + inserted });
    }

    {
      const before = await countRows("wireline_dnc_list", userId, tx);
      const need = Math.max(0, TARGET.dncList - before);
      let inserted = 0;
      for (let i = 0; i < need; i++) {
        const cust = SAMPLE_CUSTOMERS[(i + 7) % SAMPLE_CUSTOMERS.length];
        try {
          await tx.insert(dncList).values({
            userId,
            phone: cust.phone,
            reason: i % 2 === 0 ? "Customer requested STOP via SMS" : "Manual op-add",
            source: i % 2 === 0 ? "sms-stop" : "manual",
            demo: true,
            createdAt: randomCreatedAt(40),
          });
          inserted++;
        } catch {
          /* unique — skip */
        }
      }
      report.push({ table: "wireline_dnc_list", before, inserted, after: before + inserted });
    }

    {
      const pruned = await pruneExcessSeedEmailThreads(userId, tx);
      const before = await countSeedEmailThreads(userId, tx);
      let inserted = 0;
      for (let index = 0; index < TARGET.emailThreads; index++) {
        const cust = SAMPLE_CUSTOMERS[index % SAMPLE_CUSTOMERS.length];
        const threadId = seedEmailThreadId(userId, index);
        const [thread] = await tx
          .insert(emailThreads)
          .values({
            userId,
            agentId,
            threadId,
            customerEmail: cust.email,
            subject: SAMPLE_EMAIL_SUBJECTS[index % SAMPLE_EMAIL_SUBJECTS.length],
            status: "open",
            summary: SAMPLE_SUMMARIES[index % SAMPLE_SUMMARIES.length],
            leadScore: 45 + Math.floor(Math.random() * 50),
            intentLabel: SAMPLE_INTENTS[index % SAMPLE_INTENTS.length],
            read: true,
            lastMessageAt: randomCreatedAt(10),
            createdAt: randomCreatedAt(14),
          })
          .onConflictDoNothing({ target: [emailThreads.userId, emailThreads.threadId] })
          .returning({ id: emailThreads.id });

        if (thread?.id) {
          const inboundBody =
            "Hi team,\n\n" +
            SAMPLE_SUMMARIES[index % SAMPLE_SUMMARIES.length] +
            "\n\nBest,\n" +
            cust.name.split(" ")[0];
          await tx.insert(emailMessages).values({
            userId,
            threadId: thread.id,
            googleMessageId: `seed-gmail-${userPrefix}-${index}-in`,
            role: "user",
            content: inboundBody,
            createdAt: randomCreatedAt(10),
          });
          await tx.insert(emailMessages).values({
            userId,
            threadId: thread.id,
            googleMessageId: `seed-gmail-${userPrefix}-${index}-out`,
            role: "ai",
            content:
              "Thanks for reaching out, Avery here. " +
              SAMPLE_SUMMARIES[(index + 2) % SAMPLE_SUMMARIES.length] +
              " Let me know if you'd like to book a live demo.",
            createdAt: randomCreatedAt(9),
          });
          inserted++;
        }
      }
      const afterEmail = await countSeedEmailThreads(userId, tx);
      if (pruned > 0) {
        log.info("Pruned excess demo email threads", { userId, pruned });
      }
      report.push({ table: "wireline_email_threads", before, inserted, after: afterEmail });
    }

    {
      const before = await countSeedSmsThreads(userId, tx);
      const need = Math.max(0, TARGET.smsThreads - before);
      let inserted = 0;
      for (let i = 0; i < need; i++) {
        const phone = DEMO_SMS_NUMBERS[i];
        const cust = SAMPLE_CUSTOMERS[i % SAMPLE_CUSTOMERS.length];
        let threadId: string | undefined;
        const [insertedThread] = await tx
          .insert(smsThreads)
          .values({
            userId,
            agentId,
            customerNumber: phone,
            status: "open",
            summary: SAMPLE_SMS_SNIPPETS[i % SAMPLE_SMS_SNIPPETS.length],
            unreadCount: i % 4 === 0 ? 1 : 0,
            lastMessageAt: randomCreatedAt(5),
            createdAt: randomCreatedAt(12),
          })
          .onConflictDoNothing({ target: [smsThreads.userId, smsThreads.customerNumber] })
          .returning({ id: smsThreads.id });
        threadId = insertedThread?.id;
        if (!threadId) {
          const [existing] = await tx
            .select({ id: smsThreads.id })
            .from(smsThreads)
            .where(and(eq(smsThreads.userId, userId), eq(smsThreads.customerNumber, phone)))
            .limit(1);
          threadId = existing?.id;
        }

        if (threadId) {
          const msgCount = await tx
            .select({ c: sql<number>`COUNT(*)::int` })
            .from(smsMessages)
            .where(eq(smsMessages.threadId, threadId));
          if (Number(msgCount[0]?.c ?? 0) === 0) {
            await tx.insert(smsMessages).values({
              userId,
              threadId,
              direction: "in",
              body: SAMPLE_SMS_SNIPPETS[i % SAMPLE_SMS_SNIPPETS.length],
              twilioSid: `seed-sms-${userPrefix}-${i}-in`,
              createdAt: randomCreatedAt(5),
            });
            await tx.insert(smsMessages).values({
              userId,
              threadId,
              direction: "out",
              body: `Hi ${cust.name.split(" ")[0]}, Avery from Wireline. Happy to help with that. Reply anytime.`,
              twilioSid: `seed-sms-${userPrefix}-${i}-out`,
              agentId,
              createdAt: randomCreatedAt(4),
            });
          }
          inserted++;
        }
      }
      report.push({ table: "wireline_sms_threads", before, inserted, after: before + inserted });
    }

    await refreshDemoShowcaseCopy(userId, tx);
  });

  await ensureDemoProSubscription(userId);
  invalidateDashboard(userId);
  log.info("Demo account seeded", { userId, report });
  return { agentId, report };
}
