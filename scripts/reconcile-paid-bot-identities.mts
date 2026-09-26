#!/usr/bin/env node
import { and, asc, eq, inArray } from "drizzle-orm";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as schema from "../src/db/schema";
import {
  assertTwilioOwnedNumber,
  ensurePaidBotIdentity,
  getPaidBotIdentityAgentIds,
} from "../src/lib/paid-bot-identity";
import { hasExactAgentMailManagedScope } from "../src/lib/agentmail-mail";
import { drizzle } from "../src/lib/server-context";
import { getErrorMessage } from "../src/lib/server-utils";

const APPLY = process.argv.includes("--apply");
const PAID_PLANS = ["starter", "team", "business", "enterprise"] as const;
const ACTIVE_STATUSES = ["active"] as const;

type Candidate = {
  agentId: string;
  userId: string;
  name: string;
  plan: string;
  status: string;
};

async function candidates(): Promise<{ eligible: Candidate[]; intentionallyIneligible: number }> {
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
    .innerJoin(schema.settings, eq(schema.settings.userId, schema.agents.userId))
    .where(
      and(
        inArray(schema.subscriptions.plan, [...PAID_PLANS]),
        inArray(schema.subscriptions.status, [...ACTIVE_STATUSES]),
        eq(schema.settings.accountEnvironment, "production"),
      ),
    )
    .orderBy(asc(schema.agents.userId), asc(schema.agents.createdAt));

  const rosterByUser = new Map<string, Set<string>>();
  const eligibleRows = [] as typeof rows;
  for (const row of rows) {
    let roster = rosterByUser.get(row.userId);
    if (!roster) {
      roster = new Set(await getPaidBotIdentityAgentIds(row.userId));
      rosterByUser.set(row.userId, roster);
    }
    if (roster.has(row.agentId)) eligibleRows.push(row);
  }
  return {
    intentionallyIneligible: rows.length - eligibleRows.length,
    eligible: eligibleRows.map((row) => ({
      agentId: row.agentId,
      userId: row.userId,
      name: row.name || "Bot",
      plan: row.plan || "unknown",
      status: row.status || "unknown",
    })),
  };
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
        ),
      )
      .limit(1),
    drizzle
      .select({
        id: schema.emailAccounts.id,
        email: schema.emailAccounts.emailAddress,
        scopes: schema.emailAccounts.oauthGrantedScopes,
      })
      .from(schema.emailAccounts)
      .where(
        and(
          eq(schema.emailAccounts.userId, candidate.userId),
          eq(schema.emailAccounts.agentId, candidate.agentId),
          eq(schema.emailAccounts.provider, "agentmail"),
        ),
      ),
  ]);
  const phone = phones[0]?.phone || null;
  let phoneOwnership: "verified" | "unverified" | "missing" = phone ? "unverified" : "missing";
  let phoneOwnershipError: string | null = null;
  if (phone) {
    try {
      // This is the same read-only account-ownership check used by provisioning.
      // Stored legacy/imported phone rows alone are not carrier ownership proof.
      await assertTwilioOwnedNumber(phone);
      phoneOwnership = "verified";
    } catch (error) {
      phoneOwnershipError = getErrorMessage(error);
    }
  }
  return {
    phone,
    phoneOwnership,
    phoneOwnershipError,
    email: mailboxes.find((row) => hasExactAgentMailManagedScope(row.scopes))?.email || null,
  };
}

export async function main() {
  const { eligible: rows, intentionallyIneligible } = await candidates();
  const inspected = [] as Array<{
    agentId: string;
    name: string;
    plan: string;
    phone: string | null;
    email: string | null;
    phoneOwnership: "verified" | "unverified" | "missing";
    phoneOwnershipError: string | null;
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
      phoneOwnership: current.phoneOwnership,
      phoneOwnershipError: current.phoneOwnershipError,
      complete: Boolean(current.phoneOwnership === "verified" && current.email),
    });
  }

  const missing = inspected.filter((row) => !row.complete);
  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        scope: "Entitlement eligibility, Twilio ownership, and local managed-mailbox records",
        deliveryVerified: false,
        paidBots: inspected.length,
        intentionallyIneligibleBots: intentionallyIneligible,
        complete: inspected.length - missing.length,
        missingIdentity: missing.length,
        missing: missing.map(
          ({ agentId, name, plan, phone, email, phoneOwnership, phoneOwnershipError }) => ({
            agentId,
            name,
            plan,
            hasPhone: Boolean(phone),
            hasManagedEmail: Boolean(email),
            phoneOwnership,
            phoneOwnershipError,
          }),
        ),
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
  if (!rows.length) return;

  if (!process.env.AGENTMAIL_DEFAULT_DOMAIN?.trim()) {
    throw new Error(
      "AGENTMAIL_DEFAULT_DOMAIN must be set before applying paid Bot identity reconciliation.",
    );
  }
  if (!process.env.AGENTMAIL_API_KEY?.trim()) {
    throw new Error(
      "AGENTMAIL_API_KEY must be set before applying paid Bot identity reconciliation.",
    );
  }

  let repaired = 0;
  const failures: Array<{ agentId: string; error: string }> = [];
  for (const candidate of rows) {
    try {
      const result = await ensurePaidBotIdentity({
        userId: candidate.userId,
        agentId: candidate.agentId,
      });
      if (result.eligible && result.phone && result.email) repaired += 1;
      else if (result.eligible)
        failures.push({
          agentId: candidate.agentId,
          error: "Choose a number in Phone setup before managed email setup can continue.",
        });
      console.log(
        JSON.stringify({
          agentId: candidate.agentId,
          name: candidate.name,
          plan: candidate.plan,
          eligible: result.eligible,
          selectionRequired: result.selectionRequired === true,
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  });
}
