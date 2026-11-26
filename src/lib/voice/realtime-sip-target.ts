import { log } from "../server-context";
import {
  OPENAI_INBOUND_SIP_TOKEN_HEADER,
  OPENAI_OUTBOUND_SIP_TOKEN_HEADER,
  buildOpenAIInboundSipUri,
  buildOpenAIOutboundSipUri,
} from "./openai-sip-config";
import { configuredPhoneVoiceProvider, type RealtimeVoiceProvider } from "./realtime-provider";
import { buildXAISipUri, xaiSipConfigured, xaiSipReadiness } from "./xai-sip-config";
import { registerXAIPhoneNumber, xaiSipCredentialsFor } from "./xai-phone-registration";

/** Where Twilio bridges one call leg, and how it authenticates there. */
export type RealtimeSipTarget = {
  provider: RealtimeVoiceProvider;
  uri: string;
  username?: string;
  password?: string;
};

const SELF_REGISTER_RETRY_MS = 10 * 60_000;
const selfRegisterInFlight = new Map<string, Promise<void>>();
const selfRegisterLastAttempt = new Map<string, number>();

/**
 * xAI is the default for every number, so no one has to register a line by
 * hand. A number that reaches here without a registration (bought before the
 * switch, or whose activation-time registration failed) registers itself in
 * the background; this call stays on OpenAI and the next one answers on xAI.
 * Attempts are deduplicated per process and retried at most every 10 minutes.
 */
function registerNumberInBackground(phoneNumber: string): void {
  if (selfRegisterInFlight.has(phoneNumber)) return;
  const last = selfRegisterLastAttempt.get(phoneNumber) ?? 0;
  if (Date.now() - last < SELF_REGISTER_RETRY_MS) return;
  selfRegisterLastAttempt.set(phoneNumber, Date.now());
  const attempt = registerXAIPhoneNumber(phoneNumber)
    .then((result) => {
      if (result.status === "failed") {
        log.warn("xAI self-registration did not complete; the line keeps the OpenAI fallback", {
          phoneSuffix: phoneNumber.slice(-4),
          reason: result.reason,
        });
      } else {
        log.info("Line self-registered with xAI voice", {
          phoneSuffix: phoneNumber.slice(-4),
          status: result.status,
        });
      }
    })
    .catch((error: unknown) => {
      log.warn("xAI self-registration failed; the line keeps the OpenAI fallback", {
        phoneSuffix: phoneNumber.slice(-4),
        errorClass: error instanceof Error ? error.name : typeof error,
      });
    })
    .finally(() => selfRegisterInFlight.delete(phoneNumber));
  selfRegisterInFlight.set(phoneNumber, attempt);
}

const STANDBY_NOTE_INTERVAL_MS = 10 * 60_000;
const standbyNotedAt = new Map<string, number>();

/**
 * Calls that answer on the OpenAI standby say why, at most once per reason
 * every 10 minutes per process. These two reasons used to be silent, so a
 * misconfigured deployment could move every call to the standby unnoticed.
 */
function noteOpenAIStandby(
  reason: "operator_setting" | "xai_not_configured",
  details: Record<string, unknown>,
): void {
  const now = Date.now();
  if (now - (standbyNotedAt.get(reason) ?? 0) < STANDBY_NOTE_INTERVAL_MS) return;
  standbyNotedAt.set(reason, now);
  if (reason === "operator_setting") {
    log.info("Phone calls answer on OpenAI: WIRELINE_PHONE_VOICE_PROVIDER=openai", details);
  } else {
    log.warn("xAI is the default phone voice but is not configured here; using OpenAI", details);
  }
}

/** Test seam: forget background registration attempts and standby notes. */
export function resetRealtimeSipSelfRegistrationForTests(): void {
  selfRegisterInFlight.clear();
  selfRegisterLastAttempt.clear();
  standbyNotedAt.clear();
}

async function xaiTarget(
  ourNumber: string,
  header: { name: string; token: string },
): Promise<RealtimeSipTarget | null> {
  if (configuredPhoneVoiceProvider() !== "xai") {
    noteOpenAIStandby("operator_setting", { phoneSuffix: ourNumber.slice(-4) });
    return null;
  }
  if (!xaiSipConfigured()) {
    noteOpenAIStandby("xai_not_configured", {
      phoneSuffix: ourNumber.slice(-4),
      ...xaiSipReadiness(),
    });
    return null;
  }
  try {
    const credentials = await xaiSipCredentialsFor(ourNumber);
    if (!credentials) {
      // An unregistered number keeps answering on OpenAI instead of failing.
      log.warn("xAI voice is on but this number is not registered; using OpenAI", {
        phoneSuffix: ourNumber.slice(-4),
      });
      registerNumberInBackground(ourNumber);
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
