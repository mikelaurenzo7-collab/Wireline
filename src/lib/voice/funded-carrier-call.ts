import { and, eq, sql } from "drizzle-orm";
import * as schema from "../../db/schema";
import { AppError } from "../api-error";
import { drizzle } from "../server-context";
import type { VoiceCallFunding } from "../voice-call-funding";
import { readVoiceIdentityReceipt, resolveVoiceFundingId } from "../voice-call-identity";

const TERMINAL = new Set(["completed", "busy", "failed", "no-answer", "canceled"]);

/** Only the signed source stored on the original tenant's call can select a carrier call. */
async function canonicalCarrierCall(userId: string, providerCallId: string) {
  const canonical = await resolveVoiceFundingId(drizzle, userId, providerCallId);
  const phase = canonical.startsWith("outbound:")
    ? await readVoiceIdentityReceipt(drizzle, userId, `voice_funding_phase:${canonical}:carrier`)
    : undefined;
  const phaseProviderId = (phase?.metadata as Record<string, unknown> | undefined)
    ?.provider_call_id;
  const immutableSid =
    typeof phaseProviderId === "string"
      ? /^twilio:(CA[0-9a-f]{32})$/i.exec(phaseProviderId)?.[1]
      : undefined;
  const [call] = await drizzle
    .select({ sourceId: schema.callLogs.openaiSipSourceId, agentId: schema.callLogs.agentId })
    .from(schema.callLogs)
    .where(and(eq(schema.callLogs.userId, userId), eq(schema.callLogs.vapiCallId, providerCallId)))
    .limit(1);
  let sid =
    immutableSid ??
    /^(?:twilio|twilio-fallback):(CA[0-9a-f]{32})$/i.exec(call?.sourceId ?? "")?.[1];
  if (!sid && call?.sourceId?.startsWith("outbound:") && call.agentId) {
    const placementId = call.sourceId.slice("outbound:".length);
    const [placement] = await drizzle
      .select({ callId: schema.outboundLeads.callId, metadata: schema.outboundLeads.metadata })
      .from(schema.outboundLeads)
      .where(
        and(
          eq(schema.outboundLeads.userId, userId),
          eq(schema.outboundLeads.agentId, call.agentId),
          sql`${schema.outboundLeads.metadata}->'native_voice'->>'placement_id' = ${placementId}`,
          sql`${schema.outboundLeads.metadata}->'native_voice'->>'openai_call_id' = ${providerCallId}`,
        ),
      )
      .limit(1);
    const voice = (placement?.metadata as { native_voice?: { twilio_call_sid?: unknown } } | null)
      ?.native_voice;
    if (
      typeof placement?.callId === "string" &&
      /^CA[0-9a-f]{32}$/i.test(placement.callId) &&
      voice?.twilio_call_sid === placement.callId
    )
      sid = placement.callId;
  }
  if (!sid)
    throw AppError.serviceUnavailable("The call's carrier identity requires reconciliation.");
  const { getTwilioClient } = await import("../twilio-service");
  const client = getTwilioClient();
  if (!client) throw AppError.serviceUnavailable("The call's carrier connection is unavailable.");
  const resource = client.calls(sid);
  const current = await resource.fetch();
  if (current.sid !== sid)
    throw AppError.serviceUnavailable("The carrier returned a different call identity.");
  return { resource, current };
}

/** Twilio timeLimit is the total call duration, so replay cannot restart its clock. */
export async function enforceFundedCarrierCallLimit(
  userId: string,
  providerCallId: string,
  funding: Pick<VoiceCallFunding, "maxSeconds" | "deadlineAtMs" | "phoneTest">,
): Promise<void> {
  if (funding.deadlineAtMs <= Date.now())
    throw new AppError(409, "VOICE_FUNDING_EXPIRED", "This call's admitted duration has elapsed.");
  const { resource, current } = await canonicalCarrierCall(userId, providerCallId);
  if (TERMINAL.has(current.status))
    throw new AppError(409, "VOICE_ALREADY_ENDED", "This call has already ended.");
  // The outer carrier limit survives an OpenAI REFER and loss of the worker.
  const canonical = await resolveVoiceFundingId(drizzle, userId, providerCallId);
  const dispatched = canonical.startsWith("outbound:")
    ? await readVoiceIdentityReceipt(drizzle, userId, `voice_outbound_dispatched:${canonical}`)
    : undefined;
  const carrierCap = (dispatched?.metadata as Record<string, unknown> | undefined)
    ?.carrier_max_seconds;
  if (dispatched && (!Number.isSafeInteger(carrierCap) || Number(carrierCap) <= 0))
    throw AppError.serviceUnavailable("The carrier duration limit needs reconciliation.");
  // REFER/acceptance must never increase the stricter original parent cap.
  await resource.update({
    timeLimit: Math.min(
      funding.maxSeconds,
      dispatched ? Number(carrierCap) : funding.maxSeconds,
      funding.phoneTest ? 90 : funding.maxSeconds,
    ),
  });
}

/** Never substitute admission, ringing or recovery elapsed time for carrier evidence. */
export async function readTerminalCarrierDuration(
  userId: string,
  providerCallId: string,
): Promise<{ durationSeconds: number; unanswered: boolean }> {
  const { current } = await canonicalCarrierCall(userId, providerCallId);
  if (!TERMINAL.has(current.status))
    throw AppError.serviceUnavailable("The carrier has not confirmed that this call ended.");
  const unanswered = current.status !== "completed";
  const raw = current.duration;
  const durationSeconds =
    unanswered && (raw === null || raw === "")
      ? 0
      : typeof raw === "string" && /^\d+$/.test(raw)
        ? Number(raw)
        : NaN;
  if (
    !Number.isSafeInteger(durationSeconds) ||
    durationSeconds < 0 ||
    durationSeconds > 2_147_483_647 ||
    (unanswered && durationSeconds !== 0)
  ) {
    throw AppError.serviceUnavailable("The carrier's final call duration could not be verified.");
  }
  return { durationSeconds, unanswered };
}
