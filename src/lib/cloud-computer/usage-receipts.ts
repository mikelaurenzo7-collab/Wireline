import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";

import {
  computerTasks,
  type ComputerUsageAdmission,
  type ComputerUsageSettlement,
} from "../../db/computer-task-schema";
import { drizzle } from "../server-context";

export const COMPUTER_TASK_STALE_AFTER_MS = 3 * 60_000;
export const COMPUTER_INTERRUPTED_SUMMARY =
  "This task was interrupted by a BotBound update. Start it again.";

type TaskRow = typeof computerTasks.$inferSelect;
type CheckpointFor<Phase extends "admitted" | "settled"> = Phase extends "admitted"
  ? ComputerUsageAdmission
  : ComputerUsageSettlement;
type StoredCheckpoint = Pick<TaskRow, "id" | "userId" | "updatedAt" | "usageReceipt">;
type Reader = Pick<typeof drizzle, "select" | "update">;

/** Persist admission before provider work, then only elapsed, bounded checkpoints. */
export function computerUsageCheckpoint<Phase extends "admitted" | "settled">(
  periodKey: string | null,
  startedAt: number,
  observedAt: number,
  maxDurationMs: number,
  phase: Phase,
): CheckpointFor<Phase> | null {
  if (!periodKey) return null;
  const quantity = Math.min(Math.max(0, observedAt - startedAt), maxDurationMs) / 60_000;
  return {
    periodKey,
    // Older workers reject an unfinished receipt without a numeric quantity.
    // Never allow a rolling deployment to win its ledger key with partial usage.
    ...(phase === "admitted" ? { observedQuantity: quantity, phase } : { quantity, phase }),
    occurredAt: new Date(startedAt).toISOString(),
  } as CheckpointFor<Phase>;
}

/** A different process can prove only the saved checkpoint, never intervening downtime. */
function terminalCheckpoint(row: StoredCheckpoint): ComputerUsageSettlement | null {
  const receipt = row.usageReceipt;
  if (
    receipt?.phase !== "admitted" ||
    !receipt.periodKey?.trim() ||
    !Number.isFinite(receipt.observedQuantity) ||
    receipt.observedQuantity < 0
  )
    return null;
  const startedAt = Date.parse(receipt.occurredAt);
  if (!Number.isFinite(startedAt) || startedAt > row.updatedAt.getTime()) return null;
  return {
    periodKey: receipt.periodKey,
    occurredAt: receipt.occurredAt,
    quantity: Math.min(receipt.observedQuantity, (row.updatedAt.getTime() - startedAt) / 60_000),
    phase: "settled",
  };
}

/** The first terminal row wins; the outcome and its billing receipt commit together. */
export async function settleStoredComputerTask(
  row: StoredCheckpoint,
  outcome: { status: "stopped" | "interrupted"; summary: string; finishedAt: Date },
  options: { staleBefore?: Date; reader?: Reader } = {},
): Promise<TaskRow | undefined> {
  const reader = options.reader ?? drizzle;
  let checkpoint = row;
  for (let attempt = 0; attempt < 3; attempt++) {
    const receipt = terminalCheckpoint(checkpoint);
    const [updated] = await reader
      .update(computerTasks)
      .set({
        ...outcome,
        question: null,
        updatedAt: outcome.finishedAt,
        ...(receipt ? { usageReceipt: receipt } : {}),
      })
      .where(
        and(
          eq(computerTasks.id, row.id),
          eq(computerTasks.userId, row.userId),
          inArray(computerTasks.status, ["running", "needs_input"]),
          sql`${computerTasks.usageReceipt} IS NOT DISTINCT FROM ${checkpoint.usageReceipt ? JSON.stringify(checkpoint.usageReceipt) : null}::jsonb`,
          ...(options.staleBefore ? [lt(computerTasks.updatedAt, options.staleBefore)] : []),
        ),
      )
      .returning();
    if (updated) return updated;
    const [fresh] = await reader
      .select()
      .from(computerTasks)
      .where(and(eq(computerTasks.id, row.id), eq(computerTasks.userId, row.userId)))
      .limit(1);
    if (
      !fresh ||
      !["running", "needs_input"].includes(fresh.status) ||
      (options.staleBefore && fresh.updatedAt >= options.staleBefore)
    )
      return undefined;
    checkpoint = fresh;
  }
  throw new Error("Computer task changed while saving its outcome. Try again.");
}

/** Recover interrupted billing without relying on the owner opening task history. */
export async function recoverStaleComputerUsageReceipts(
  limit = 200,
  reader: Reader = drizzle,
  now = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - COMPUTER_TASK_STALE_AFTER_MS);
  const rows = await reader
    .select({
      id: computerTasks.id,
      userId: computerTasks.userId,
      updatedAt: computerTasks.updatedAt,
      usageReceipt: computerTasks.usageReceipt,
      status: computerTasks.status,
    })
    .from(computerTasks)
    .where(
      and(
        or(
          and(
            inArray(computerTasks.status, ["running", "needs_input"]),
            lt(computerTasks.updatedAt, cutoff),
          ),
          sql`${computerTasks.status} NOT IN ('running', 'needs_input') AND ${computerTasks.finishedAt} IS NOT NULL`,
        ),
        sql`${computerTasks.usageReceipt}->>'phase' = 'admitted'`,
      ),
    )
    .orderBy(asc(computerTasks.updatedAt))
    .limit(limit);
  for (const row of rows) {
    // Unknown legacy records are not assigned today's billing period.
    const receipt = terminalCheckpoint(row);
    if (!receipt) continue;
    if (!["running", "needs_input"].includes(row.status)) {
      // An older process may have stopped a new task during a rolling deploy.
      // Freeze its saved usage without changing that process's terminal outcome.
      await reader
        .update(computerTasks)
        .set({ usageReceipt: receipt })
        .where(
          and(
            eq(computerTasks.id, row.id),
            eq(computerTasks.userId, row.userId),
            sql`${computerTasks.status} NOT IN ('running', 'needs_input')`,
            sql`${computerTasks.usageReceipt} IS NOT DISTINCT FROM ${JSON.stringify(row.usageReceipt)}::jsonb`,
          ),
        );
      continue;
    }
    await settleStoredComputerTask(
      row,
      { status: "interrupted", summary: COMPUTER_INTERRUPTED_SUMMARY, finishedAt: now },
      { staleBefore: cutoff, reader },
    );
  }
}
