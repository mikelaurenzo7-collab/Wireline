/**
 * Compatibility facade for legacy imports.
 *
 * All phone placement and live-call control are native Twilio + xAI. The file
 * name remains temporarily stable so older route modules can migrate without
 * creating a split runtime; no Vapi API, credential, assistant, phone number,
 * monitor URL, or fallback model is used here.
 */
import { getErrorMessage } from "./server-utils";
import {
  placeOutboundCall as placeNativeOutboundCall,
  type PlaceCallResult,
  type PlaceOutboundCallInput,
} from "./voice/outbound-call-service";
import { referXAISipCall } from "./voice/xai-sip-session";
import { normalizeXAIPhoneNumber } from "./voice/xai-sip-config";

export type { PlaceCallResult, PlaceOutboundCallInput };

/** @deprecated Import from ./voice/outbound-call-service in new code. */
export const placeOutboundCall = placeNativeOutboundCall;

/**
 * Retained only for old tests and error adapters while the migration lands.
 * The parser is provider-neutral despite its historical export name.
 */
export function formatVapiCallError(errorBody: string): string {
  const trimmed = errorBody.trim();
  if (!trimmed) return "Voice carrier rejected the call. Try again in a moment.";
  try {
    const parsed = JSON.parse(trimmed) as {
      message?: string | string[];
      error?: string;
      errors?: Array<{ message?: string }>;
    };
    const parts: string[] = [];
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      parts.push(parsed.message.trim());
    } else if (Array.isArray(parsed.message)) {
      parts.push(...parsed.message.map((message) => String(message).trim()).filter(Boolean));
    }
    if (parsed.error?.trim()) parts.push(parsed.error.trim());
    for (const entry of parsed.errors || []) {
      if (entry.message?.trim()) parts.push(entry.message.trim());
    }
    if (parts.length > 0) return parts.join(" ");
  } catch {
    // Non-JSON carrier response; return a bounded plain-text description.
  }
  return trimmed.length > 280 ? `${trimmed.slice(0, 280)}…` : trimmed;
}

function xaiCallIdFromControlToken(value: string): string | null {
  const token = value.trim();
  if (!token.startsWith("xai:")) return null;
  const callId = token.slice(4).trim();
  return callId && callId.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(callId) ? callId : null;
}

/**
 * Transfer an active native SIP call using xAI REFER. `controlToken` is the
 * opaque `xai:<call_id>` value stored in signal_presence; arbitrary URLs are
 * rejected, eliminating the legacy SSRF-prone monitor-control surface.
 */
export async function transferLiveCall(
  controlToken: string,
  toNumber: string,
  _content = "Transferring your call now, please hold.",
): Promise<{ ok: boolean; status: number; error?: string }> {
  const callId = xaiCallIdFromControlToken(controlToken);
  if (!callId) {
    return {
      ok: false,
      status: 409,
      error: "This call is not attached to the native voice control plane.",
    };
  }
  const destination = normalizeXAIPhoneNumber(toNumber);
  if (!destination) {
    return { ok: false, status: 400, error: "A valid E.164 transfer number is required." };
  }

  try {
    await referXAISipCall(callId, destination);
    return { ok: true, status: 200 };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: `The native carrier could not complete the transfer: ${getErrorMessage(error)}`,
    };
  }
}
