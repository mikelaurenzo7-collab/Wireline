import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { AppError } from "./api-error";
import { drizzle } from "./server-context";

export type VoiceIdentityTransaction = Parameters<Parameters<typeof drizzle.transaction>[0]>[0];
type Reader = Pick<typeof drizzle, "select">;
export const PHONE_TEST_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function phoneTestFundingId(id: string): string {
  if (!PHONE_TEST_ID.test(id)) throw AppError.badRequest("Invalid phone test request.");
  return `outbound:${id.toLowerCase()}`;
}
export const voicePhoneFingerprint = (phone: string): string =>
  createHash("sha256").update(phone).digest("hex");

export async function readVoiceIdentityReceipt(reader: Reader, userId: string, key: string) {
  const [row] = await reader
    .select()
    .from(schema.creditLedger)
    .where(and(eq(schema.creditLedger.userId, userId), eq(schema.creditLedger.idempotencyKey, key)))
    .limit(1);
  return row;
}

/** One immutable hop only. Provider IDs can never alias another provider ID. */
export async function resolveVoiceFundingId(
  reader: Reader,
  userId: string,
  providerCallId: string,
): Promise<string> {
  if (!/^(?:openai:[A-Za-z0-9_.:-]{1,256}|twilio:CA[a-f0-9]{32})$/i.test(providerCallId))
    return providerCallId;
  const alias = await readVoiceIdentityReceipt(
    reader,
    userId,
    `voice_funding_alias:${providerCallId}`,
  );
  if (!alias) return providerCallId;
  const meta = alias.metadata as Record<string, unknown> | null;
  const canonical = String(meta?.canonical_call_id || "");
  if (
    alias.refType !== "voice_funding_alias" ||
    Number(alias.deltaUsd) !== 0 ||
    !canonical.startsWith("outbound:") ||
    !PHONE_TEST_ID.test(canonical.slice(9)) ||
    meta?.provider_call_id !== providerCallId
  ) {
    throw AppError.serviceUnavailable("Call funding identity could not be verified.");
  }
  return canonical;
}

/** Caller owns the wallet lock before writing append-only identity evidence. */
export async function appendVoiceIdentityReceipt(
  tx: VoiceIdentityTransaction,
  input: {
    userId: string;
    key: string;
    type: string;
    refId: string;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const [balance] = await tx
    .select({ balance: sql<string>`COALESCE(SUM(${schema.creditLedger.deltaUsd}), 0)` })
    .from(schema.creditLedger)
    .where(eq(schema.creditLedger.userId, input.userId));
  if (!Number.isFinite(Number(balance?.balance)))
    throw AppError.serviceUnavailable("Call funding could not be verified.");
  await tx.insert(schema.creditLedger).values({
    userId: input.userId,
    deltaUsd: "0",
    balanceAfterUsd: String(balance.balance),
    entryKind: "adjustment",
    reason: input.type,
    refType: input.type,
    refId: input.refId,
    idempotencyKey: input.key,
    source: "voice",
    metadata: input.metadata,
  });
}

/** Exact-call replay is safe; replacing either side of a binding is forbidden. */
export async function bindVoiceFundingAlias(
  tx: VoiceIdentityTransaction,
  input: {
    userId: string;
    canonicalCallId: string;
    providerCallId: string;
    phase: "carrier" | "sip";
  },
): Promise<void> {
  const canonical = phoneTestFundingId(input.canonicalCallId.slice(9));
  if (
    canonical !== input.canonicalCallId ||
    !(
      input.phase === "carrier" ? /^twilio:CA[a-f0-9]{32}$/i : /^openai:[A-Za-z0-9_.:-]{1,256}$/
    ).test(input.providerCallId)
  )
    throw AppError.conflict("Invalid phone test call binding.");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.userId}))`);
  const admission = await readVoiceIdentityReceipt(
    tx,
    input.userId,
    `voice_admission:${canonical}`,
  );
  const scope = admission?.metadata as Record<string, unknown> | undefined;
  const outbound = await readVoiceIdentityReceipt(
    tx,
    input.userId,
    `voice_outbound_attempt:${canonical}`,
  );
  if (
    scope?.phone_test_version !== 1 &&
    !(
      outbound?.refType === "voice_outbound_attempt" &&
      Number(outbound.deltaUsd) === 0 &&
      (outbound.metadata as Record<string, unknown>)?.version === 1 &&
      (outbound.metadata as Record<string, unknown>)?.canonical_call_id === canonical
    )
  )
    throw AppError.conflict("This carrier attempt has no admission receipt.");
  const phaseKey = `voice_funding_phase:${canonical}:${input.phase}`;
  const prior = await readVoiceIdentityReceipt(tx, input.userId, phaseKey);
  const aliasKey = `voice_funding_alias:${input.providerCallId}`;
  const alias = await readVoiceIdentityReceipt(tx, input.userId, aliasKey);
  if (prior || alias) {
    if (
      (prior?.metadata as Record<string, unknown>)?.provider_call_id !== input.providerCallId ||
      (alias?.metadata as Record<string, unknown>)?.canonical_call_id !== canonical
    )
      throw AppError.conflict("This phone test is already bound to another call.");
    return;
  }
  const metadata = {
    version: 1,
    canonical_call_id: canonical,
    provider_call_id: input.providerCallId,
    phase: input.phase,
  };
  await appendVoiceIdentityReceipt(tx, {
    userId: input.userId,
    key: phaseKey,
    type: "voice_funding_phase",
    refId: `${canonical}:${input.phase}`,
    metadata,
  });
  await appendVoiceIdentityReceipt(tx, {
    userId: input.userId,
    key: aliasKey,
    type: "voice_funding_alias",
    refId: input.providerCallId,
    metadata,
  });
}
