/**
 * Holding a Bot while it is deleted.
 *
 * Deletion releases a Bot's number and mailbox before it removes the Bot, so
 * nothing may start new work for the Bot in between: a call placed then dials
 * from a number being released, a call answered then writes rows for a Bot
 * about to vanish, and identity setup recreates the mailbox. Deletion takes the
 * Bot's admission lock exclusively, confirms the Bot is idle, and records a
 * hold. Outbound placement, inbound call claims, and identity setup take the
 * lock shared and stop while a hold exists, so each either started before
 * deletion looked, and is found, or sees the hold.
 *
 * Identity setup spends minutes in provider calls without a call row or a
 * presence row to show for it, so it records its own marker for as long as it
 * runs, and deletion waits for it.
 *
 * Holds and markers are account operation leases. Each is cleared when its
 * work finishes or fails; the expiry only covers a process that crashed.
 */
import { and, eq, gt, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle, log } from "./server-context";
import { getErrorMessage } from "./server-utils";

const LEASE_CRASH_CEILING_MS = 15 * 60_000;

type Db = Pick<typeof drizzle, "select" | "execute" | "insert" | "delete" | "transaction">;

function holdOperation(agentId: string): string {
  return `bot_deletion:${agentId}`;
}

function setupOperation(agentId: string): string {
  return `bot_identity_setup:${agentId}`;
}

export async function lockBotAdmission(
  tx: Pick<typeof drizzle, "execute">,
  agentId: string,
  mode: "shared" | "exclusive",
): Promise<void> {
  const key = `bot-admission:${agentId}`;
  await tx.execute(
    mode === "shared"
      ? sql`SELECT pg_advisory_xact_lock_shared(hashtext(${key}))`
      : sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`,
  );
}

async function activeLeaseExists(
  tx: Pick<typeof drizzle, "select">,
  userId: string,
  operation: string,
): Promise<boolean> {
  const [lease] = await tx
    .select({ id: schema.accountOperationLeases.id })
    .from(schema.accountOperationLeases)
    .where(
      and(
        eq(schema.accountOperationLeases.userId, userId),
        eq(schema.accountOperationLeases.operation, operation),
        gt(schema.accountOperationLeases.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return Boolean(lease);
}

async function insertLease(
  tx: Pick<Db, "insert">,
  userId: string,
  operation: string,
): Promise<string> {
  const [lease] = await tx
    .insert(schema.accountOperationLeases)
    .values({
      userId,
      kind: "provider",
      operation,
      expiresAt: new Date(Date.now() + LEASE_CRASH_CEILING_MS),
    })
    .returning({ id: schema.accountOperationLeases.id });
  if (!lease) throw new Error(`Account operation lease ${operation} was not recorded.`);
  return lease.id;
}

/** Read inside a transaction that holds the Bot's admission lock. */
export async function botDeletionHoldExists(
  tx: Pick<typeof drizzle, "select">,
  userId: string,
  agentId: string,
): Promise<boolean> {
  return activeLeaseExists(tx, userId, holdOperation(agentId));
}

/** Read inside a transaction that holds the Bot's admission lock. */
export async function botIdentitySetupActive(
  tx: Pick<typeof drizzle, "select">,
  userId: string,
  agentId: string,
): Promise<boolean> {
  return activeLeaseExists(tx, userId, setupOperation(agentId));
}

/**
 * Record the hold, or return null when another deletion already holds the Bot.
 * The caller holds the exclusive admission lock and found the Bot idle.
 */
export async function placeBotDeletionHold(
  tx: Pick<Db, "select" | "insert">,
  userId: string,
  agentId: string,
): Promise<string | null> {
  if (await botDeletionHoldExists(tx, userId, agentId)) return null;
  return insertLease(tx, userId, holdOperation(agentId));
}

/**
 * Mark identity setup as running for this Bot, or return null while a deletion
 * holds it. End the marker with `endBotIdentitySetup` when setup returns.
 */
export async function beginBotIdentitySetup(
  userId: string,
  agentId: string,
  db: Pick<typeof drizzle, "transaction"> = drizzle,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    await lockBotAdmission(tx, agentId, "shared");
    if (await botDeletionHoldExists(tx, userId, agentId)) return null;
    return insertLease(tx, userId, setupOperation(agentId));
  });
}

async function clearLease(db: Pick<Db, "delete">, userId: string, leaseId: string): Promise<void> {
  await db
    .delete(schema.accountOperationLeases)
    .where(
      and(
        eq(schema.accountOperationLeases.userId, userId),
        eq(schema.accountOperationLeases.id, leaseId),
      ),
    );
}

export async function clearBotDeletionHold(
  db: Pick<Db, "delete">,
  userId: string,
  holdId: string,
): Promise<void> {
  await clearLease(db, userId, holdId);
}

/** Best effort: a marker that can't be cleared expires on its own. */
export async function endBotIdentitySetup(userId: string, markerId: string): Promise<void> {
  try {
    await clearLease(drizzle, userId, markerId);
  } catch (error) {
    log.warn("Bot identity setup marker left to expire", {
      userId,
      markerId,
      error: getErrorMessage(error),
    });
  }
}
