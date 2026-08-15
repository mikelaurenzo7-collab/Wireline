/* eslint-disable @typescript-eslint/no-explicit-any -- third-party API responses are vendor-defined JSON envelopes that don't ship with types. */
import twilio from "twilio";

import { drizzle, log, tenantStore } from "./server-context";
import * as schema from "../db/schema";
import { eq } from "drizzle-orm";
import { getErrorMessage } from "./server-utils";
import {
  createTwilioMessageWithRateLimitRetry,
  withTwilioMessageReliability,
} from "./twilio-message-reliability";

export type TwilioMessageChannel = "sms" | "whatsapp";
export type TwilioRestAuthMode = "api_key" | "auth_token" | "unconfigured";
export const SMS_PROVIDER_OUTCOME_AMBIGUOUS = "SMS_PROVIDER_OUTCOME_AMBIGUOUS" as const;

interface TwilioTenantSettings {
  messagingEnabled: boolean;
  lookupEnabled: boolean;
  managerAlertsEnabled: boolean;
  messagingServiceSid: string | null;
  smsFromNumber: string | null;
  whatsappFromNumber: string | null;
  managerAlertNumber: string | null;
}

export interface TwilioLookupResult {
  ok: boolean;
  configured: boolean;
  enabled: boolean;
  reason?: string;
  phoneNumber?: string;
  valid?: boolean;
  lineType?: string | null;
  carrierName?: string | null;
  countryCode?: string | null;
}

export interface TwilioSendResult {
  ok: boolean;
  configured: boolean;
  enabled: boolean;
  reason?: string;
  /** Machine code when blocked by live-work entitlement or similar gates. */
  code?: string;
  recovery_path?: string;
  sid?: string;
  status?: string | null;
  to?: string;
  channel?: TwilioMessageChannel;
  /** Carrier accepted; local accounting/history is converging asynchronously. */
  reconciliationPending?: boolean;
  /** The carrier request may have succeeded even though its response was lost. */
  providerOutcomeAmbiguous?: boolean;
  /** Retrying could deliver the same customer message twice. */
  doNotResend?: boolean;
}

let cachedClient: ReturnType<typeof twilio> | null | undefined;

function env(name: string): string {
  return typeof process.env[name] === "string" ? process.env[name]!.trim() : "";
}

export function getTwilioRestAuthMode(): TwilioRestAuthMode {
  const accountSid = env("TWILIO_ACCOUNT_SID");
  const apiKey = env("TWILIO_API_KEY");
  const apiSecret = env("TWILIO_API_SECRET");
  if (accountSid && apiKey && apiSecret) return "api_key";
  if (accountSid && env("TWILIO_AUTH_TOKEN")) return "auth_token";
  return "unconfigured";
}

export function getTwilioClient() {
  if (cachedClient !== undefined) return cachedClient;

  const accountSid = env("TWILIO_ACCOUNT_SID");
  const apiKey = env("TWILIO_API_KEY");
  const apiSecret = env("TWILIO_API_SECRET");
  const authToken = env("TWILIO_AUTH_TOKEN");

  if (accountSid && apiKey && apiSecret) {
    cachedClient = twilio(apiKey, apiSecret, { accountSid });
    return cachedClient;
  }

  if (!accountSid || !authToken) {
    cachedClient = null;
    return cachedClient;
  }

  // Compatibility fallback. Production should use a scoped API key for REST
  // calls while retaining the Auth Token only for Twilio webhook validation.
  cachedClient = twilio(accountSid, authToken);
  return cachedClient;
}

export function isTwilioConfigured(): boolean {
  return !!getTwilioClient();
}

function cleanPhone(raw: string | undefined | null): string {
  const cleaned = String(raw || "").replace(/[^0-9+]/g, "");
  if (!cleaned) return "";
  if (!cleaned.startsWith("+")) return cleaned;
  return `+${cleaned.slice(1).replace(/\+/g, "")}`;
}

function formatMessageAddress(raw: string, channel: TwilioMessageChannel): string {
  const phone = cleanPhone(raw);
  if (!phone) return "";
  return channel === "whatsapp" ? `whatsapp:${phone}` : phone;
}

async function getTenantSettings(userId: string): Promise<TwilioTenantSettings> {
  const [row] = await drizzle
    .select({
      twilioMessagingEnabled: schema.settings.twilioMessagingEnabled,
      twilioLookupEnabled: schema.settings.twilioLookupEnabled,
      twilioManagerAlertsEnabled: schema.settings.twilioManagerAlertsEnabled,
      twilioMessagingServiceSid: schema.settings.twilioMessagingServiceSid,
      twilioSmsFromNumber: schema.settings.twilioSmsFromNumber,
      twilioWhatsappFromNumber: schema.settings.twilioWhatsappFromNumber,
      twilioManagerAlertNumber: schema.settings.twilioManagerAlertNumber,
    })
    .from(schema.settings)
    .where(eq(schema.settings.userId, userId))
    .limit(1);

  return {
    messagingEnabled: !!row?.twilioMessagingEnabled,
    lookupEnabled: !!row?.twilioLookupEnabled,
    managerAlertsEnabled: !!row?.twilioManagerAlertsEnabled,
    messagingServiceSid: row?.twilioMessagingServiceSid || null,
    smsFromNumber: row?.twilioSmsFromNumber || null,
    whatsappFromNumber: row?.twilioWhatsappFromNumber || null,
    managerAlertNumber: row?.twilioManagerAlertNumber || null,
  };
}

async function fetchPhoneLookup(phone: string): Promise<TwilioLookupResult> {
  const client = getTwilioClient();
  if (!client) {
    return {
      ok: false,
      configured: false,
      enabled: false,
      reason: "Twilio credentials are not configured on this deployment.",
    };
  }

  try {
    const response = await client.lookups.v2
      .phoneNumbers(cleanPhone(phone))
      .fetch({ fields: "line_type_intelligence" });

    const lineType = (response as any).lineTypeIntelligence?.type ?? null;
    const carrierName = (response as any).lineTypeIntelligence?.carrierName ?? null;

    return {
      ok: true,
      configured: true,
      enabled: true,
      phoneNumber: response.phoneNumber || cleanPhone(phone),
      valid: response.valid ?? true,
      lineType,
      carrierName,
      countryCode: response.countryCode || null,
    };
  } catch (error) {
    log.warn("Twilio lookup failed", { error: getErrorMessage(error) });
    return {
      ok: false,
      configured: true,
      enabled: true,
      reason: "Twilio Lookup request failed.",
    };
  }
}

export async function lookupTenantPhoneNumber(
  userId: string,
  phone: string,
): Promise<TwilioLookupResult> {
  const settings = await getTenantSettings(userId);

  if (!settings.lookupEnabled) {
    return {
      ok: false,
      configured: isTwilioConfigured(),
      enabled: false,
      reason: "Phone intelligence is disabled for this workspace.",
    };
  }

  return fetchPhoneLookup(phone);
}

async function buildMessagePayload(
  userId: string,
  params: { to: string; body: string; channel: TwilioMessageChannel; agentId?: string },
  options?: {
    ignoreMessagingToggle?: boolean;
    operationalAlert?: boolean;
    settings?: TwilioTenantSettings;
  },
): Promise<{ payload?: Record<string, string | number>; result?: TwilioSendResult }> {
  const settings = options?.settings || (await getTenantSettings(userId));

  if (!options?.ignoreMessagingToggle && !settings.messagingEnabled) {
    return {
      result: {
        ok: false,
        configured: isTwilioConfigured(),
        enabled: false,
        reason: "Twilio messaging is disabled for this workspace.",
      },
    };
  }

  const client = getTwilioClient();
  if (!client) {
    return {
      result: {
        ok: false,
        configured: false,
        enabled: true,
        reason: "Twilio credentials are not configured on this deployment.",
      },
    };
  }

  if (params.channel === "sms" && settings.lookupEnabled) {
    const lookup = await fetchPhoneLookup(params.to);
    if (!lookup.ok) {
      return {
        result: {
          ok: false,
          configured: lookup.configured,
          enabled: true,
          reason: lookup.reason || "Phone validation failed before sending SMS.",
        },
      };
    }
    if (lookup.valid === false) {
      return {
        result: {
          ok: false,
          configured: true,
          enabled: true,
          reason: "The destination number did not pass Twilio validation.",
        },
      };
    }
    if ((lookup.lineType || "").toLowerCase() === "landline") {
      return {
        result: {
          ok: false,
          configured: true,
          enabled: true,
          reason: "The destination appears to be a landline, so SMS was not sent.",
        },
      };
    }
  }

  const payload: Record<string, string | number> = withTwilioMessageReliability(
    {
      to: formatMessageAddress(params.to, params.channel),
      body: params.body,
    },
    options?.operationalAlert ? { scope: "operational" } : undefined,
  );

  let sender = params.channel === "whatsapp" ? settings.whatsappFromNumber : settings.smsFromNumber;

  if (params.channel === "sms" && params.agentId) {
    const { resolveAgentSmsFromNumber } = await import("./agent-phone-lines");
    const agentLine = await resolveAgentSmsFromNumber(userId, params.agentId);
    if (agentLine) sender = agentLine;
  }

  if (sender) {
    payload.from = formatMessageAddress(sender, params.channel);
  }
  if (settings.messagingServiceSid) {
    payload.messagingServiceSid = settings.messagingServiceSid;
  }

  if (!payload.to) {
    return {
      result: {
        ok: false,
        configured: true,
        enabled: true,
        reason: "A destination number is required.",
      },
    };
  }

  if (!payload.from && !payload.messagingServiceSid) {
    return {
      result: {
        ok: false,
        configured: true,
        enabled: true,
        reason: "Configure a Twilio sender or Messaging Service SID first.",
      },
    };
  }

  return { payload };
}

/**
 * Keep a null-thread correlation row for staff-facing operational alerts. The
 * shared status callback can then attribute carrier failures to the workspace
 * without surfacing the message in a customer conversation thread.
 */
async function persistOperationalAlertCorrelation(
  userId: string,
  twilioSid: string,
): Promise<void> {
  try {
    await tenantStore.run(userId, () =>
      drizzle
        .insert(schema.smsMessages)
        .values({
          userId,
          threadId: null,
          direction: "out",
          // The carrier SID is all status reconciliation needs. Avoid storing
          // a second copy of staff-alert content, which can contain caller or
          // incident details, outside its canonical operational record.
          body: "[Operational alert delivery correlation]",
          twilioSid,
          agentId: null,
        })
        .onConflictDoNothing(),
    );
  } catch (error) {
    // The carrier already accepted the alert. Do not claim failure or retry an
    // ambiguous send merely because secondary correlation persistence failed.
    log.warn("Twilio operational alert correlation persistence failed", {
      error: getErrorMessage(error),
    });
  }
}

/**
 * Tenant SMS/WhatsApp sends live in ./twilio-service (sendTenantMessage),
 * which layers the DNC gate and atomic runtime-usage billing on top of this
 * module's payload building. Keep customer-bound sends there so no path can
 * skip suppression checks.
 */
export async function sendManagerAlert(
  userId: string,
  params: { title: string; message: string; callId?: string },
): Promise<TwilioSendResult> {
  const settings = await getTenantSettings(userId);
  if (!settings.managerAlertsEnabled || !settings.managerAlertNumber) {
    return {
      ok: false,
      configured: isTwilioConfigured(),
      enabled: false,
      reason: "Manager SMS alerts are disabled for this workspace.",
    };
  }

  const body = [params.title, params.message, params.callId ? `Call ID: ${params.callId}` : null]
    .filter(Boolean)
    .join("\n");

  const client = getTwilioClient();
  const prepared = await buildMessagePayload(
    userId,
    {
      to: settings.managerAlertNumber,
      body,
      channel: "sms",
    },
    { ignoreMessagingToggle: true, operationalAlert: true, settings },
  );

  if (prepared.result) return prepared.result;
  if (!client || !prepared.payload) {
    return {
      ok: false,
      configured: false,
      enabled: false,
      reason: "Twilio manager alerting is unavailable.",
    };
  }

  try {
    const message = await createTwilioMessageWithRateLimitRetry(
      () => client.messages.create(prepared.payload as any),
      {
        onRetry: ({ retryNumber, delayMs }) =>
          log.warn("Twilio manager alert rate limited; retrying accepted-safe request", {
            retryNumber,
            delayMs,
          }),
      },
    );
    await persistOperationalAlertCorrelation(userId, message.sid);
    return {
      ok: true,
      configured: true,
      enabled: true,
      sid: message.sid,
      status: message.status ?? null,
      to: message.to || String(prepared.payload.to || ""),
      channel: "sms",
    };
  } catch (error) {
    log.warn("Twilio manager alert failed", { error: getErrorMessage(error) });
    return {
      ok: false,
      configured: true,
      enabled: true,
      reason: "Twilio rejected the manager alert message.",
      channel: "sms",
    };
  }
}

/**
 * Send an SMS alert to an EXPLICITLY supplied destination phone — used
 * by the per-agent escalation override path. Bypasses
 * `managerAlertsEnabled` (the per-agent override IS the Account Holder's
 * opt-in). These are staff-facing operational alerts to a number the
 * Account Holder configured, NOT consumer marketing — so no DNC/quiet-hours
 * evaluation runs here (that lives in sendTenantMessage for customer-facing
 * sends). buildMessagePayload only supplies carrier plumbing.
 */
export async function sendDirectAlert(
  userId: string,
  destinationPhone: string,
  params: { title: string; message: string; callId?: string },
): Promise<TwilioSendResult> {
  // Basic input sanity. The UI validator already enforces > 7 chars +
  // E.164-ish, but the boundary here is the network — be defensive.
  const to = (destinationPhone || "").trim();
  if (!to || to.length < 7) {
    return {
      ok: false,
      configured: isTwilioConfigured(),
      enabled: false,
      reason: "Per-agent escalation phone is missing or too short.",
    };
  }

  const body = [params.title, params.message, params.callId ? `Call ID: ${params.callId}` : null]
    .filter(Boolean)
    .join("\n");

  const client = getTwilioClient();
  const prepared = await buildMessagePayload(
    userId,
    { to, body, channel: "sms" },
    { ignoreMessagingToggle: true, operationalAlert: true },
  );

  if (prepared.result) return prepared.result;
  if (!client || !prepared.payload) {
    return {
      ok: false,
      configured: false,
      enabled: false,
      reason: "Twilio direct alerting is unavailable.",
    };
  }

  try {
    const message = await createTwilioMessageWithRateLimitRetry(
      () => client.messages.create(prepared.payload as any),
      {
        onRetry: ({ retryNumber, delayMs }) =>
          log.warn("Twilio per-agent alert rate limited; retrying accepted-safe request", {
            retryNumber,
            delayMs,
          }),
      },
    );
    await persistOperationalAlertCorrelation(userId, message.sid);
    return {
      ok: true,
      configured: true,
      enabled: true,
      sid: message.sid,
      status: message.status ?? null,
      to: message.to || String(prepared.payload.to || ""),
      channel: "sms",
    };
  } catch (error) {
    log.warn("Twilio per-agent escalation alert failed", { error: getErrorMessage(error) });
    return {
      ok: false,
      configured: true,
      enabled: true,
      reason: "Twilio rejected the per-agent escalation message.",
      channel: "sms",
    };
  }
}

/**
 * Platform-owner alert used by the public Vapi escalation webhook. This is a
 * staff-facing operational message, never a consumer campaign send. When the
 * invoked number resolves to a tenant, persist a null-thread correlation row
 * so carrier delivery failures are attributed and visible in telemetry.
 */
export async function sendPlatformOperationalAlert(
  userId: string | null,
  destinationPhone: string,
  body: string,
): Promise<TwilioSendResult> {
  const client = getTwilioClient();
  const to = formatMessageAddress(destinationPhone, "sms");
  const from = formatMessageAddress(env("PLATFORM_SMS_FROM"), "sms");
  const messageBody = String(body || "").trim();

  if (!client || !from) {
    return {
      ok: false,
      configured: false,
      enabled: false,
      reason: "Twilio platform sender is not configured.",
      channel: "sms",
    };
  }
  if (!to || !messageBody) {
    return {
      ok: false,
      configured: true,
      enabled: false,
      reason: "A platform alert destination and message are required.",
      channel: "sms",
    };
  }

  const payload = withTwilioMessageReliability(
    { to, from, body: messageBody },
    { scope: "operational" },
  );
  try {
    const message = await createTwilioMessageWithRateLimitRetry(
      () => client.messages.create(payload as any),
      {
        onRetry: ({ retryNumber, delayMs }) =>
          log.warn("Twilio platform alert rate limited; retrying accepted-safe request", {
            retryNumber,
            delayMs,
          }),
      },
    );
    if (userId) await persistOperationalAlertCorrelation(userId, message.sid);
    return {
      ok: true,
      configured: true,
      enabled: true,
      sid: message.sid,
      status: message.status ?? null,
      to: message.to || to,
      channel: "sms",
    };
  } catch (error) {
    log.warn("Twilio platform operational alert failed", { error: getErrorMessage(error) });
    return {
      ok: false,
      configured: true,
      enabled: true,
      reason: "Twilio rejected the platform operational alert.",
      channel: "sms",
    };
  }
}
