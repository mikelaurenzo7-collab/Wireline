#!/usr/bin/env node

/**
 * Read-only launch probe. It validates credentials, inventory, channel posture,
 * and funding without printing secrets or making billable model/call/message
 * requests.
 *
 * Load production env before running:
 *   node --env-file=.env.production scripts/check-vendor-readiness.mjs
 */

const checks = [];

function record(id, required, level, detail, fundingAction = null, metadata = undefined) {
  checks.push({
    id,
    required,
    level,
    detail,
    funding_action: fundingAction,
    ...(metadata ? { metadata } : {}),
  });
}

async function readJson(url, init = {}) {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(10_000),
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json().catch(() => ({})),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: {},
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

function present(name) {
  return Boolean(process.env[name]?.trim());
}

/**
 * Mirror src/lib/federal-dnc-service.ts `isFederalDncVendorConfigured`.
 * Presence-only checks lied when a Vercel personal token (`vcp_…`) was pasted
 * as FEDERAL_DNC_API_KEY — readiness said ready while runtime correctly failed closed.
 */
function isFederalDncVendorConfigured() {
  const apiKey = process.env.FEDERAL_DNC_API_KEY?.trim();
  const apiUrl = process.env.FEDERAL_DNC_API_URL?.trim();
  if (!apiKey || !apiUrl) return false;
  if (/^vcp_/i.test(apiKey) || /^vercel_/i.test(apiKey)) return false;
  try {
    return new URL(apiUrl).protocol === "https:";
  } catch {
    return false;
  }
}

function validHttpsUrl(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return false;
  try {
    return new URL(raw).protocol === "https:";
  } catch {
    return false;
  }
}

function arrayAt(body, key) {
  return Array.isArray(body?.[key]) ? body[key] : Array.isArray(body) ? body : [];
}

function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

record(
  "postgres",
  true,
  present("POSTGRES_URL") ? "ready" : "blocked",
  present("POSTGRES_URL")
    ? "Database URL configured; run npm run db:health."
    : "POSTGRES_URL missing.",
  present("POSTGRES_URL") ? "Maintain the Supabase plan; no prepaid balance is required." : null,
);

record(
  "upstash",
  true,
  present("UPSTASH_REDIS_REST_URL") && present("UPSTASH_REDIS_REST_TOKEN")
    ? "ready"
    : "blocked",
  "Distributed rate-limit credentials.",
  "Maintain a production Upstash database and billing method.",
);

const twilioConfigured = present("TWILIO_ACCOUNT_SID") && present("TWILIO_AUTH_TOKEN");
const twilioAuthorization = twilioConfigured
  ? basicAuth(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;
const gatewayCredential =
  process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim() || "";

const [
  xai,
  openai,
  gemini,
  gateway,
  vapiPhones,
  vapiAssistants,
  twilioAccount,
  twilioBalance,
  twilioNumbers,
  twilioMessagingServices,
  twilioWhatsappSenders,
  stripeAccount,
  stripeBalance,
  resend,
] = await Promise.all([
  present("XAI_API_KEY")
    ? readJson("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      })
    : null,
  present("OPENAI_API_KEY")
    ? readJson("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      })
    : null,
  present("GEMINI_API_KEY")
    ? readJson(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
      )
    : null,
  gatewayCredential
    ? readJson("https://ai-gateway.vercel.sh/v1/models", {
        headers: { Authorization: `Bearer ${gatewayCredential}` },
      })
    : null,
  present("VAPI_PRIVATE_KEY")
    ? readJson("https://api.vapi.ai/phone-number?limit=100", {
        headers: { Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}` },
      })
    : null,
  present("VAPI_PRIVATE_KEY")
    ? readJson("https://api.vapi.ai/assistant?limit=1", {
        headers: { Authorization: `Bearer ${process.env.VAPI_PRIVATE_KEY}` },
      })
    : null,
  twilioConfigured
    ? readJson(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}.json`,
        { headers: { Authorization: twilioAuthorization } },
      )
    : null,
  twilioConfigured
    ? readJson(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}/Balance.json`,
        { headers: { Authorization: twilioAuthorization } },
      )
    : null,
  twilioConfigured
    ? readJson(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(process.env.TWILIO_ACCOUNT_SID)}/IncomingPhoneNumbers.json?PageSize=50`,
        { headers: { Authorization: twilioAuthorization } },
      )
    : null,
  twilioConfigured
    ? readJson("https://messaging.twilio.com/v1/Services?PageSize=50", {
        headers: { Authorization: twilioAuthorization },
      })
    : null,
  twilioConfigured
    ? readJson("https://messaging.twilio.com/v1/Channels/Senders?Channel=whatsapp&PageSize=50", {
        headers: { Authorization: twilioAuthorization },
      })
    : null,
  present("STRIPE_SECRET_KEY")
    ? readJson("https://api.stripe.com/v1/account", {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      })
    : null,
  present("STRIPE_SECRET_KEY")
    ? readJson("https://api.stripe.com/v1/balance", {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      })
    : null,
  present("RESEND_API_KEY")
    ? readJson("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      })
    : null,
]);

const openaiModelIds = new Set(
  arrayAt(openai?.body, "data")
    .map((model) => String(model?.id || ""))
    .filter(Boolean),
);
const openaiStructuredModelReady = openai?.ok && openaiModelIds.has("gpt-5.6-terra");
const openaiRealtimeModelReady = openai?.ok && openaiModelIds.has("gpt-realtime-2.1");
const openaiTranscriberReady =
  openai?.ok && openaiModelIds.has("gpt-4o-mini-transcribe");

record(
  "openai",
  true,
  openaiStructuredModelReady ? "ready" : "blocked",
  openaiStructuredModelReady
    ? "OpenAI key accepted and the required gpt-5.6-terra model is available."
    : openai?.ok
      ? "OpenAI key accepted, but the required gpt-5.6-terra model is unavailable."
      : "OpenAI key missing or rejected.",
  "Keep a payment method, project budget, and usage alerts enabled.",
  {
    structured_model: "gpt-5.6-terra",
    structured_model_available: openaiStructuredModelReady,
    realtime_model: "gpt-realtime-2.1",
    realtime_model_available: openaiRealtimeModelReady,
    transcriber_model: "gpt-4o-mini-transcribe",
    transcriber_model_available: openaiTranscriberReady,
  },
);
record(
  "gemini",
  false,
  gemini?.ok ? "ready" : "degraded",
  gemini?.ok ? "Gemini continuity fallback key accepted." : "Gemini fallback unavailable.",
  "Attach Google Cloud billing only if free or committed quota is insufficient.",
);
record(
  "ai_gateway",
  false,
  gateway?.ok ? "ready" : "degraded",
  gateway?.ok
    ? "Vercel AI Gateway credential accepted and model catalog reachable."
    : gatewayCredential
      ? `AI Gateway credential was rejected or unavailable${gateway ? ` (HTTP ${gateway.status})` : ""}.`
      : "AI Gateway credential missing.",
  "Set an API-key budget and alerting; add credits or auto-top-up before scale.",
);

record(
  "xai",
  true,
  xai?.ok ? "ready" : "degraded",
  xai?.ok
    ? "xAI key accepted; the Grok 4.5 structured primary and Wireline Live voice APIs are reachable."
    : "Primary xAI layer missing or rejected; structured turns degrade to the OpenAI continuity fallback.",
  "Keep the Grok 4.5 primary funded and healthy; OpenAI, Gemini, and the AI Gateway carry ordered continuity.",
  { structured_primary_model: "grok-4.5" },
);

const vapiPhoneInventory = arrayAt(vapiPhones?.body, "data");
const vapiAssistantInventory = arrayAt(vapiAssistants?.body, "data");
const vapiReady = Boolean(vapiPhones?.ok && vapiAssistants?.ok && vapiPhoneInventory.length > 0);
record(
  "vapi",
  true,
  vapiReady ? "ready" : "blocked",
  vapiPhones?.ok && vapiAssistants?.ok
    ? `Vapi key accepted; ${vapiPhoneInventory.length} phone number(s) reachable and assistant API accepted.`
    : "Vapi key missing, rejected, or inventory APIs unavailable.",
  vapiPhoneInventory.length > 0
    ? "Keep Vapi billing funded and auto-reload enabled."
    : "Provision or import at least one production phone number before launch.",
  { phone_number_count: vapiPhoneInventory.length, assistant_sample_count: vapiAssistantInventory.length },
);

const twilioAccountReady = Boolean(twilioAccount?.ok && twilioAccount.body?.status === "active");
const twilioIncomingNumbers = arrayAt(twilioNumbers?.body, "incoming_phone_numbers");
const voiceCapableNumbers = twilioIncomingNumbers.filter((number) => number?.capabilities?.voice === true);
const smsCapableNumbers = twilioIncomingNumbers.filter((number) => number?.capabilities?.sms === true);
const twilioServices = arrayAt(twilioMessagingServices?.body, "services");
const whatsappSenders = arrayAt(twilioWhatsappSenders?.body, "senders");
const onlineWhatsappSenders = whatsappSenders.filter(
  (sender) => String(sender?.status || "").trim().toUpperCase() === "ONLINE",
);
const twilioBalanceUsd = Number(twilioBalance?.body?.balance ?? Number.NaN);
const twilioFunded = Boolean(
  twilioBalance?.ok && Number.isFinite(twilioBalanceUsd) && twilioBalanceUsd >= 0,
);
const twilioVoiceSmsReady = Boolean(
  twilioAccountReady &&
    twilioFunded &&
    voiceCapableNumbers.length > 0 &&
    (smsCapableNumbers.length > 0 || twilioServices.length > 0),
);
record(
  "twilio_voice_sms",
  true,
  twilioVoiceSmsReady ? "ready" : "blocked",
  twilioAccountReady
    ? `Twilio account active${
        twilioBalance?.ok
          ? `; reported balance ${twilioBalance.body.balance} ${twilioBalance.body.currency}`
          : ""
      }; ${voiceCapableNumbers.length} voice-capable number(s), ${smsCapableNumbers.length} SMS-capable number(s), and ${twilioServices.length} Messaging Service(s).`
    : `Twilio credentials missing or rejected${twilioAccount ? ` (HTTP ${twilioAccount.status})` : ""}.`,
  twilioVoiceSmsReady
    ? "Keep the paid account and payment method current; configure Usage Triggers and sender webhooks."
    : twilioAccountReady && !twilioFunded
      ? "Restore a non-negative Twilio balance and successful recharge posture before launch."
      : "Restore valid credentials and provision at least one voice-capable number plus an SMS sender or Messaging Service.",
  {
    balance_usd: twilioBalance?.ok && Number.isFinite(twilioBalanceUsd) ? twilioBalanceUsd : null,
    balance_non_negative: twilioFunded,
    incoming_number_count: twilioIncomingNumbers.length,
    voice_capable_number_count: voiceCapableNumbers.length,
    sms_capable_number_count: smsCapableNumbers.length,
    messaging_service_count: twilioServices.length,
  },
);
record(
  "twilio_whatsapp",
  false,
  onlineWhatsappSenders.length > 0 ? "ready" : "degraded",
  onlineWhatsappSenders.length > 0
    ? `${onlineWhatsappSenders.length} ONLINE WhatsApp sender(s) found.`
    : "No ONLINE Twilio WhatsApp sender found; keep WhatsApp private-beta and do not market it as generally available.",
  onlineWhatsappSenders.length > 0
    ? "Maintain Meta business verification, approved templates, quality rating, and Twilio funding."
    : "Complete WABA/sender onboarding and approve templates before enabling business-initiated WhatsApp messages.",
  { sender_count: whatsappSenders.length, online_sender_count: onlineWhatsappSenders.length },
);

const stripeAvailable = Number(
  stripeBalance?.body?.available?.find?.((row) => row.currency === "usd")?.amount ?? 0,
);
const stripeReady = Boolean(
  stripeAccount?.ok &&
    stripeAccount.body?.charges_enabled &&
    stripeAccount.body?.payouts_enabled &&
    stripeAvailable >= 0,
);
record(
  "stripe",
  true,
  stripeReady ? "ready" : "blocked",
  stripeAccount?.ok
    ? `Charges ${stripeAccount.body.charges_enabled ? "enabled" : "disabled"}; payouts ${
        stripeAccount.body.payouts_enabled ? "enabled" : "disabled"
      }; available USD balance ${(stripeAvailable / 100).toFixed(2)}.`
    : "Stripe key missing or rejected.",
  stripeAvailable < 0
    ? "Resolve the negative Stripe balance and failed bank debits before launch."
    : "No prepaid funding required; keep payout bank and webhook healthy.",
);

const verifiedDomains = resend?.ok
  ? (resend.body?.data ?? []).filter((domain) => domain.status === "verified")
  : [];
record(
  "resend",
  true,
  verifiedDomains.length > 0 ? "ready" : "blocked",
  verifiedDomains.length > 0
    ? `Verified sending domain(s): ${verifiedDomains.map((domain) => domain.name).join(", ")}.`
    : "Resend key/domain missing or unverified.",
  "Maintain the Resend plan; no prepaid balance is required.",
);

const federalDncConfigured = isFederalDncVendorConfigured();
const federalDncKey = process.env.FEDERAL_DNC_API_KEY?.trim() || "";
const federalDncLooksLikeVercelToken = /^vcp_/i.test(federalDncKey) || /^vercel_/i.test(federalDncKey);
record(
  "federal_dnc",
  // Deferred launch checklist: marketing outbound still fails closed at runtime
  // until a real DNCScrub loginId is configured after business registration.
  false,
  federalDncConfigured ? "ready" : "blocked",
  federalDncConfigured
    ? "Federal DNC vendor URL and key configured; run npm run dnc:probe for live verification."
    : federalDncLooksLikeVercelToken
      ? "FEDERAL_DNC_API_KEY looks like a Vercel access token (vcp_/vercel_) — replace with the DNCScrub loginId."
      : !present("FEDERAL_DNC_API_KEY")
        ? "FEDERAL_DNC_API_KEY is missing (deferred checklist — not a launch GO blocker)."
        : "FEDERAL_DNC_API_URL is missing or is not a valid HTTPS URL (deferred checklist).",
  "Register the business, obtain a DNCScrub loginId, then fund scrub credits before marketing outbound.",
);

const blocked = checks.filter((check) => check.required && check.level === "blocked");
const degraded = checks.filter((check) => check.level === "degraded");
const report = {
  generated_at: new Date().toISOString(),
  launch_ready: blocked.length === 0,
  blocked: blocked.map((check) => check.id),
  degraded: degraded.map((check) => check.id),
  checks,
};

console.log(JSON.stringify(report, null, 2));
if (blocked.length > 0) process.exitCode = 1;
