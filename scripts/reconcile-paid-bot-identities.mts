#!/usr/bin/env node
import { and, asc, eq, inArray } from "drizzle-orm";

import * as schema from "../src/db/schema";
import { ensurePaidBotIdentity } from "../src/lib/paid-bot-identity";
import { drizzle } from "../src/lib/server-context";

const APPLY = process.argv.includes("--apply");
const PAID_PLANS = ["starter", "team", "business", "enterprise"] as const;
const ACTIVE_STATUSES = ["active", "trialing"] as const;

type Candidate = {
  agentId: string;
  userId: string;
  name: string;
  plan: string;
  status: string;
};

async function candidates(): Promise<Candidate[]> {
  const rows = await drizzle
    .select({
      agentId: schema.agents.id,
      userId: schema.agents.userId,
      name: schema.agents.name,
      plan: schema.subscriptions.plan,
      status: schema.subscriptions.status,
    })
    .from(schema.agents)
    .innerJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.agents.userId))
    .where(
      and(
        inArray(schema.subscriptions.plan, [...PAID_PLANS]),
        inArray(schema.subscriptions.status, [...ACTIVE_STATUSES]),
      ),
    )
    .orderBy(asc(schema.agents.userId), asc(schema.agents.createdAt));

  return rows.map((row) => ({
    agentId: row.agentId,
    userId: row.userId,
    name: row.name || "Bot",
    plan: row.plan || "unknown",
    status: row.status || "unknown",
  }));
}

async function existingIdentity(candidate: Candidate) {
  const [phones, mailboxes] = await Promise.all([
    drizzle
      .select({ id: schema.phoneNumbers.id, phone: schema.phoneNumbers.phoneNumber })
      .from(schema.phoneNumbers)
      .where(
        and(
          eq(schema.phoneNumbers.userId, candidate.userId),
          eq(schema.phoneNumbers.agentId, candidate.agentId),
          eq(schema.phoneNumbers.status, "active"),
        ),
      )
      .limit(1),
    drizzle
      .select({ id: schema.emailAccounts.id, email: schema.emailAccounts.emailAddress })
      .from(schema.emailAccounts)
      .where(
        and(
          eq(schema.emailAccounts.userId, candidate.userId),
          eq(schema.emailAccounts.agentId, candidate.agentId),
          eq(schema.emailAccounts.provider, "agentmail"),
        ),
      )
      .limit(1),
  ]);
  return {
    phone: phones[0]?.phone || null,
    email: mailboxes[0]?.email || null,
  };
}

async function main() {
  const rows = await candidates();
  const inspected = [] as Array<{
    agentId: string;
    name: string;
    plan: string;
    phone: string | null;
    email: string | null;
    complete: boolean;
  }>;

  for (const candidate of rows) {
    const current = await existingIdentity(candidate);
    inspected.push({
      agentId: candidate.agentId,
      name: candidate.name,
      plan: candidate.plan,
      phone: current.phone,
      email: current.email,
      complete: Boolean(current.phone && current.email),
    });
  }

  const missing = inspected.filter((row) => !row.complete);
  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        paidBots: inspected.length,
        complete: inspected.length - missing.length,
        missingIdentity: missing.length,
        missing: missing.map(({ agentId, name, plan, phone, email }) => ({
          agentId,
          name,
          plan,
          hasPhone: Boolean(phone),
          hasManagedEmail: Boolean(email),
        })),
      },
      null,
      2,
    ),
  );

  if (!APPLY) {
    if (missing.length) {
      console.error(
        `Dry run only. ${missing.length} paid Bot(s) still need identity resources. Re-run with --apply only after Twilio and the verified AgentMail custom domain are production-ready.`,
      );
      process.exitCode = 2;
    }
    return;
  }

  if (!process.env.AGENTMAIL_DEFAULT_DOMAIN?.trim()) {
    throw new Error("AGENTMAIL_DEFAULT_DOMAIN must be set before applying paid Bot identity reconciliation.");
  }
  if (!process.env.AGENTMAIL_API_KEY?.trim()) {
    throw new Error("AGENTMAIL_API_KEY must be set before applying paid Bot identity reconciliation.");
  }

  let repaired = 0;
  const failures: Array<{ agentId: string; error: string }> = [];
  for (const candidate of rows) {
    try {
      const result = await ensurePaidBotIdentity({
        userId: candidate.userId,
        agentId: candidate.agentId,
      });
      if (result.eligible) repaired += 1;
      console.log(
        JSON.stringify({
          agentId: candidate.agentId,
          name: candidate.name,
          plan: candidate.plan,
          eligible: result.eligible,
          phone: result.phone,
          email: result.email,
          phoneReused: result.phoneReused,
          emailReused: result.emailReused,
        }),
      );
    } catch (error) {
      failures.push({
        agentId: candidate.agentId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({ repaired, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
