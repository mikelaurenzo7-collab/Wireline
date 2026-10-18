import { getCanonicalAppUrl } from "../app-url";
import { isVaultConfigured } from "../secret-vault";
import { isPersistentVoiceWorkerConfigured } from "./openai-sip-worker-config";

/**
 * xAI Grok Voice over SIP. Docs:
 * https://docs.x.ai/developers/model-capabilities/audio/speech-to-speech/sip
 *
 * Twilio bridges a call to `sip:{registered number}@sip.voice.x.ai`, xAI
 * authenticates the INVITE with that number's digest credentials, and then
 * sends a signed `realtime.call.incoming` event to this app's webhook.
 */
export const XAI_PHONE_NUMBERS_URL = "https://api.x.ai/v2/phone-numbers";
export const XAI_SIP_HOST = "sip.voice.x.ai";
export const XAI_SIP_WEBHOOK_PATH = "/api/webhooks/xai/realtime";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const TWILIO_SIP_URI_MAX_LENGTH = 255;

export function xaiSipWebhookUrl(): string {
  return `${getCanonicalAppUrl()}${XAI_SIP_WEBHOOK_PATH}`;
}

/** Ready to register numbers and answer calls on xAI. */
export function xaiSipConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    String(env.XAI_API_KEY || "").trim() &&
    isVaultConfigured() &&
    isPersistentVoiceWorkerConfigured(env),
  );
}

/**
 * A SIP URI for the registered number, carrying BotBound's signed routing token
 * as an x- header (Twilio forwards x- prefixed URI parameters as SIP headers,
 * and xAI includes them in the signed incoming-call event).
 */
export function buildXAISipUri(
  registeredNumber: string,
  header: { name: string; token: string },
): string {
  const number = registeredNumber.trim();
  if (!E164_PATTERN.test(number)) {
    throw new Error("xAI SIP routing requires a valid E.164 phone number.");
  }
  const token = header.token.trim();
  if (!token || token.length > 220) throw new Error("xAI SIP routing token is invalid.");
  const candidate = `sip:${number}@${XAI_SIP_HOST};transport=tls?${header.name}=${encodeURIComponent(token)}`;
  if (candidate.length > TWILIO_SIP_URI_MAX_LENGTH) {
    throw new Error("xAI SIP URI exceeds Twilio's length limit.");
  }
  return candidate;
}

/** The E.164 number in a SIP `To`/`From` header value such as `<sip:+13125550100@host>`. */
export function phoneNumberFromSipHeader(value: string): string | null {
  const match = value.match(/\+[1-9]\d{7,14}/);
  return match && E164_PATTERN.test(match[0]) ? match[0] : null;
}
