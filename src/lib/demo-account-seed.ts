/**
 * Idempotent showcase data for marketing/demo tenants (call logs, leads,
 * appointments, email + SMS inboxes). Used by POST /api/admin/seed-demo-account
 * and scripts/seed-demo-account.mts.
 */
import { sql, eq, and, inArray, like, desc, isNull } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import { invalidateDashboard } from "./dashboard-cache";
import type { CallOutcomeTag } from "./post-call-digest";
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
  { name: "Alex Rivera", phone: "+12025550100", email: "alex.rivera@example.com" },
  { name: "Jordan Park", phone: "+12025550101", email: "jordan.park@example.com" },
  { name: "Priya Shah", phone: "+12025550102", email: "priya.shah@example.com" },
  { name: "Marcus Lee", phone: "+12025550103", email: "marcus.lee@example.com" },
  { name: "Hana Tanaka", phone: "+12025550104", email: "hana.tanaka@example.com" },
  { name: "Diego Morales", phone: "+12025550105", email: "diego.morales@example.com" },
  { name: "Sofia Romano", phone: "+12025550106", email: "sofia.romano@example.com" },
  { name: "Ethan Wright", phone: "+12025550107", email: "ethan.wright@example.com" },
  { name: "Naomi Klein", phone: "+12025550108", email: "naomi.klein@example.com" },
  { name: "Wes Park", phone: "+12025550109", email: "wes.park@example.com" },
  { name: "Carmen Diaz", phone: "+12025550110", email: "carmen.diaz@example.com" },
  { name: "Trevor Hill", phone: "+12025550111", email: "trevor.hill@example.com" },
];

/** NANP-reserved 555-01xx fixtures; carriers must never route these to a real person. */
export const DEMO_SMS_NUMBERS = Array.from(
  { length: TARGET.smsThreads },
  (_, i) => `+120255501${String(i + 20).slice(-2)}`,
);

/** Retired malformed demo numbers, retained only so a re-seed removes old rows. */
export const LEGACY_DEMO_SMS_NUMBERS = Array.from(
  { length: TARGET.smsThreads },
  (_, i) => `+1555010${String(i + 1).padStart(4, "0")}`,
);

const ALL_DEMO_SMS_NUMBERS = [...DEMO_SMS_NUMBERS, ...LEGACY_DEMO_SMS_NUMBERS];

/** Demo conversations have no carrier destination. Live line threads can share a caller number. */
export function demoSmsThreadFilter(userId: string, numbers = ALL_DEMO_SMS_NUMBERS) {
  return and(
    eq(smsThreads.userId, userId),
    isNull(smsThreads.destinationNumber),
    inArray(smsThreads.customerNumber, numbers),
  );
}

export function lockDemoData(tx: DemoSeedDb, userId: string) {
  return tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`demo-seed:${userId}`}, 0))`,
  );
}

const SAMPLE_SUMMARIES = [
  "Qualified inbound lead, asked about pricing for 5-seat plan. Booked Maya for demo Thursday 2pm.",
  "Existing customer, confused about overage line on invoice. Walked them through the meter, sent recap email.",
  "Discovery call. Prospect runs 3-person concierge medical practice, wants HIPAA story before committing.",
  "Outbound cold call. Lead asked us to call back Tuesday, scheduled in CRM.",
  "Voicemail left. Referenced our website, asked for sales callback.",
  "Tech support. Webhook signature error, walked them through rotating the secret.",
  "Tier comparison call. Customer downgrading from Pro to Starter, captured why (seasonal slowdown).",
  "Demo booked. Prospect switching from their current provider, wants to see the outbound playbook.",
  "Renewal conversation. Customer happy, asked about the Pro supervisor cockpit.",
  "Sales qual. 50-seat call-center prospect, routed to Liam for enterprise quote.",
  "Refund request. Reported a duplicate charge during pause, captured the invoice details, and queued billing review.",
  "Knowledge gap detected. Customer asked about Slack DLP, captured to docs queue.",
];

// What each sample call achieved, in the digest's own tags, so demo Call
// History says "Booked" where the summary says a demo was booked.
const SAMPLE_OUTCOME_TAGS = [
  "booked",
  "info",
  "qualified",
  "followup",
  "unreachable",
  "info",
  "info",
  "booked",
  "info",
  "qualified",
  "followup",
  "info",
] as const satisfies readonly CallOutcomeTag[];

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
  "Scale support and implementation terms are confirmed in the signed order. Do not promise a dedicated CSM, fixed handoff period, or SLA unless it is written in that customer's agreement.",
  "Refund policy: the first subscription invoice is eligible for review when the request arrives within 30 days. Verify the account and transaction; never promise or issue a refund from a conversation alone.",
  "When troubleshooting webhook signature errors, rotate the signing secret from the integrations dashboard first, then re-verify delivery on the next event.",
  "Competitive wedge: we win on two-way SMS, email agents, and the supervisor cockpit. Lead with that triple when a prospect is comparing vendors.",
  "Enterprise requests for SCCs, a DPA, a BAA, security review, SLAs, or other contractual terms must be escalated and confirmed in writing. HIPAA and BAA support are not currently available.",
];

const LEGACY_DEMO_KNOWLEDGE_REPLACEMENTS = [
  {
    legacy:
      "Scale customers get a dedicated CSM. CSM hands off after the first 90 days unless the customer asks to continue.",
    current: SAMPLE_KNOWLEDGE[1],
  },
  {
    legacy:
      "Refund window: 14 days from invoice for any new charge. Beyond that we offer credits but not refunds.",
    current: SAMPLE_KNOWLEDGE[2],
  },
  {
    legacy:
      "Enterprise legal redlines: we accept SCC, DPA, BAA on request. Security review pack available under NDA.",
    current: SAMPLE_KNOWLEDGE[5],
  },
] as const;

const SAMPLE_APPOINTMENT_TYPES = [
  "Discovery Call",
  "Live Demo",
  "Onboarding Walkthrough",
  "Quarterly Business Review",
  "Pricing Review",
  "Renewal Conversation",
];

// Email-shaped sample mail: each thread's subject, digest, customer message
// and Bot reply describe the same conversation, and the reply is unsigned
// because the account names its own Bot.
const SAMPLE_EMAILS = [
  {
    subject: "Pricing for 5-seat plan?",
    summary:
      "Five-person team asked about pricing and yearly billing. Offered a walkthrough Thursday.",
    body: "We're a five-person team looking at BotBound. What would five seats cost each month, and is there a discount for paying yearly?",
    reply:
      "Thanks for asking. I've sent the current plan options for five seats, including yearly billing. I can also walk you through them on a short call Thursday at 2 PM if that helps.",
  },
  {
    subject: "Re: invoice overage line item",
    summary: "Customer asked about the overage line on the last invoice. Sent a usage breakdown.",
    body: "Our last invoice has an overage line I don't understand. Can you explain what it covers?",
    reply:
      "Of course. The overage line covers usage past your plan's included amount last month. I've sent a day-by-day breakdown so you can see where it came from.",
  },
  {
    subject: "HIPAA + BotBound for our practice",
    summary:
      "Concierge medical practice asked how patient information is handled before committing.",
    body: "We run a three-person concierge medical practice. Before we go further, can you tell us how you handle patient information?",
    reply:
      "Thanks for checking first. I've sent our security overview, and I can set up a call with our team to go through any questions.",
  },
  {
    subject: "Follow-up from yesterday's call",
    summary: "Lead asked for a callback Tuesday morning. Callback scheduled.",
    body: "Thanks for the call yesterday. Could you call me back Tuesday morning to pick up where we left off?",
    reply:
      "Happy to. I've scheduled a callback for Tuesday at 10 AM. Reply here if another time suits you better.",
  },
  {
    subject: "Demo request: outbound playbook",
    summary: "Prospect switching providers asked for an outbound calling demo. Offered two times.",
    body: "We're switching providers and want to see how outbound calling works before we decide. Can we book a demo?",
    reply: "Absolutely. I have Wednesday at 11 AM or Thursday at 3 PM open. Which works for you?",
  },
  {
    subject: "Pro supervisor cockpit",
    summary: "Renewing customer asked what the supervisor view includes. Sent an overview.",
    body: "We're renewing and wanted to ask about the supervisor view on the Pro plan. What does it include?",
    reply:
      "Thanks for renewing. I've sent a short overview of the supervisor view, and I can show it live on a quick call.",
  },
  {
    subject: "Refund for duplicate charge",
    summary: "Customer reported a duplicate charge during a pause. Queued for billing review.",
    body: "We were charged twice while our account was paused. Could you refund the duplicate?",
    reply:
      "Sorry about that. I've passed the duplicate charge to billing for review, and you'll hear back within one business day.",
  },
  {
    subject: "Integration question: Slack alerts",
    summary: "Customer asked about Slack alerts for follow-ups. Passed to the team to confirm.",
    body: "Can BotBound post an alert to our Slack channel when a call needs follow-up?",
    reply:
      "Good question. I've passed this to our team so they can confirm what's possible for your workspace, and they'll reply here.",
  },
  {
    subject: "Can you take calls after hours?",
    summary: "Office asked about evening calls and next-day booking.",
    body: "Our office closes at 6. Can your Bot answer calls in the evening and book appointments for the next day?",
    reply:
      "Yes. Your Bot can answer around the clock and book into the hours you set in Availability.",
  },
  {
    subject: "Enterprise quote: 50 seats",
    summary: "50-seat call center asked for a quote. Routed to the enterprise team.",
    body: "We run a 50-seat call center and need a quote. Who should we talk to?",
    reply:
      "Thanks for reaching out. I've passed your request to our enterprise team, and they'll be in touch today to set up a call.",
  },
  {
    subject: "Thanks for the quick support",
    summary: "Customer confirmed the webhook fix worked.",
    body: "Just wanted to say thanks. The webhook fix worked and everything is running again.",
    reply: "Glad it's working. Reply here anytime if anything else comes up.",
  },
  {
    subject: "Scheduling conflict on Thursday demo",
    summary: "Prospect asked to move Thursday's demo. Moved to Friday afternoon.",
    body: "Something came up on Thursday. Can we move the demo to Friday afternoon?",
    reply: "No problem. I've moved your demo to Friday at 2 PM and sent an updated invite.",
  },
] as const;

function seedEmailBody(sample: (typeof SAMPLE_EMAILS)[number], customerName: string): string {
  return `Hi there,\n\n${sample.body}\n\nThanks,\n${customerName.split(" ")[0]}`;
}

const SAMPLE_STOP_CONFIRMATION =
  "You have been unsubscribed. You will not receive any more messages from this number. Reply START to opt back in.";

const SAMPLE_SMS_SNIPPETS = [
  "Hi, can someone call me about the Pro plan?",
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
    const [eligibleSettings] = await tx
      .update(schema.settings)
      .set({
        subscriptionStatus: "active",
        updatedAt: new Date(),
      })
      .where(
        and(eq(schema.settings.userId, userId), eq(schema.settings.accountEnvironment, "demo")),
      )
      .returning({ userId: schema.settings.userId });
    if (!eligibleSettings) {
      throw new Error(
        "Demo seed refused: classify the exact account as demo through the audited operator command first.",
      );
    }

    const activated = await tx
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
        setWhere: and(
          isNull(subscriptions.stripeCustomerId),
          isNull(subscriptions.stripeSubscriptionId),
          isNull(subscriptions.stripePriceId),
        ),
      })
      .returning({ userId: subscriptions.userId });
    if (!activated[0]) {
      throw new Error("Demo seed refused: Stripe-bound accounts cannot receive demo entitlement.");
    }
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
    .where(demoSmsThreadFilter(userId, DEMO_SMS_NUMBERS));
  return Number(row?.c ?? 0);
}

async function pruneLegacyDemoSmsThreads(userId: string, tx: DemoSeedDb): Promise<number> {
  const rows = await tx
    .select({ id: smsThreads.id })
    .from(smsThreads)
    .where(demoSmsThreadFilter(userId, LEGACY_DEMO_SMS_NUMBERS));
  if (rows.length === 0) return 0;
  const threadIds = rows.map((row) => row.id);
  await tx.delete(smsMessages).where(inArray(smsMessages.threadId, threadIds));
  await tx
    .delete(smsThreads)
    .where(and(eq(smsThreads.userId, userId), inArray(smsThreads.id, threadIds)));
  return rows.length;
}

/** Re-apply varied copy when demo rows already exist (idempotent re-seed / bulk-SQL repair). */
async function refreshDemoShowcaseCopy(userId: string, tx: DemoSeedDb): Promise<void> {
  await pruneDuplicateDemoLeads(userId, tx);
  await pruneExcessSeedEmailThreads(userId, tx);

  for (const replacement of LEGACY_DEMO_KNOWLEDGE_REPLACEMENTS) {
    await tx
      .update(knowledge)
      .set({ content: replacement.current })
      .where(and(eq(knowledge.userId, userId), eq(knowledge.content, replacement.legacy)));
  }

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
        customerNumber: SAMPLE_CUSTOMERS[i % SAMPLE_CUSTOMERS.length].phone,
        summary: SAMPLE_SUMMARIES[idx],
        outcomeTag: SAMPLE_OUTCOME_TAGS[idx],
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
    const sample = SAMPLE_EMAILS[i % SAMPLE_EMAILS.length];
    const customer = SAMPLE_CUSTOMERS[i % SAMPLE_CUSTOMERS.length];
    await tx
      .update(emailThreads)
      .set({
        customerEmail: customer.email,
        summary: sample.summary,
        subject: sample.subject,
        intentLabel: SAMPLE_INTENTS[idx % SAMPLE_INTENTS.length],
        read: true,
      })
      .where(eq(emailThreads.id, seedEmails[i].id));
    // Older seeds wrote call summaries as email bodies; rewrite only the seeded pair.
    for (const [suffix, content] of [
      ["in", seedEmailBody(sample, customer.name)],
      ["out", sample.reply],
    ] as const) {
      await tx
        .update(emailMessages)
        .set({ content })
        .where(
          and(
            eq(emailMessages.userId, userId),
            eq(emailMessages.threadId, seedEmails[i].id),
            like(emailMessages.googleMessageId, `seed-gmail-%-${suffix}`),
          ),
        );
    }
  }

  const seededAppointments = await tx
    .select({ id: appointments.id })
    .from(appointments)
    .where(and(eq(appointments.userId, userId), eq(appointments.demo, true)))
    .orderBy(appointments.id);
  for (let i = 0; i < seededAppointments.length; i++) {
    const customer = SAMPLE_CUSTOMERS[i % SAMPLE_CUSTOMERS.length];
    await tx
      .update(appointments)
      .set({ customerName: customer.name, phoneNumber: customer.phone })
      .where(eq(appointments.id, seededAppointments[i].id));
  }

  // (user_id, phone) is unique, and row ids are random, so rewriting every row
  // in id order collides with a number a later row still holds. Only move the
  // rows that sit outside the showcase set, onto numbers no row holds yet.
  const seededDncRows = await tx
    .select({ id: dncList.id, phone: dncList.phone })
    .from(dncList)
    .where(and(eq(dncList.userId, userId), eq(dncList.demo, true)))
    .orderBy(dncList.id);
  const showcaseDncPhones = seededDncRows.map(
    (_, i) => SAMPLE_CUSTOMERS[(i + 7) % SAMPLE_CUSTOMERS.length].phone,
  );
  const heldDncPhones = new Set(seededDncRows.map((row) => row.phone));
  const freeDncPhones = [...new Set(showcaseDncPhones)].filter(
    (phone) => !heldDncPhones.has(phone),
  );
  for (const row of seededDncRows) {
    if (showcaseDncPhones.includes(row.phone)) continue;
    const phone = freeDncPhones.shift();
    if (!phone) break;
    await tx.update(dncList).set({ phone }).where(eq(dncList.id, row.id));
  }

  for (let i = 0; i < DEMO_SMS_NUMBERS.length; i++) {
    const snippet = SAMPLE_SMS_SNIPPETS[i % SAMPLE_SMS_SNIPPETS.length];
    await tx
      .update(smsThreads)
      .set({ summary: snippet })
      .where(
        and(
          eq(smsThreads.userId, userId),
          isNull(smsThreads.destinationNumber),
          eq(smsThreads.customerNumber, DEMO_SMS_NUMBERS[i]),
        ),
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
  await ensureDemoProSubscription(userId);

  const report: SeedReport[] = [];
  const userPrefix = userId.slice(0, 8);

  await drizzle.transaction(async (tx) => {
    await lockDemoData(tx, userId);
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
          outcomeTag: SAMPLE_OUTCOME_TAGS[i % SAMPLE_OUTCOME_TAGS.length],
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
        const sample = SAMPLE_EMAILS[index % SAMPLE_EMAILS.length];
        const threadId = seedEmailThreadId(userId, index);
        const [thread] = await tx
          .insert(emailThreads)
          .values({
            userId,
            agentId,
            threadId,
            customerEmail: cust.email,
            subject: sample.subject,
            status: "open",
            summary: sample.summary,
            leadScore: 45 + Math.floor(Math.random() * 50),
            intentLabel: SAMPLE_INTENTS[index % SAMPLE_INTENTS.length],
            read: true,
            lastMessageAt: randomCreatedAt(10),
            createdAt: randomCreatedAt(14),
          })
          .onConflictDoNothing({ target: [emailThreads.userId, emailThreads.threadId] })
          .returning({ id: emailThreads.id });

        if (thread?.id) {
          const inboundBody = seedEmailBody(sample, cust.name);
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
            content: sample.reply,
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
      const prunedLegacy = await pruneLegacyDemoSmsThreads(userId, tx);
      const before = await countSeedSmsThreads(userId, tx);
      let inserted = 0;
      for (const [i, phone] of DEMO_SMS_NUMBERS.entries()) {
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
          .onConflictDoNothing({
            target: [smsThreads.userId, smsThreads.customerNumber],
            where: isNull(smsThreads.destinationNumber),
          })
          .returning({ id: smsThreads.id });
        threadId = insertedThread?.id;
        if (!threadId) {
          const [existing] = await tx
            .select({ id: smsThreads.id })
            .from(smsThreads)
            .where(
              and(
                eq(smsThreads.userId, userId),
                isNull(smsThreads.destinationNumber),
                eq(smsThreads.customerNumber, phone),
              ),
            )
            .limit(1);
          threadId = existing?.id;
        }

        if (threadId) {
          const inbound = SAMPLE_SMS_SNIPPETS[i % SAMPLE_SMS_SNIPPETS.length];
          const genericReply = `Hi ${cust.name.split(" ")[0]}, thanks for texting. Happy to help with that. Reply anytime.`;
          const outboundSid = `seed-sms-${userPrefix}-${i}-out`;
          const isStop = inbound === "STOP";
          const msgCount = await tx
            .select({ c: sql<number>`COUNT(*)::int` })
            .from(smsMessages)
            .where(eq(smsMessages.threadId, threadId));
          if (Number(msgCount[0]?.c ?? 0) === 0) {
            const receivedAt = randomCreatedAt(5);
            await tx.insert(smsMessages).values({
              userId,
              threadId,
              direction: "in",
              body: inbound,
              twilioSid: `seed-sms-${userPrefix}-${i}-in`,
              createdAt: receivedAt,
            });
            await tx.insert(smsMessages).values({
              userId,
              threadId,
              direction: "out",
              body: isStop ? SAMPLE_STOP_CONFIRMATION : genericReply,
              twilioSid: outboundSid,
              agentId,
              createdAt: new Date(Math.min(Date.now(), receivedAt.getTime() + 30_000)),
            });
          } else if (isStop) {
            // Repair only the old synthetic reply, preserving edits and real messages.
            await tx
              .update(smsMessages)
              .set({ body: SAMPLE_STOP_CONFIRMATION })
              .where(
                and(
                  eq(smsMessages.threadId, threadId),
                  eq(smsMessages.twilioSid, outboundSid),
                  eq(smsMessages.body, genericReply),
                ),
              );
          }
          if (insertedThread) inserted++;
        }
      }
      if (prunedLegacy > 0) {
        log.info("Pruned legacy demo SMS fixtures", { userId, pruned: prunedLegacy });
      }
      report.push({ table: "wireline_sms_threads", before, inserted, after: before + inserted });
    }

    await refreshDemoShowcaseCopy(userId, tx);
  });

  invalidateDashboard(userId);
  log.info("Demo account seeded", { userId, report });
  return { agentId, report };
}
