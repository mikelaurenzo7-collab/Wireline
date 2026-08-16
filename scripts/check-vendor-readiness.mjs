#!/usr/bin/env node

/**
 * Read-only launch probe. It validates credentials, inventory, channel posture,
 * and funding without printing secrets or making billable model/call/message
 * requests.
 *
 * Load production env before running:
 *   node --env-file=.env.production scripts/check-vendor-readiness.mjs
 */

import { getHandledStripeWebhookEvents } from "./lib/stripe-handled-events.mjs";

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
 * Mirror src/lib/federal-dnc-config.ts `isFederalDncVendorConfigured`.
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

function hasWirelineSmsRetryPolicy(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    if (!url.pathname.endsWith("/api/twilio-webhook/sms")) return false;
    const params = new URLSearchParams(url.hash.replace(/^#/, ""));
    const policies = new Set(
      (params.get("rp") || "")
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean),
    );
    const retryCount = Number(params.get("rc") || 0);
    return policies.has("5xx") && policies.has("ct") && policies.has("rt") && retryCount >= 1;
  } catch {
    return false;
  }
}

function httpsOrigin(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
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
  present("UPSTASH_REDIS_REST_URL") && present("UPSTASH_REDIS_REST_TOKEN") ? "ready" : "blocked",
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
  stripePortalConfigurations,
  stripeWebhookEndpoints,
  stripeTaxSettings,
  stripeTaxRegistrations,
  resend,
  elevenlabs,
  elevenlabsVoices,
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
  present("STRIPE_SECRET_KEY")
    ? readJson("https://api.stripe.com/v1/billing_portal/configurations?active=true&limit=100", {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      })
    : null,
  present("STRIPE_SECRET_KEY")
    ? readJson("https://api.stripe.com/v1/webhook_endpoints?limit=100", {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      })
    : null,
  present("STRIPE_SECRET_KEY")
    ? readJson("https://api.stripe.com/v1/tax/settings", {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      })
    : null,
  present("STRIPE_SECRET_KEY")
    ? readJson("https://api.stripe.com/v1/tax/registrations?status=active&limit=100", {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      })
    : null,
  present("RESEND_API_KEY")
    ? readJson("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      })
    : null,
  present("ELEVENLABS_API_KEY")
    ? readJson("https://api.elevenlabs.io/v1/user/subscription", {
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
      })
    : null,
  present("ELEVENLABS_API_KEY")
    ? readJson("https://api.elevenlabs.io/v1/voices", {
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
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
const openaiTranscriberReady = openai?.ok && openaiModelIds.has("gpt-4o-mini-transcribe");

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
  false,
  xai?.ok ? "ready" : "degraded",
  xai?.ok
    ? "xAI key accepted; optional Grok experiment APIs are reachable."
    : "Optional xAI layer missing or rejected; launch defaults stay on OpenAI → Gemini → AI Gateway.",
  "Keep xAI experiment-only. Fund only if WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK is intentionally enabled.",
  {
    structured_primary_model: "gpt-5.6-terra",
    xai_role: "optional_experiment",
  },
);

// Core studio voices the runtime hard-requires (mirror of
// ELEVENLABS_CORE_VOICE_IDS in src/lib/voice-catalog.ts). Verified present
// 2026-08-07. The broader ELEVENLABS_CURATED_VOICES catalog is intentionally
// best-effort: each of its voices carries a Vapi fallback in
// buildManagedVoiceRuntime, so a library rotation degrades one voice rather
// than blocking launch. The gate therefore requires only the core set and
// reports how much of the studio catalog the account can currently serve.
const coreElevenLabsVoiceIds = new Set([
  "EXAVITQu4vr4xnSDxMaL",
  "cgSgspJ2msm6clMCkdW9",
  "pNInz6obpgDQGcFmaJgB",
  "JBFqnCBsd6RMkjVDRZzb",
  "nPczCjzI2devNBz1zQrb",
]);
const elevenLabsVoiceInventory = arrayAt(elevenlabsVoices?.body, "voices");
const availableElevenLabsVoiceIds = new Set(
  elevenLabsVoiceInventory.map((voice) => String(voice?.voice_id || "")).filter(Boolean),
);
const premadeVoiceCount = elevenLabsVoiceInventory.filter(
  (voice) => String(voice?.category || "") === "premade",
).length;
const missingCoreVoices = [...coreElevenLabsVoiceIds].filter(
  (voiceId) => !availableElevenLabsVoiceIds.has(voiceId),
);
const coreElevenLabsVoicesReady = missingCoreVoices.length === 0;
const elevenLabsReady = Boolean(
  elevenlabs?.ok && elevenlabsVoices?.ok && coreElevenLabsVoicesReady,
);
record(
  "elevenlabs",
  true,
  elevenLabsReady ? "ready" : "blocked",
  elevenLabsReady
    ? `ElevenLabs key accepted (${elevenlabs.body?.tier || "unknown"} tier); all core studio voices reachable, ${premadeVoiceCount} premade voices available for the studio catalog.`
    : elevenlabs?.ok && elevenlabsVoices?.ok
      ? `ElevenLabs key accepted, but core studio voices are unavailable: ${missingCoreVoices.join(", ")}.`
      : "ElevenLabs managed voice credential missing, rejected, or voice inventory unavailable.",
  "Keep provider billing and usage alerts active; confirm the ElevenLabs key in Vapi Integrations and prove one fallback call before GA.",
  elevenlabs?.ok
    ? {
        character_count: elevenlabs.body?.character_count ?? null,
        character_limit: elevenlabs.body?.character_limit ?? null,
        voice_count: elevenLabsVoiceInventory.length,
        premade_voice_count: premadeVoiceCount,
        core_voice_count: [...coreElevenLabsVoiceIds].filter((id) =>
          availableElevenLabsVoiceIds.has(id),
        ).length,
        runtime_model: "eleven_flash_v2_5",
      }
    : undefined,
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
  {
    phone_number_count: vapiPhoneInventory.length,
    assistant_sample_count: vapiAssistantInventory.length,
  },
);

const twilioAccountReady = Boolean(twilioAccount?.ok && twilioAccount.body?.status === "active");
const twilioIncomingNumbers = arrayAt(twilioNumbers?.body, "incoming_phone_numbers");
const voiceCapableNumbers = twilioIncomingNumbers.filter(
  (number) => number?.capabilities?.voice === true,
);
const smsCapableNumbers = twilioIncomingNumbers.filter(
  (number) => number?.capabilities?.sms === true,
);
const twilioServices = arrayAt(twilioMessagingServices?.body, "services");
const whatsappSenders = arrayAt(twilioWhatsappSenders?.body, "senders");
const onlineWhatsappSenders = whatsappSenders.filter(
  (sender) =>
    String(sender?.status || "")
      .trim()
      .toUpperCase() === "ONLINE",
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
const wirelineDirectSmsNumbers = smsCapableNumbers.filter(
  (number) =>
    typeof number?.sms_url === "string" &&
    number.sms_url.includes("/api/twilio-webhook/sms"),
);
const wirelineSmsRetryReady =
  wirelineDirectSmsNumbers.length > 0 &&
  wirelineDirectSmsNumbers.every((number) => hasWirelineSmsRetryPolicy(number.sms_url));
record(
  "twilio_sms_webhook_retries",
  true,
  wirelineSmsRetryReady ? "ready" : "blocked",
  `${wirelineDirectSmsNumbers.filter((number) => hasWirelineSmsRetryPolicy(number.sms_url)).length}/${wirelineDirectSmsNumbers.length} direct Wireline SMS number(s) explicitly retry transient 5xx webhook failures.`,
  wirelineSmsRetryReady
    ? null
    : "Update every Wireline IncomingPhoneNumber SmsUrl to include #rc=2&rp=5xx,ct,rt&ct=3000&rt=5000&tt=15000 before paid launch.",
  {
    direct_wireline_sms_number_count: wirelineDirectSmsNumbers.length,
    retry_ready_count: wirelineDirectSmsNumbers.filter((number) =>
      hasWirelineSmsRetryPolicy(number.sms_url),
    ).length,
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
  {
    sender_count: whatsappSenders.length,
    online_sender_count: onlineWhatsappSenders.length,
  },
);

// An unread balance must not read as a verified $0.00. Defaulting the amount to
// 0 satisfied the `>= 0` check below and printed "available USD balance 0.00"
// as fact, so a Stripe outage or a key without balance scope passed the gate.
const stripeBalanceAmount = stripeBalance?.ok
  ? stripeBalance.body?.available?.find?.((row) => row.currency === "usd")?.amount
  : undefined;
const stripeBalanceRead =
  typeof stripeBalanceAmount === "number" && Number.isFinite(stripeBalanceAmount);
const stripeAvailable = stripeBalanceRead ? Number(stripeBalanceAmount) : null;
const stripeCoreReady = Boolean(
  stripeAccount?.ok &&
  stripeAccount.body?.charges_enabled &&
  stripeAccount.body?.payouts_enabled &&
  stripeBalanceRead &&
  stripeAvailable >= 0,
);

const stripePublicName = String(
  stripeAccount?.body?.business_profile?.name ||
    stripeAccount?.body?.settings?.dashboard?.display_name ||
    "",
).trim();
const stripeStatementDescriptor = String(
  stripeAccount?.body?.settings?.payments?.statement_descriptor || "",
)
  .trim()
  .toUpperCase();
const stripeWebsiteOrigin = httpsOrigin(stripeAccount?.body?.business_profile?.url);
const stripeSupportOrigin = httpsOrigin(stripeAccount?.body?.business_profile?.support_url);
const stripeBrandReady = Boolean(
  /wireline/i.test(stripePublicName) &&
  stripeStatementDescriptor.startsWith("WIRELINE") &&
  stripeWebsiteOrigin === "https://trywireline.com" &&
  stripeSupportOrigin === "https://trywireline.com",
);

const stripePortalConfigs = arrayAt(stripePortalConfigurations?.body, "data");
// Pick a configuration that actually carries the customer controls, preferring
// the Wireline-managed one. Matching on active+default first and only then
// checking features reported "blocked" whenever a bare Dashboard default
// happened to sort ahead of the managed configuration the app really uses.
const stripePortalHasCustomerControls = (configuration) =>
  configuration?.features?.payment_method_update?.enabled === true &&
  configuration?.features?.invoice_history?.enabled === true &&
  configuration?.features?.subscription_cancel?.enabled === true;
const stripePortalCandidates = stripePortalConfigs.filter(
  (configuration) =>
    configuration?.active === true && stripePortalHasCustomerControls(configuration),
);
const stripePortalConfiguration =
  stripePortalCandidates.find(
    (configuration) => configuration?.metadata?.wireline_managed === "true",
  ) || stripePortalCandidates.find((configuration) => configuration?.is_default === true);
const stripePortalFeatures = stripePortalConfiguration?.features ?? {};
const stripePortalReady = Boolean(stripePortalConfigurations?.ok && stripePortalConfiguration);

// Derived from the handlers, never hand-maintained. This file kept its own
// copy of eight events and never learned about charge.dispute.funds_withdrawn
// and charge.dispute.funds_reinstated, so a correctly aligned endpoint was
// reported as carrying two "extra" events and blocked the run — while
// `npm run stripe:webhook:check` demanded exactly those ten. No endpoint
// satisfied both gates, and the only way to clear this one was to delete the
// two dispute-funds events from Stripe, which is what debits and re-credits
// tenant Runtime Allowance when dispute funds move.
const expectedStripeWebhookEvents = getHandledStripeWebhookEvents();
const stripeWebhookInventory = arrayAt(stripeWebhookEndpoints?.body, "data");
const stripeWebhook = stripeWebhookInventory.find(
  (endpoint) =>
    endpoint?.status === "enabled" &&
    String(endpoint?.url || "").replace(/\/+$/, "") ===
      "https://trywireline.com/api/stripe-webhook",
);
const stripeEnabledWebhookEvents = Array.isArray(stripeWebhook?.enabled_events)
  ? [...stripeWebhook.enabled_events].sort()
  : [];
const stripeMissingWebhookEvents = expectedStripeWebhookEvents.filter(
  (event) => !stripeEnabledWebhookEvents.includes(event),
);
const stripeExtraWebhookEvents = stripeEnabledWebhookEvents.filter(
  (event) => event !== "*" && !expectedStripeWebhookEvents.includes(event),
);
const stripeWebhookReady = Boolean(
  stripeWebhook && stripeMissingWebhookEvents.length === 0 && stripeExtraWebhookEvents.length === 0,
);
const stripeAutomaticTaxEnabled = process.env.STRIPE_AUTOMATIC_TAX_ENABLED === "true";
const stripeActiveTaxRegistrations = stripeTaxRegistrations?.ok
  ? arrayAt(stripeTaxRegistrations.body, "data").filter(
      (registration) => registration?.status === "active",
    )
  : [];
const stripeTaxProviderReady = Boolean(
  stripeTaxSettings?.ok &&
    stripeTaxSettings.body?.status === "active" &&
    stripeTaxRegistrations?.ok &&
    stripeActiveTaxRegistrations.length > 0,
);
// Tax collection is launch-safe when it is deliberately off, or when the
// operator deliberately enabled it after both provider prerequisites exist.
const stripeTaxReady = !stripeAutomaticTaxEnabled || stripeTaxProviderReady;
const stripeReady = Boolean(
  stripeCoreReady && stripeBrandReady && stripePortalReady && stripeWebhookReady && stripeTaxReady,
);

const stripeFundingAction = !stripeBalanceRead
  ? "Stripe balance could not be read; confirm the key has balance access before trusting the funding claim."
  : stripeAvailable < 0
    ? "Resolve the negative Stripe balance and failed bank debits before launch."
    : !stripeBrandReady
      ? "Align the public business name, statement descriptor, website, support URL, logo, and colors to Wireline in Stripe."
      : !stripePortalReady
        ? "Exercise Wireline portal bootstrap (or create a Dashboard default) and verify payment methods, invoices, and cancellation."
        : !stripeWebhookReady
          ? `Align the enabled trywireline.com webhook endpoint to the ${expectedStripeWebhookEvents.length} server-handled events (npm run stripe:webhook:align).`
          : !stripeTaxReady
            ? "Disable STRIPE_AUTOMATIC_TAX_ENABLED, or activate Stripe Tax settings and at least one applicable registration after qualified tax review."
            : "No prepaid funding required; keep payout bank, portal, webhook, and the deliberate tax posture healthy.";

record(
  "stripe",
  true,
  stripeReady ? "ready" : "blocked",
  stripeAccount?.ok
    ? `Core account ${stripeCoreReady ? "ready" : "blocked"}; customer brand "${
        stripePublicName || "unset"
      }" ${stripeBrandReady ? "ready" : "blocked"}; managed/default portal ${
        stripePortalReady ? "ready" : "blocked"
      }; webhook ${stripeWebhookReady ? "ready" : "blocked"}; tax ${
        stripeAutomaticTaxEnabled
          ? stripeTaxProviderReady
            ? "collection ready"
            : "collection blocked"
          : "collection off by policy"
      }; available USD balance ${
        stripeBalanceRead ? (stripeAvailable / 100).toFixed(2) : "unread"
      }.`
    : "Stripe key missing or rejected.",
  stripeFundingAction,
  {
    core_account_ready: stripeCoreReady,
    public_name: stripePublicName || null,
    statement_descriptor_ready: stripeStatementDescriptor.startsWith("WIRELINE"),
    website_origin: stripeWebsiteOrigin,
    support_origin: stripeSupportOrigin,
    brand_ready: stripeBrandReady,
    managed_or_default_portal_present: Boolean(stripePortalConfiguration),
    portal_payment_method_update: stripePortalFeatures.payment_method_update?.enabled === true,
    portal_invoice_history: stripePortalFeatures.invoice_history?.enabled === true,
    portal_subscription_cancel: stripePortalFeatures.subscription_cancel?.enabled === true,
    portal_ready: stripePortalReady,
    webhook_ready: stripeWebhookReady,
    webhook_missing_events: stripeMissingWebhookEvents,
    webhook_extra_events: stripeExtraWebhookEvents,
    automatic_tax_enabled: stripeAutomaticTaxEnabled,
    tax_status: stripeTaxSettings?.body?.status ?? null,
    active_tax_registration_count: stripeTaxRegistrations?.ok
      ? stripeActiveTaxRegistrations.length
      : null,
    tax_provider_ready: stripeTaxProviderReady,
    tax_ready: stripeTaxReady,
  },
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

const commercialEmailPostalAddressReady = present("WIRELINE_POSTAL_ADDRESS");
record(
  "commercial_email_postal_address",
  true,
  commercialEmailPostalAddressReady ? "ready" : "blocked",
  commercialEmailPostalAddressReady
    ? "Commercial email has a configured physical postal address."
    : "WIRELINE_POSTAL_ADDRESS is missing; commercial email must remain fail-closed.",
  commercialEmailPostalAddressReady
    ? "Keep the address current in Vercel and every commercial email footer."
    : "Provide the operator's valid current postal address before enabling lifecycle or marketing email.",
);

const liveVideoEmergencyDisabled = process.env.WIRELINE_LIVE_VIDEO_DISABLED === "true";
const liveVideoProviderConfigured = present("LIVEAVATAR_API_KEY");
const liveVideoPriceConfigured =
  present("STRIPE_LIVE_VIDEO_ADDON_PRICE_ID") || present("STRIPE_LIVE_VIDEO_MONTHLY_PRICE_ID");
const liveVideoReady =
  !liveVideoEmergencyDisabled && liveVideoProviderConfigured && liveVideoPriceConfigured;
record(
  "live_video",
  false,
  liveVideoReady ? "ready" : "degraded",
  liveVideoReady
    ? "Live Video provider and $19 add-on price are configured; runtime reserves up to 5 minutes per session against a 60-minute monthly cap."
    : liveVideoEmergencyDisabled
      ? "Live Video is intentionally disabled by the operator kill switch."
      : "Live Video is launch-active in code, but the optional provider or add-on price is not fully configured.",
  liveVideoReady
    ? "Maintain provider credits and alerts; no automatic overage is allowed."
    : liveVideoEmergencyDisabled
      ? "Remove WIRELINE_LIVE_VIDEO_DISABLED only after the incident or operator hold is cleared."
      : "Configure LIVEAVATAR_API_KEY and the canonical Live Video price before offering sessions.",
  {
    operator_disabled: liveVideoEmergencyDisabled,
    provider_configured: liveVideoProviderConfigured,
    addon_price_configured: liveVideoPriceConfigured,
    included_minutes_monthly: 60,
    session_reservation_minutes: 5,
    overage_policy: "none_pause_at_limit",
  },
);

const federalDncConfigured = isFederalDncVendorConfigured();
const federalDncKey = process.env.FEDERAL_DNC_API_KEY?.trim() || "";
const federalDncLooksLikeVercelToken =
  /^vcp_/i.test(federalDncKey) || /^vercel_/i.test(federalDncKey);
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
