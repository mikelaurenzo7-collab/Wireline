/**
 * Holding a Bot while it is deleted.
 *
 * Deletion releases a Bot's number and mailbox before it removes the Bot, so
 * nothing may start new provider work for the Bot in between: a call placed
 * then dials from a number being released, and identity setup recreates the
 * mailbox. Deletion takes the Bot's admission lock exclusively, confirms the
 * Bot is idle, and records a hold. Call placement and identity setup take the
 * lock shared and stop while a hold exists, so each either finished starting
 * before deletion looked or sees the hold.
 *
 * The hold is an account operation lease. Deletion clears it when it finishes
 * or fails; the expiry only covers a deletion that crashed.
 */
import { and, eq, gt, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { drizzle } from "./server-context";

const BOT_DELETION_HOLD_MS = 15 * 60_000;

type Db = Pick<typeof drizzle, "select" | "execute" | "insert" | "delete" | "transaction">;

function holdOperation(agentId: string): string {
  return `bot_deletion:${agentId}`;
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

/** Read inside a transaction that holds the Bot's admission lock. */
export async function botDeletionHoldExists(
  tx: Pick<typeof drizzle, "select">,
  userId: string,
  agentId: string,
): Promise<boolean> {
  const [hold] = await tx
    .select({ id: schema.accountOperationLeases.id })
    .from(schema.accountOperationLeases)
    .where(
      and(
        eq(schema.accountOperationLeases.userId, userId),
        eq(schema.accountOperationLeases.operation, holdOperation(agentId)),
        gt(schema.accountOperationLeases.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return Boolean(hold);
}

/** Whether this Bot is being deleted. Check before starting provider work for it. */
export async function isBotBeingDeleted(
  userId: string,
  agentId: string,
  db: Pick<typeof drizzle, "transaction"> = drizzle,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockBotAdmission(tx, agentId, "shared");
    return botDeletionHoldExists(tx, userId, agentId);
  });
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
  const [hold] = await tx
    .insert(schema.accountOperationLeases)
    .values({
      userId,
      kind: "provider",
      operation: holdOperation(agentId),
      expiresAt: new Date(Date.now() + BOT_DELETION_HOLD_MS),
    })
    .returning({ id: schema.accountOperationLeases.id });
  if (!hold) throw new Error("Bot deletion hold was not recorded.");
  return hold.id;
}

export async function clearBotDeletionHold(
  db: Pick<Db, "delete">,
  userId: string,
  holdId: string,
): Promise<void> {
  await db
    .delete(schema.accountOperationLeases)
    .where(
      and(
        eq(schema.accountOperationLeases.userId, userId),
        eq(schema.accountOperationLeases.id, holdId),
      ),
    );
}
