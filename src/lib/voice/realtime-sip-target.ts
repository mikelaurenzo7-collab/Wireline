import { log } from "../server-context";
import {
  OPENAI_INBOUND_SIP_TOKEN_HEADER,
  OPENAI_OUTBOUND_SIP_TOKEN_HEADER,
  buildOpenAIInboundSipUri,
  buildOpenAIOutboundSipUri,
} from "./openai-sip-config";
import { configuredPhoneVoiceProvider, type RealtimeVoiceProvider } from "./realtime-provider";
import { buildXAISipUri, xaiSipConfigured } from "./xai-sip-config";
import { xaiSipCredentialsFor } from "./xai-phone-registration";

/** Where Twilio bridges one call leg, and how it authenticates there. */
export type RealtimeSipTarget = {
  provider: RealtimeVoiceProvider;
  uri: string;
  username?: string;
  password?: string;
};

async function xaiTarget(
  ourNumber: string,
  header: { name: string; token: string },
): Promise<RealtimeSipTarget | null> {
  if (configuredPhoneVoiceProvider() !== "xai" || !xaiSipConfigured()) return null;
  try {
    const credentials = await xaiSipCredentialsFor(ourNumber);
    if (!credentials) {
      // An unregistered number keeps answering on OpenAI instead of failing.
      log.warn("xAI voice is on but this number is not registered; using OpenAI", {
        phoneSuffix: ourNumber.slice(-4),
      });
      return null;
    }
    return { provider: "xai", uri: buildXAISipUri(ourNumber, header), ...credentials };
  } catch (error) {
    log.error("xAI SIP target could not be prepared; using OpenAI", {
      phoneSuffix: ourNumber.slice(-4),
      errorClass: error instanceof Error ? error.name : typeof error,
    });
    return null;
  }
}

/** An inbound caller reaches the Bot on the number they dialed. */
export async function resolveInboundSipTarget(input: {
  calledNumber: string;
  token: string;
}): Promise<RealtimeSipTarget> {
  return (
    (await xaiTarget(input.calledNumber, {
      name: OPENAI_INBOUND_SIP_TOKEN_HEADER,
      token: input.token,
    })) ?? { provider: "openai", uri: buildOpenAIInboundSipUri(input.token) }
  );
}

/** An outbound call bridges the answered customer to the Bot on its own line. */
export async function resolveOutboundSipTarget(input: {
  callerId: string;
  token: string;
}): Promise<RealtimeSipTarget> {
  return (
    (await xaiTarget(input.callerId, {
      name: OPENAI_OUTBOUND_SIP_TOKEN_HEADER,
      token: input.token,
    })) ?? { provider: "openai", uri: buildOpenAIOutboundSipUri(input.token) }
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** The TwiML `<Sip>` noun, with digest credentials when the target needs them. */
export function renderSipNoun(target: RealtimeSipTarget): string {
  const auth =
    target.username && target.password
      ? ` username="${escapeXml(target.username)}" password="${escapeXml(target.password)}"`
      : "";
  return `<Sip${auth}>${escapeXml(target.uri)}</Sip>`;
}
