import { resolveCanonicalAppUrl } from "../app-url";
import { log } from "../server-context";
import {
  issueOpenAIInboundToken,
  type InboundFallbackDrill,
  type OpenAIInboundLeg,
} from "./openai-inbound-token";
import {
  buildOpenAIInboundSipUri,
  openAISipConfigured,
  resolveOpenAISipSessionMaxSeconds,
} from "./openai-sip-config";
import { liveRecordingDialAttributes } from "./live-call-recording";
import { renderSipNoun, type RealtimeSipTarget } from "./realtime-sip-target";

/**
 * Inbound bridge TwiML and the same-call xAI -> OpenAI failover.
 *
 * xAI is the default voice. Its SIP leg answers when BotBound's session joins,
 * which normally takes one to three seconds, so the xAI <Dial> gives up after
 * {@link XAI_CONNECT_TIMEOUT_SECONDS}. The dial-complete webhook then bridges
 * the same caller to OpenAI Realtime instead of ringing on or reaching voicemail.
 * A mid-call xAI failure redirects the live Twilio call to OpenAI the same way.
 */
export const XAI_CONNECT_TIMEOUT_SECONDS = 10;
export const OPENAI_CONNECT_TIMEOUT_SECONDS = 30;
export const INBOUND_DIAL_COMPLETE_PATH = "/api/twilio-webhook/openai-inbound-dial-complete";
/**
 * Transfers to a human are a SIP REFER from the voice provider. Twilio honors
 * a REFER on a <Dial><Sip> leg only when the Dial names a referUrl; without it
 * Twilio raises 13802 and re-establishes the AI leg, which no one controls
 * after BotBound closes its session. https://www.twilio.com/docs/voice/api/refer-to-twilio
 */
export const INBOUND_SIP_REFER_PATH = "/api/twilio-webhook/sip-refer";
export const TRANSFER_RING_TIMEOUT_SECONDS = 25;

/** The E.164 number in a REFER target (tel:+1..., sip:+1...@host), or null. */
export function referTargetPhone(target: unknown): string | null {
  const raw = String(target ?? "")
    .trim()
    .replace(/^<|>$/g, "");
  const match = /^(?:tel:|sips?:)?(\+[1-9]\d{7,14})(?:[@;?].*)?$/i.exec(raw);
  return match ? match[1] : null;
}

/** TwiML that completes a provider REFER by dialing the human on the PSTN. */
export function referTransferTwiml(target: string, callerId: string | null): string | null {
  const phone = referTargetPhone(target);
  if (!phone) return null;
  const caller = callerId && /^\+[1-9]\d{7,14}$/.test(callerId) ? ` callerId="${callerId}"` : "";
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<Response><Dial${caller} timeout="${TRANSFER_RING_TIMEOUT_SECONDS}" action="${INBOUND_DIAL_COMPLETE_PATH}?leg=transfer" method="POST">` +
    `<Number>${phone}</Number></Dial><Hangup/></Response>`
  );
}

/** The claim identity of one leg of an inbound Twilio call. */
export function inboundSourceId(twilioCallSid: string, leg?: OpenAIInboundLeg): string {
  return leg ? `twilio:${twilioCallSid}#${leg}` : `twilio:${twilioCallSid}`;
}

export function hangupTwiml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
}

/**
 * The parent is answered before SIP is dialed: Twilio rejects the funded REST
 * timeLimit update on an unanswered parent (21220). Recording is the Bot
 * owner's per-Bot choice; the same flag drives the spoken recording notice.
 * The action URL names the leg so dial-complete knows whether to fail over.
 */
export function inboundBridgeTwiml(
  target: RealtimeSipTarget,
  recordCall: boolean,
  options: { absoluteAction?: boolean } = {},
): string {
  const timeout =
    target.provider === "xai" ? XAI_CONNECT_TIMEOUT_SECONDS : OPENAI_CONNECT_TIMEOUT_SECONDS;
  // TwiML pushed through the REST API has no request URL to resolve a
  // relative action against, so the mid-call redirect uses the absolute URL.
  const canonical = options.absoluteAction ? resolveCanonicalAppUrl() : null;
  const base = canonical && !("error" in canonical) ? canonical.url.replace(/\/+$/, "") : "";
  const action = `${base}${INBOUND_DIAL_COMPLETE_PATH}?leg=${target.provider}&amp;rec=${recordCall ? 1 : 0}`;
  const referUrl = `${base}${INBOUND_SIP_REFER_PATH}`;
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<Response><Dial answerOnBridge="false" timeout="${timeout}" action="${action}" method="POST" referUrl="${referUrl}" referMethod="POST" timeLimit="${resolveOpenAISipSessionMaxSeconds()}"${liveRecordingDialAttributes(recordCall)}>` +
    `${renderSipNoun(target)}</Dial><Hangup/></Response>`
  );
}

export type OpenAIFailoverInput = {
  twilioCallSid: string;
  calledNumber: string;
  callerNumber: string | null;
  callRecordingEnabled: boolean;
  leg: OpenAIInboundLeg;
};

/** TwiML that bridges the same caller to OpenAI Realtime, or null if OpenAI is off. */
export function openAIFailoverTwiml(
  input: OpenAIFailoverInput,
  options: { absoluteAction?: boolean } = {},
): string | null {
  if (!openAISipConfigured()) return null;
  const { token } = issueOpenAIInboundToken({
    twilioCallSid: input.twilioCallSid,
    calledNumber: input.calledNumber,
    callerNumber: input.callerNumber,
    callRecordingEnabled: input.callRecordingEnabled,
    leg: input.leg,
  });
  return inboundBridgeTwiml(
    { provider: "openai", uri: buildOpenAIInboundSipUri(token) },
    input.callRecordingEnabled,
    options,
  );
}

type TwilioCallUpdater = (callSid: string, twiml: string) => Promise<unknown>;

async function defaultTwilioCallUpdater(callSid: string, twiml: string): Promise<unknown> {
  const { getTwilioClient } = await import("../twilio-service");
  const client = getTwilioClient();
  if (!client) throw new Error("Twilio is not configured.");
  return client.calls(callSid).update({ twiml });
}

/**
 * Move a live inbound call whose xAI leg failed onto OpenAI Realtime. Twilio
 * ends the xAI SIP leg when the parent's TwiML is replaced, and the caller
 * stays on the line. Returns false when OpenAI is not configured or Twilio
 * refused the update (the call already ended, for example).
 */
export async function redirectInboundCallToOpenAI(
  input: OpenAIFailoverInput & { reason: string; callId: string },
  updateCall: TwilioCallUpdater = defaultTwilioCallUpdater,
): Promise<boolean> {
  const twiml = openAIFailoverTwiml(input, { absoluteAction: true });
  if (!twiml) {
    log.error("xAI voice failed and the OpenAI fallback is not configured", {
      callId: input.callId,
      reason: input.reason,
    });
    return false;
  }
  try {
    await updateCall(input.twilioCallSid, twiml);
    log.warn("xAI voice failed over to OpenAI on the same call", {
      callId: input.callId,
      reason: input.reason,
      leg: input.leg,
    });
    return true;
  } catch (error) {
    log.error("xAI voice failover to OpenAI could not redirect the call", {
      callId: input.callId,
      reason: input.reason,
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export type { InboundFallbackDrill };
