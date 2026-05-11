import twilio from "twilio";

import { db, log } from "./server-context";
import { getErrorMessage } from "./server-utils";

export type TwilioMessageChannel = "sms" | "whatsapp";

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
  sid?: string;
  status?: string | null;
  to?: string;
  channel?: TwilioMessageChannel;
}

let cachedClient: ReturnType<typeof twilio> | null | undefined;

function env(name: string): string {
  return typeof process.env[name] === "string" ? process.env[name]!.trim() : "";
}

function getTwilioClient() {
  if (cachedClient !== undefined) return cachedClient;

  const accountSid = env("TWILIO_ACCOUNT_SID");
  const authToken = env("TWILIO_AUTH_TOKEN");
  if (!accountSid || !authToken) {
    cachedClient = null;
    return cachedClient;
  }

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
  const { data } = await db
    .from("wireline_settings")
    .select([
      "twilio_messaging_enabled",
      "twilio_lookup_enabled",
      "twilio_manager_alerts_enabled",
      "twilio_messaging_service_sid",
      "twilio_sms_from_number",
      "twilio_whatsapp_from_number",
      "twilio_manager_alert_number",
    ].join(","))
    .eq("user_id", userId)
    .maybeSingle();

  const row = (data || null) as Record<string, any> | null;

  return {
    messagingEnabled: !!row?.twilio_messaging_enabled,
    lookupEnabled: !!row?.twilio_lookup_enabled,
    managerAlertsEnabled: !!row?.twilio_manager_alerts_enabled,
    messagingServiceSid: row?.twilio_messaging_service_sid || null,
    smsFromNumber: row?.twilio_sms_from_number || null,
    whatsappFromNumber: row?.twilio_whatsapp_from_number || null,
    managerAlertNumber: row?.twilio_manager_alert_number || null,
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

export async function lookupTenantPhoneNumber(userId: string, phone: string): Promise<TwilioLookupResult> {
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
  params: { to: string; body: string; channel: TwilioMessageChannel },
  options?: { ignoreMessagingToggle?: boolean; settings?: TwilioTenantSettings },
): Promise<{ payload?: Record<string, string>; result?: TwilioSendResult }> {
  const settings = options?.settings || await getTenantSettings(userId);

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

  const payload: Record<string, string> = {
    to: formatMessageAddress(params.to, params.channel),
    body: params.body,
  };

  const sender =
    params.channel === "whatsapp"
      ? settings.whatsappFromNumber
      : settings.smsFromNumber;

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

export async function sendTenantMessage(
  userId: string,
  params: { to: string; body: string; channel?: TwilioMessageChannel },
): Promise<TwilioSendResult> {
  const channel = params.channel || "sms";
  const client = getTwilioClient();
  const prepared = await buildMessagePayload(userId, {
    to: params.to,
    body: params.body,
    channel,
  });

  if (prepared.result) return prepared.result;
  if (!client || !prepared.payload) {
    return {
      ok: false,
      configured: false,
      enabled: false,
      reason: "Twilio messaging is unavailable.",
    };
  }

  try {
    const message = await client.messages.create(prepared.payload as any);
    return {
      ok: true,
      configured: true,
      enabled: true,
      sid: message.sid,
      status: message.status ?? null,
      to: message.to || prepared.payload.to,
      channel,
    };
  } catch (error) {
    log.warn("Twilio message send failed", { error: getErrorMessage(error), channel });
    return {
      ok: false,
      configured: true,
      enabled: true,
      reason: "Twilio rejected the message send request.",
      channel,
    };
  }
}

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

  const body = [
    params.title,
    params.message,
    params.callId ? `Call ID: ${params.callId}` : null,
  ]
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
    { ignoreMessagingToggle: true, settings },
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
    const message = await client.messages.create(prepared.payload as any);
    return {
      ok: true,
      configured: true,
      enabled: true,
      sid: message.sid,
      status: message.status ?? null,
      to: message.to || prepared.payload.to,
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
