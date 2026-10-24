import { buildOpenAIOutboundSipUri, normalizeOpenAIPhoneNumber } from "./openai-sip-config";

const REPLAY_VERSION = 1 as const;
const CALL_SID_PATTERN = /^CA[a-f0-9]{32}$/i;
const MAX_ANSWERED_BY_CHARS = 64;
const MAX_VOICEMAIL_MESSAGE_CHARS = 1_000;

export type OpenAIOutboundTwiMLDecision =
  | { kind: "bridge"; answeredBy: string; callerId: string; sipUri: string }
  | { kind: "drop"; answeredBy: string }
  | { kind: "voicemail"; answeredBy: string; message: string };

type PersistableOpenAIOutboundTwiMLDecision =
  | { kind: "bridge"; answeredBy: string; callerId: string }
  | { kind: "drop"; answeredBy: string }
  | { kind: "voicemail"; answeredBy: string; message: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function validCallSid(value: unknown): string | null {
  const candidate = String(value || "").trim();
  return CALL_SID_PATTERN.test(candidate) ? candidate : null;
}

function answeredByValue(value: unknown): string {
  return String(value || "")
    .trim()
    .slice(0, MAX_ANSWERED_BY_CHARS);
}

/**
 * Persist only the deterministic TwiML inputs. The signed outbound token is
 * deliberately excluded: it remains short-lived and arrives again on every
 * Twilio retry.
 */
export function persistOpenAIOutboundTwiMLReplay(input: {
  callSid: string;
  decision: PersistableOpenAIOutboundTwiMLDecision;
}): Record<string, unknown> {
  const callSid = validCallSid(input.callSid);
  if (!callSid) throw new Error("A valid Twilio CallSid is required for TwiML replay.");

  const base = {
    version: REPLAY_VERSION,
    call_sid: callSid,
    kind: input.decision.kind,
    answered_by: answeredByValue(input.decision.answeredBy),
  };
  if (input.decision.kind === "bridge") {
    const callerId = normalizeOpenAIPhoneNumber(input.decision.callerId);
    if (!callerId) throw new Error("A valid caller id is required for bridge replay.");
    return { ...base, caller_id: callerId };
  }
  if (input.decision.kind === "voicemail") {
    if (input.decision.message.length > MAX_VOICEMAIL_MESSAGE_CHARS) {
      throw new Error("Outbound voicemail exceeds the TwiML replay limit.");
    }
    return { ...base, voicemail_message: input.decision.message };
  }
  return base;
}

/**
 * The Twilio parent call this placement's bridge TwiML was served for. It is
 * persisted with the replay marker at bridge creation and is the immutable
 * identity the recording-completion callback correlates against, so a lead
 * redialed before the callback lands cannot re-attribute the recording.
 */
export function resolveOpenAIOutboundParentCallSid(
  nativeVoice: Record<string, unknown>,
): string | null {
  return validCallSid(asRecord(nativeVoice.twiml_replay).call_sid);
}

/**
 * Reconstruct a previously committed TwiML decision only when every durable
 * call-ownership marker agrees with the signed callback's CallSid. This lets a
 * Twilio read-timeout retry receive the same response without reopening a
 * terminal lead or weakening monotonic status transitions.
 */
export function resolveOpenAIOutboundTwiMLReplay(input: {
  nativeVoice: Record<string, unknown>;
  leadCallSid: string | null | undefined;
  callbackCallSid: string;
  token: string;
}): OpenAIOutboundTwiMLDecision | null {
  const callbackCallSid = validCallSid(input.callbackCallSid);
  if (
    !callbackCallSid ||
    validCallSid(input.leadCallSid) !== callbackCallSid ||
    validCallSid(input.nativeVoice.twilio_call_sid) !== callbackCallSid
  ) {
    return null;
  }

  const replay = asRecord(input.nativeVoice.twiml_replay);
  if (
    replay.version !== REPLAY_VERSION ||
    validCallSid(replay.call_sid) !== callbackCallSid ||
    replay.kind !== input.nativeVoice.amd_action
  ) {
    return null;
  }

  const answeredBy = answeredByValue(replay.answered_by);
  if (replay.kind === "drop") return { kind: "drop", answeredBy };

  if (replay.kind === "voicemail") {
    if (
      typeof replay.voicemail_message !== "string" ||
      replay.voicemail_message.length > MAX_VOICEMAIL_MESSAGE_CHARS
    ) {
      return null;
    }
    return { kind: "voicemail", answeredBy, message: replay.voicemail_message };
  }

  if (replay.kind === "bridge") {
    const callerId = normalizeOpenAIPhoneNumber(replay.caller_id);
    if (!callerId) return null;
    try {
      return {
        kind: "bridge",
        answeredBy,
        callerId,
        sipUri: buildOpenAIOutboundSipUri(input.token),
      };
    } catch {
      return null;
    }
  }

  return null;
}
