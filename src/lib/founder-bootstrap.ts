/**
 * Founder account bootstrap — enterprise entitlements + full agent Assistants.
 * Invoked from auth bootstrap (not hot read paths like GET /api/agents).
 */
import { eq, sql } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { isOwnerEmail } from "./auth-service";
import { EXPECTED_FOUNDER_FLEET_AGENT_COUNT, seedFounderAssistant } from "./founder-fleet-seed";
import { FOUNDER_EFFECTIVE_PLAN_ID } from "./plan-entitlements";
import { getErrorMessage } from "./server-utils";

const bootstrapInFlight = new Set<string>();

export interface FounderBootstrapResult {
  seeded: boolean;
  skipped: boolean;
  subscriptionEnsured?: boolean;
}

/** Upsert enterprise subscription so billing + entitlements match owner dogfood. */
export async function ensureFounderEnterpriseSubscription(userId: string): Promise<void> {
  const currentPeriodEnd = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  await drizzle
    .insert(schema.subscriptions)
    .values({
      userId,
      plan: FOUNDER_EFFECTIVE_PLAN_ID,
      status: "active",
      currentPeriodEnd,
      cancelAtPeriodEnd: false,
    })
    .onConflictDoUpdate({
      target: [schema.subscriptions.userId],
      set: {
        plan: FOUNDER_EFFECTIVE_PLAN_ID,
        status: "active",
        currentPeriodEnd,
        cancelAtPeriodEnd: false,
        updatedAt: new Date(),
      },
    });

  await drizzle
    .insert(schema.settings)
    .values({
      id: userId,
      userId,
      subscriptionStatus: "active",
    })
    .onConflictDoUpdate({
      target: schema.settings.userId,
      set: {
        subscriptionStatus: "active",
        updatedAt: new Date(),
      },
    });
}

/**
 * Serialize founder bootstrap across concurrent serverless instances.
 * Uses a transaction-scoped advisory lock so only one seed runs at a time.
 */
export async function bootstrapFounderAssistantIfEmpty(
  userId: string,
  email: string | null | undefined,
): Promise<FounderBootstrapResult> {
  if (!isOwnerEmail(email)) {
    return { seeded: false, skipped: true };
  }
  if (bootstrapInFlight.has(userId)) {
    return { seeded: false, skipped: true };
  }

  bootstrapInFlight.add(userId);
  try {
    await ensureFounderEnterpriseSubscription(userId);

    return await drizzle.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('founder-bootstrap'), hashtext(${userId}))`,
      );

      const agentCounts = await tx
        .select({
          n: sql<number>`count(*)::int`,
          businessAgents: sql<number>`count(*) filter (where ${schema.agents.isBusinessAgent} is true)::int`,
          personalAgents: sql<number>`count(*) filter (where coalesce(${schema.agents.isBusinessAgent}, false) is false)::int`,
        })
        .from(schema.agents)
        .where(eq(schema.agents.userId, userId));
      const count = agentCounts[0]?.n ?? 0;
      const businessAgents = agentCounts[0]?.businessAgents ?? 0;
      const personalAgents = agentCounts[0]?.personalAgents ?? 0;
      if (
        count >= EXPECTED_FOUNDER_FLEET_AGENT_COUNT &&
        businessAgents > 0 &&
        personalAgents > 0
      ) {
        return { seeded: false, skipped: true, subscriptionEnsured: true };
      }

      await seedFounderAssistant(userId);
      log.info("founder Assistants bootstrap completed", { userId, priorAgentCount: count });
      return { seeded: true, skipped: false, subscriptionEnsured: true };
    });
  } catch (e) {
    log.warn("founder Assistants bootstrap failed", { userId, error: getErrorMessage(e) });
    return { seeded: false, skipped: false };
  } finally {
    bootstrapInFlight.delete(userId);
  }
}

/** Fire-and-forget bootstrap after OAuth/password sign-in. */
export function scheduleFounderBootstrap(userId: string, email: string | null | undefined): void {
  void bootstrapFounderAssistantIfEmpty(userId, email);
}

/** Test helper — clear in-flight guard. */
export function resetFounderBootstrapForTests(): void {
  bootstrapInFlight.clear();
}
