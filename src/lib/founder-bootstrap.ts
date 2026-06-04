/**
 * Founder account bootstrap — seeds the owner fleet once when empty.
 * Invoked from auth bootstrap (not hot read paths like GET /api/agents).
 */
import { eq, sql } from "drizzle-orm";
import { drizzle, log } from "./server-context";
import * as schema from "../db/schema";
import { isOwnerEmail } from "./auth-service";
import { seedFounderFleet } from "./founder-fleet-seed";
import { getErrorMessage } from "./server-utils";

const bootstrapInFlight = new Set<string>();

export interface FounderBootstrapResult {
  seeded: boolean;
  skipped: boolean;
}

/**
 * Serialize founder bootstrap across concurrent serverless instances.
 * Uses a transaction-scoped advisory lock so only one seed runs at a time.
 */
export async function bootstrapFounderFleetIfEmpty(
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
    return await drizzle.transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('founder-bootstrap'), hashtext(${userId}))`,
      );

      const agentCount = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.agents)
        .where(eq(schema.agents.userId, userId));
      if ((agentCount[0]?.n ?? 0) > 0) {
        return { seeded: false, skipped: true };
      }

      await seedFounderFleet(userId);
      log.info("founder fleet bootstrap completed", { userId });
      return { seeded: true, skipped: false };
    });
  } catch (e) {
    log.warn("founder fleet bootstrap failed", { userId, error: getErrorMessage(e) });
    return { seeded: false, skipped: false };
  } finally {
    bootstrapInFlight.delete(userId);
  }
}

/** Fire-and-forget bootstrap after OAuth/password sign-in. */
export function scheduleFounderBootstrap(userId: string, email: string | null | undefined): void {
  void bootstrapFounderFleetIfEmpty(userId, email);
}

/** Test helper — clear in-flight guard. */
export function resetFounderBootstrapForTests(): void {
  bootstrapInFlight.clear();
}
