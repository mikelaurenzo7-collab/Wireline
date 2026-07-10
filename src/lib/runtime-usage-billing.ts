import { eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import { addCredit } from "./credit-wallet";
import { drizzle, log } from "./server-context";

export type RuntimeArtifactFormat = "pdf" | "docx" | "pptx" | "xlsx";

/**
 * Conservative customer-facing reserve. The reserve covers the OpenAI container,
 * model tokens, retries, and operating variance; any failed job is refunded.
 */
export const ARTIFACT_RUNTIME_RESERVE_USD: Record<RuntimeArtifactFormat, number> = {
  pdf: 0.25,
  docx: 0.25,
  xlsx: 0.35,
  pptx: 0.5,
};

function cents(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function reserveRuntimeUsage(input: {
  userId: string;
  amountUsd: number;
  referenceId: string;
  reason: string;
  metadata?: Record<string, unknown>;
  provider?: string;
  source?: string;
}): Promise<{ reserved: boolean; alreadyReserved: boolean; balanceUsd: number }> {
  const amount = cents(input.amountUsd);
  if (!(amount > 0)) return { reserved: true, alreadyReserved: false, balanceUsd: 0 };

  return drizzle.transaction(async (tx: any) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.userId}))`);

    const idempotencyKey = `runtime_usage:${input.referenceId}`;
    const [existing] = await tx
      .select({ id: schema.creditLedger.id, balanceAfterUsd: schema.creditLedger.balanceAfterUsd })
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing) {
      return {
        reserved: true,
        alreadyReserved: true,
        balanceUsd: Number(existing.balanceAfterUsd || 0),
      };
    }

    const [sumRow] = await tx
      .select({ balance: sql<string>`COALESCE(SUM(${schema.creditLedger.deltaUsd}), 0)` })
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.userId, input.userId));
    const balance = Number(sumRow?.balance ?? 0);
    if (balance < amount) {
      return { reserved: false, alreadyReserved: false, balanceUsd: balance };
    }

    const balanceAfter = cents(balance - amount);
    await tx.insert(schema.creditLedger).values({
      userId: input.userId,
      deltaUsd: String(-amount),
      balanceAfterUsd: String(balanceAfter),
      entryKind: "burn",
      reason: "runtime_usage",
      customerReason: input.reason,
      refType: "runtime_usage",
      refId: input.referenceId,
      idempotencyKey,
      source: input.source || "wireline",
      provider: input.provider || "openai",
      metadata: {
        ...(input.metadata || {}),
        reserved_usd: amount,
      },
    });

    return { reserved: true, alreadyReserved: false, balanceUsd: balanceAfter };
  });
}

export async function refundRuntimeUsage(input: {
  userId: string;
  amountUsd: number;
  referenceId: string;
  reason: string;
  metadata?: Record<string, unknown>;
  provider?: string;
  source?: string;
}): Promise<void> {
  try {
    await addCredit(input.userId, cents(input.amountUsd), "runtime_usage_refund", {
      type: "runtime_usage_refund",
      id: input.referenceId,
      entryKind: "refund",
      source: input.source || "wireline",
      provider: input.provider || "openai",
      customerReason: input.reason,
      metadata: input.metadata,
    });
  } catch (error) {
    log.error("runtime usage refund failed", {
      userId: input.userId,
      referenceId: input.referenceId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
