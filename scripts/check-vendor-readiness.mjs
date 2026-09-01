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
import {
  STRIPE_PUBLIC_BRAND,
  STRIPE_PUBLIC_SUPPORT_EMAIL,
  STRIPE_PUBLIC_SUPPORT_URL,
  hasBotBoundDescriptor,
} from "./lib/stripe-account-identity.mjs";
import {
  agentMailDomainIdFromList,
  evaluateAgentMailReadiness,
} from "./lib/agentmail-readiness.mjs";
import { CANONICAL_PRODUCTION_URL } from "./lib/production-url.mjs";

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
const agentmailCredential = process.env.AGENTMAIL_API_KEY?.trim() || "";
const agentmailHeaders = agentmailCredential
  ? { Authorization: `Bearer ${agentmailCredential}` }
  : null;

const [
  openai,
  gemini,
  gateway,
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
  agentmailInboxes,
  agentmailApiKeys,
  agentmailDomains,
  resend,
] = await Promise.all([
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
  agentmailHeaders
    ? readJson("https://api.agentmail.to/v0/inboxes?limit=1", { headers: agentmailHeaders })
    : null,
  agentmailHeaders
    ? readJson("https://api.agentmail.to/v0/api-keys?limit=100", { headers: agentmailHeaders })
    : null,
  agentmailHeaders
    ? readJson("https://api.agentmail.to/v0/domains?limit=100", { headers: agentmailHeaders })
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
const openaiTranscriberReady = openai?.ok && openaiModelIds.has("gpt-4o-mini-transcribe");
const openaiSipConfigured = present("OPENAI_PROJECT_ID") && present("OPENAI_WEBHOOK_SECRET");
const openaiRuntimeReady =
  openaiStructuredModelReady &&
  openaiRealtimeModelReady &&
  openaiTranscriberReady &&
  openaiSipConfigured;

record(
  "openai",
  true,
  openaiRuntimeReady ? "ready" : "blocked",
  openaiRuntimeReady
    ? "OpenAI key accepted and the required structured, realtime, and transcription models are available."
    : openai?.ok
      ? "OpenAI key accepted, but a required model or the Realtime SIP project/webhook configuration is unavailable."
      : "OpenAI key missing or rejected.",
  "Keep a payment method, project budget, and usage alerts enabled.",
  {
    structured_model: "gpt-5.6-terra",
    structured_model_available: openaiStructuredModelReady,
    realtime_model: "gpt-realtime-2.1",
    realtime_model_available: openaiRealtimeModelReady,
    transcriber_model: "gpt-4o-mini-transcribe",
    transcriber_model_available: openaiTranscriberReady,
    sip_project_configured: present("OPENAI_PROJECT_ID"),
    signed_webhook_configured: present("OPENAI_WEBHOOK_SECRET"),
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

const twilioAccountReady = Boolean(twilioAccount?.ok && twilioAccount.body?.status === "active");
const twilioIncomingNumbers = arrayAt(twilioNumbers?.body, "incoming_phone_numbers");
const voiceCapableNumbers = twilioIncomingNumbers.filter(
  (number) => number?.capabilities?.voice === true,
);
const smsCapableNumbers = twilioIncomingNumbers.filter(
  (number) => number?.capabilities?.sms === true,
);
const openAIInboundNumbers = voiceCapableNumbers.filter(
  (number) =>
    typeof number?.voice_url === "string" &&
    number.voice_url.includes("/api/twilio-webhook/openai-inbound"),
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
  // A zero balance is readable but cannot fund a customer call or message.
  // Require positive runway; autorecharge and Usage Triggers remain owner
  // launch checks because the balance endpoint cannot prove either control.
  twilioBalance?.ok && Number.isFinite(twilioBalanceUsd) && twilioBalanceUsd > 0,
);
const twilioVoiceSmsReady = Boolean(
  twilioAccountReady &&
  twilioFunded &&
  voiceCapableNumbers.length > 0 &&
  openAIInboundNumbers.length === voiceCapableNumbers.length &&
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
      }; ${voiceCapableNumbers.length} voice-capable number(s), ${openAIInboundNumbers.length} routed to OpenAI Realtime, ${smsCapableNumbers.length} SMS-capable number(s), and ${twilioServices.length} Messaging Service(s).`
    : `Twilio credentials missing or rejected${twilioAccount ? ` (HTTP ${twilioAccount.status})` : ""}.`,
  twilioVoiceSmsReady
    ? "Keep the paid account and payment method current; configure Usage Triggers and sender webhooks."
    : twilioAccountReady && !twilioFunded
      ? "Restore a positive Twilio balance and successful recharge posture before launch."
      : "Restore valid credentials, route every voice number to the signed OpenAI inbound webhook, and provision an SMS sender or Messaging Service.",
  {
    balance_usd: twilioBalance?.ok && Number.isFinite(twilioBalanceUsd) ? twilioBalanceUsd : null,
    balance_positive: twilioFunded,
    incoming_number_count: twilioIncomingNumbers.length,
    voice_capable_number_count: voiceCapableNumbers.length,
    openai_inbound_number_count: openAIInboundNumbers.length,
    sms_capable_number_count: smsCapableNumbers.length,
    messaging_service_count: twilioServices.length,
  },
);
const wirelineDirectSmsNumbers = smsCapableNumbers.filter(
  (number) =>
    typeof number?.sms_url === "string" && number.sms_url.includes("/api/twilio-webhook/sms"),
);
const wirelineSmsRetryReady =
  wirelineDirectSmsNumbers.length > 0 &&
  wirelineDirectSmsNumbers.every((number) => hasWirelineSmsRetryPolicy(number.sms_url));
record(
  "twilio_sms_webhook_retries",
  true,
  wirelineSmsRetryReady ? "ready" : "blocked",
  `${wirelineDirectSmsNumbers.filter((number) => hasWirelineSmsRetryPolicy(number.sms_url)).length}/${wirelineDirectSmsNumbers.length} direct BotBound SMS number(s) explicitly retry transient 5xx webhook failures.`,
  wirelineSmsRetryReady
    ? null
    : "Update every BotBound IncomingPhoneNumber SmsUrl to include #rc=2&rp=5xx,ct,rt&ct=3000&rt=5000&tt=15000 before paid launch.",
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
const stripeSupportUrl = String(stripeAccount?.body?.business_profile?.support_url || "")
  .trim()
  .replace(/\/+$/, "");
const stripeSupportEmail = String(stripeAccount?.body?.business_profile?.support_email || "")
  .trim()
  .toLowerCase();
const stripeBrandReady = Boolean(
  stripePublicName === STRIPE_PUBLIC_BRAND &&
  hasBotBoundDescriptor(stripeStatementDescriptor) &&
  stripeWebsiteOrigin === CANONICAL_PRODUCTION_URL &&
  stripeSupportOrigin === CANONICAL_PRODUCTION_URL &&
  stripeSupportUrl === STRIPE_PUBLIC_SUPPORT_URL &&
  stripeSupportEmail === STRIPE_PUBLIC_SUPPORT_EMAIL,
);

const stripePortalConfigs = arrayAt(stripePortalConfigurations?.body, "data");
// Pick a configuration that actually carries the customer controls, preferring
// the BotBound-managed one. Matching on active+default first and only then
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
      `${CANONICAL_PRODUCTION_URL}/api/stripe-webhook`,
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
      ? "Align the public business name, statement descriptor, website, support URL, logo, and colors to BotBound in Stripe."
      : !stripePortalReady
        ? "Exercise BotBound portal bootstrap (or create a Dashboard default) and verify payment methods, invoices, and cancellation."
        : !stripeWebhookReady
          ? `Align the enabled botbound.me webhook endpoint to the ${expectedStripeWebhookEvents.length} server-handled events (npm run stripe:webhook:align).`
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
    statement_descriptor_ready: hasBotBoundDescriptor(stripeStatementDescriptor),
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

const agentmailDomainId = agentMailDomainIdFromList(
  agentmailDomains,
  process.env.AGENTMAIL_DEFAULT_DOMAIN,
);
const agentmailDomainDetail =
  agentmailHeaders && agentmailDomainId
    ? await readJson(
        `https://api.agentmail.to/v0/domains/${encodeURIComponent(agentmailDomainId)}`,
        { headers: agentmailHeaders },
      )
    : null;
const agentmailReadiness = evaluateAgentMailReadiness({
  apiKey: agentmailCredential,
  configuredDomain: process.env.AGENTMAIL_DEFAULT_DOMAIN,
  inboxesResponse: agentmailInboxes,
  apiKeysResponse: agentmailApiKeys,
  domainsResponse: agentmailDomains,
  domainDetailResponse: agentmailDomainDetail,
});
record(
  "agentmail",
  true,
  agentmailReadiness.ready ? "ready" : "blocked",
  agentmailReadiness.ready
    ? `AgentMail key accepted with managed-mail permissions and verified domain ${agentmailReadiness.configuredDomain}.`
    : !agentmailReadiness.configuredDomain
      ? "AGENTMAIL_DEFAULT_DOMAIN is missing or invalid."
      : !agentmailReadiness.credentialsAccepted
        ? "AgentMail key missing, rejected, or inbox inventory response was malformed."
        : !agentmailReadiness.activeKeyIdentified || !agentmailReadiness.organizationScoped
          ? "AgentMail could not identify an organization-scoped active API key."
          : agentmailReadiness.missingPermissions.length > 0
            ? `AgentMail key is missing required managed-mail permissions: ${agentmailReadiness.missingPermissions.join(", ")}.`
            : !agentmailReadiness.domainVerified
              ? `AgentMail domain ${agentmailReadiness.configuredDomain} is missing, unverified, or returned an invalid inventory response.`
              : "AgentMail readiness could not be verified.",
  "Maintain an organization-scoped AgentMail key and verified managed custom domain; this probe uses read-only GET requests only.",
  {
    configured_domain: agentmailReadiness.configuredDomain,
    credential_accepted: agentmailReadiness.credentialsAccepted,
    inbox_inventory_readable: agentmailReadiness.inboxInventoryReadable,
    key_inventory_readable: agentmailReadiness.keyInventoryReadable,
    active_key_identified: agentmailReadiness.activeKeyIdentified,
    organization_scoped: agentmailReadiness.organizationScoped,
    missing_permissions: agentmailReadiness.missingPermissions,
    domain_inventory_readable: agentmailReadiness.domainInventoryReadable,
    domain_listed: agentmailReadiness.domainListed,
    domain_verified: agentmailReadiness.domainVerified,
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

const liveVideoRetired = true;
record(
  "live_video",
  false,
  "ready",
  "Live talking-head video is retired. Identity badges remain; phone, email, and text stay on the agent.",
  "Do not offer LiveAvatar or HeyGen sessions. Keep leftover Stripe Live Video webhooks fail-closed.",
  {
    retired: liveVideoRetired,
    companion_video: "not_offered",
    overage_policy: "none_retired",
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
