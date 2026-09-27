import { resolveNativeInboundAdmission } from "./native-inbound-admission";
import { resolveOpenAISipSessionMaxSeconds } from "./openai-sip-config";
import { trackVoiceMinutes } from "../voice-usage";
import { tenantStore } from "../server-context";
import { twilioFallbackStore } from "./twilio-fallback-store";
import {
  acquireAccountOperationLease,
  releaseAccountOperationLease,
} from "../account-operation-lease";

import { fallbackReceiptId } from "./twilio-fallback-receipt";
import type {
  FallbackAdmission,
  FallbackReceipt,
  TwilioFallbackStore,
} from "./twilio-fallback-receipt";
export { fallbackReceiptId } from "./twilio-fallback-receipt";
export type {
  FallbackAdmission,
  FallbackCompletion,
  FallbackReceipt,
} from "./twilio-fallback-receipt";
const CALL_SID = /^CA[a-f0-9]{32}$/i;
const PHONE = /^\+[1-9]\d{7,14}$/;
const TERMINAL_STATUSES = new Set(["completed", "busy", "no-answer", "failed", "canceled"]);

type Dependencies = {
  store: TwilioFallbackStore;
  admit: typeof resolveNativeInboundAdmission;
  maxSeconds: typeof resolveOpenAISipSessionMaxSeconds;
  track: typeof trackVoiceMinutes;
  acquireLease: typeof acquireAccountOperationLease;
  releaseLease: typeof releaseAccountOperationLease;
};

const defaults: Dependencies = {
  store: twilioFallbackStore,
  admit: resolveNativeInboundAdmission,
  maxSeconds: resolveOpenAISipSessionMaxSeconds,
  track: trackVoiceMinutes,
  acquireLease: acquireAccountOperationLease,
  releaseLease: releaseAccountOperationLease,
};

/** A human transfer is paid carrier work too. Persist its owner before returning Dial. */
export async function prepareTwilioVoiceFallback(
  input: Omit<FallbackAdmission, "agentId" | "maxSeconds" | "leaseId" | "leaseExpiresAt">,
  dependencies: Dependencies = defaults,
): Promise<FallbackReceipt | null> {
  if (
    !CALL_SID.test(input.parentCallSid) ||
    !PHONE.test(input.calledNumber) ||
    !PHONE.test(input.fallbackNumber) ||
    input.calledNumber === input.fallbackNumber
  ) {
    return null;
  }

  return tenantStore.run(input.userId, async () => {
    const line = await dependencies.store.findLine(input.userId, input.calledNumber);
    if (!line) return null;
    const existing = await dependencies.store.find(input.parentCallSid);
    if (existing) {
      if (
        existing.userId !== input.userId ||
        existing.calledNumber !== input.calledNumber ||
        existing.callerNumber !== input.callerNumber ||
        existing.agentId !== line.agentId
      )
        return null;
      // A provider retry keeps its original target/limit and reserved presence.
      return existing.completion || Date.parse(existing.leaseExpiresAt) <= Date.now()
        ? null
        : existing;
    }
    const admission = await dependencies.admit(input.userId, line.agentId ?? undefined);
    // The degraded AI take-message allowance cannot fund an additional PSTN leg.
    if (admission.mode !== "full") return null;
    const maxSeconds = dependencies.maxSeconds();
    const lease = await dependencies.acquireLease({
      userId: input.userId,
      kind: "provider",
      operation: "twilio_voice_fallback",
      // Cover ringing, the entire admitted call and bounded provider callback retries.
      ttlMs: (maxSeconds + 30) * 1000 + 15 * 60_000,
    });
    if (!lease) return null;
    // A thrown commit can be ambiguous. Retain the lease until its bounded
    // expiry so a successfully committed receipt stays safe on provider retry.
    const receipt = await dependencies.store.claim({
      ...input,
      agentId: line.agentId,
      maxSeconds,
      leaseId: lease.id,
      leaseExpiresAt: lease.expiresAt.toISOString(),
    });
    if (!receipt || receipt.leaseId !== lease.id) {
      await dependencies.releaseLease({ userId: input.userId, id: lease.id });
    }
    return receipt?.completion ? null : receipt;
  });
}

/** Settle only a server-admitted transfer, never the current owner of its former number. */
export async function completeTwilioVoiceFallback(
  input: {
    parentCallSid: string;
    childCallSid: string;
    calledNumber: string;
    callerNumber: string;
    status: string;
    durationSeconds: unknown;
    source?: "action" | "status";
  },
  dependencies: Dependencies = defaults,
): Promise<boolean> {
  if (!CALL_SID.test(input.parentCallSid)) return false;
  const receipt = await dependencies.store.find(input.parentCallSid);
  // Pre-release callbacks have no admission receipt: do not invent a billable owner.
  if (!receipt) return false;
  if (
    (input.source === "status" ? receipt.fallbackNumber : receipt.calledNumber) !==
      input.calledNumber ||
    (input.source === "status" ? receipt.calledNumber : receipt.callerNumber) !==
      input.callerNumber ||
    !TERMINAL_STATUSES.has(input.status)
  ) {
    throw new Error("Twilio fallback completion does not match its admitted call.");
  }
  const childCallSid = input.childCallSid || null;
  if (!childCallSid || !CALL_SID.test(childCallSid) || childCallSid === input.parentCallSid) {
    throw new Error("Twilio fallback completion has no valid child call identity.");
  }
  const rawDuration = input.durationSeconds;
  const durationSeconds =
    typeof rawDuration === "number"
      ? rawDuration
      : typeof rawDuration === "string" && /^\d+$/.test(rawDuration)
        ? Number(rawDuration)
        : input.status !== "completed" && (rawDuration === undefined || rawDuration === "")
          ? 0
          : NaN;
  if (
    !Number.isSafeInteger(durationSeconds) ||
    durationSeconds < 0 ||
    durationSeconds > 2_147_483_647
  ) {
    throw new Error("Twilio fallback duration is not a valid carrier duration.");
  }
  return tenantStore.run(receipt.userId, async () => {
    const completion = await dependencies.store.complete(receipt, {
      childCallSid,
      status: input.status,
      durationSeconds,
    });
    // One fallback conversation, one canonical usage key. Retrying an unfinished
    // debit uses voice-usage's durable checkpoint rather than charging each leg.
    await dependencies.track({
      userId: receipt.userId,
      // A provider overrun is recorded at its actual duration, but the customer
      // never pays beyond the server-admitted limit. Reconcile carrier variance.
      durationSeconds: Math.min(completion.durationSeconds, receipt.maxSeconds),
      vapiCallId: fallbackReceiptId(receipt.parentCallSid),
    });
    await dependencies.releaseLease({ userId: receipt.userId, id: receipt.leaseId });
    return true;
  });
}
