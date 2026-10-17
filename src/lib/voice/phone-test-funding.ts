import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { AppError } from "../api-error";
import { reserveVoiceCallFunding, type VoiceCallFunding } from "../voice-call-funding";
import {
  bindVoiceFundingAlias,
  phoneTestFundingId,
  readVoiceIdentityReceipt,
  voicePhoneFingerprint,
  type VoiceIdentityTransaction,
} from "../voice-call-identity";

/** Server-read evidence, never a client boolean, admits this requested test to SIP. */
export async function adoptPhoneTestSipFunding(
  tx: VoiceIdentityTransaction,
  input: {
    userId: string;
    agentId: string;
    callId: string;
    direction?: "inbound" | "outbound";
    leadId?: bigint;
    outboundPlacementId?: string;
    callerNumber: string | null;
    calledNumber: string;
    phoneTest?: true;
  },
): Promise<VoiceCallFunding | null> {
  if (
    input.phoneTest !== true ||
    input.direction !== "outbound" ||
    !input.leadId ||
    !input.outboundPlacementId
  )
    return null;
  // Every self-test mutation and settlement uses wallet -> lead ordering.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.userId}))`);
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`openai-outbound:${String(input.leadId)}`}))`,
  );
  const [lead] = await tx
    .select()
    .from(schema.outboundLeads)
    .where(
      and(eq(schema.outboundLeads.userId, input.userId), eq(schema.outboundLeads.id, input.leadId)),
    )
    .limit(1);
  if (lead?.source !== "phone_test")
    throw AppError.conflict("The phone test no longer matches its request.");
  const meta = lead.metadata as Record<string, unknown> | null;
  const native = meta?.native_voice as Record<string, unknown> | undefined;
  const test = native?.phone_test as Record<string, unknown> | undefined;
  const canonical = phoneTestFundingId(input.outboundPlacementId);
  const admission = await readVoiceIdentityReceipt(
    tx,
    input.userId,
    `voice_admission:${canonical}`,
  );
  const scope = admission?.metadata as Record<string, unknown> | undefined;
  const proof = await readVoiceIdentityReceipt(
    tx,
    input.userId,
    `voice_phone_test_verified:${canonical}`,
  );
  const verified = proof?.metadata as Record<string, unknown> | undefined;
  if (
    lead.agentId !== input.agentId ||
    native?.placement_id !== input.outboundPlacementId ||
    test?.version !== 1 ||
    test.request_id !== input.outboundPlacementId ||
    ["ending", "cancelled", "failed", "completed"].includes(String(test.status)) ||
    !proof ||
    scope?.phone_test_version !== 1 ||
    scope.agent_id !== input.agentId ||
    scope.phone_fingerprint !== voicePhoneFingerprint(input.callerNumber || "") ||
    scope.from_fingerprint !== voicePhoneFingerprint(input.calledNumber) ||
    verified?.call_sid !== lead.callId ||
    verified?.agent_id !== input.agentId ||
    verified?.phone_fingerprint !== scope.phone_fingerprint ||
    !Number.isFinite(Number(scope.deadline_at_ms)) ||
    Number(scope.deadline_at_ms) <= Date.now()
  )
    throw AppError.conflict("The requested phone test is not verified or has ended.");
  await bindVoiceFundingAlias(tx, {
    userId: input.userId,
    canonicalCallId: canonical,
    providerCallId: `openai:${input.callId}`,
    phase: "sip",
  });
  const funding = await reserveVoiceCallFunding(tx, {
    userId: input.userId,
    providerCallId: `openai:${input.callId}`,
    maxSeconds: 120,
  });
  if (!funding) throw AppError.conflict("This phone test has no active funding.");
  return funding;
}
