import { log } from "./server-context";
import { isPostgresConnectionString } from "./database-connection";
import { isProductionDeployment } from "./deployment-environment";
import { BOTBOUND_PRODUCTION_ORIGIN } from "./brand";
import { configuredPhoneVoiceProvider } from "./voice/realtime-provider";
import {
  isSafeOpenAIRealtimeSessionReserve,
  OPENAI_REALTIME_PRICING_MODEL,
  OPENAI_REALTIME_SESSION_MINIMUM_RESERVE_USD,
} from "./voice/openai-realtime-pricing";

export type EnvGroup =
  | "core"
  | "ai"
  | "voice"
  | "oauth"
  | "billing"
  | "action_engine"
  | "infrastructure"
  | "security"
  | "operational";
export type EnvVarConfig = {
  name: string;
  group: EnvGroup;
  required: boolean;
  requiredInProd?: boolean;
  description: string;
  validate?: (value: string) => boolean;
  formatHint?: string;
};
export type EnvValidationResult = {
  valid: boolean;
  errors: Array<{
    var: string;
    group: EnvGroup;
    message: string;
    formatHint?: string;
  }>;
  warnings: Array<{ var: string; group: EnvGroup; message: string }>;
  byGroup: Record<EnvGroup, { valid: number; invalid: number; total: number }>;
};

const nonEmpty = (value: string) => value.length > 0;
const isUrl = (value: string) => /^https?:\/\//.test(value);
const isHttpsUrl = (value: string) => /^https:\/\//.test(value);
const isHex32 = (value: string) => /^[a-f0-9]{64}$/i.test(value);
const isStripe = (value: string) => /^(?:sk|rk)_(test|live)_/.test(value);
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isE164 = (value: string) => /^\+[1-9]\d{6,14}$/.test(value);
const isTwilioAccountSid = (value: string) => /^AC[a-fA-F0-9]{32}$/.test(value);
const isPositiveNumber = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;

const isCommaSeparatedEmails = (value: string) =>
  !value || value.split(",").every((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.trim()));

export const OAUTH_CREDENTIAL_PAIRS = [
  {
    provider: "Google",
    identifierEnv: "GOOGLE_CLIENT_ID",
    secretEnv: "GOOGLE_CLIENT_SECRET",
  },
  {
    provider: "Microsoft",
    identifierEnv: "MICROSOFT_CLIENT_ID",
    secretEnv: "MICROSOFT_CLIENT_SECRET",
  },
  {
    provider: "Yahoo",
    identifierEnv: "YAHOO_CLIENT_ID",
    secretEnv: "YAHOO_CLIENT_SECRET",
  },
  {
    provider: "Salesforce",
    identifierEnv: "SALESFORCE_CLIENT_ID",
    secretEnv: "SALESFORCE_CLIENT_SECRET",
  },
  {
    provider: "HubSpot",
    identifierEnv: "HUBSPOT_CLIENT_ID",
    secretEnv: "HUBSPOT_CLIENT_SECRET",
  },
  {
    provider: "Slack",
    identifierEnv: "SLACK_CLIENT_ID",
    secretEnv: "SLACK_CLIENT_SECRET",
  },
  {
    provider: "Apollo",
    identifierEnv: "APOLLO_CLIENT_ID",
    secretEnv: "APOLLO_CLIENT_SECRET",
  },
  {
    provider: "Meta",
    identifierEnv: "META_APP_ID",
    secretEnv: "META_APP_SECRET",
  },
  {
    provider: "Shopify",
    identifierEnv: "SHOPIFY_CLIENT_ID",
    secretEnv: "SHOPIFY_CLIENT_SECRET",
  },
  {
    provider: "Square",
    identifierEnv: "SQUARE_APPLICATION_ID",
    secretEnv: "SQUARE_APPLICATION_SECRET",
  },
  {
    provider: "X",
    identifierEnv: "X_CLIENT_ID",
    secretEnv: "X_CLIENT_SECRET",
  },
  {
    provider: "Zoom",
    identifierEnv: "ZOOM_CLIENT_ID",
    secretEnv: "ZOOM_CLIENT_SECRET",
  },
] as const;

export const ENV_REGISTRY: EnvVarConfig[] = [
  {
    name: "POSTGRES_URL",
    group: "core",
    required: true,
    description: "PostgreSQL connection string",
    validate: isPostgresConnectionString,
    formatHint: "postgresql://user:pass@host:port/db",
  },
  {
    name: "DATABASE_POOL_URL",
    group: "core",
    required: false,
    description: "PostgreSQL pooler/proxy URL (Supabase Transaction mode pooler on :6543)",
    validate: (value) => !value || isPostgresConnectionString(value),
    formatHint: "postgresql://user:pass@host:6543/db",
  },
  {
    name: "INTERNAL_JWT_SECRET",
    group: "core",
    required: true,
    description: "Session JWT signing secret",
    validate: isHex32,
    formatHint: "64-character hex string",
  },
  {
    name: "AI_GATEWAY_API_KEY",
    group: "ai",
    required: false,
    description: "Vercel AI Gateway key for governed fallback outside Vercel OIDC",
    validate: nonEmpty,
  },
  {
    name: "XAI_API_KEY",
    group: "ai",
    required: false,
    description:
      "Primary structured reasoning, instant voice samples, built-in live web search, and xAI phone calls",
    validate: nonEmpty,
  },
  {
    name: "XAI_MANAGEMENT_API_KEY",
    group: "ai",
    required: false,
    description: "xAI Management API key that builds each Bot's meaning-based knowledge index",
    validate: nonEmpty,
  },
  {
    name: "WIRELINE_PHONE_VOICE_PROVIDER",
    group: "voice",
    required: false,
    description:
      "Provider for new phone calls; unset (or xai) uses xAI voice, openai is the operator opt-out",
    validate: (value) => ["xai", "openai"].includes(value.trim().toLowerCase()),
    formatHint: "xai or openai",
  },
  {
    name: "OPENAI_API_KEY",
    group: "ai",
    required: false,
    requiredInProd: true,
    description: "Managed structured reasoning and OpenAI Realtime credential",
    validate: (value) => value.startsWith("sk-"),
    formatHint: "sk-...",
  },
  {
    name: "OPENAI_PROJECT_ID",
    group: "voice",
    required: false,
    requiredInProd: true,
    description: "OpenAI project that owns every BotBound Realtime SIP call",
    validate: (value) => /^proj_[A-Za-z0-9_-]{8,}$/.test(value.trim()),
    formatHint: "proj_...",
  },
  {
    name: "OPENAI_WEBHOOK_SECRET",
    group: "voice",
    required: false,
    requiredInProd: true,
    description: "Signing secret for OpenAI Realtime incoming-call webhooks",
    validate: nonEmpty,
  },
  {
    name: "OPENAI_API_KEY_CHATKIT",
    group: "ai",
    required: false,
    description: "Scoped OpenAI credential for ChatGPT app realtime voice spend isolation",
    validate: (value) => value.startsWith("sk-"),
    formatHint: "sk-...",
  },
  {
    name: "OPENAI_API_KEY_PREVIOUS",
    group: "ai",
    required: false,
    description: "Hangup-only drain slot for the previous runtime OpenAI key",
    validate: (value) => value.startsWith("sk-"),
    formatHint: "sk-...",
  },
  {
    name: "OPENAI_API_KEY_CHATKIT_PREVIOUS",
    group: "ai",
    required: false,
    description: "Hangup-only drain slot for the previous ChatGPT/demo OpenAI key",
    validate: (value) => value.startsWith("sk-"),
    formatHint: "sk-...",
  },
  {
    name: "OPENAI_REALTIME_MODEL",
    group: "ai",
    required: false,
    description: "Pinned OpenAI Realtime model covered by the admission-reserve contract",
    validate: (value) => value.trim() === OPENAI_REALTIME_PRICING_MODEL,
    formatHint: OPENAI_REALTIME_PRICING_MODEL,
  },
  {
    name: "WIRELINE_OPENAI_REALTIME_SESSION_RESERVE_USD",
    group: "ai",
    required: false,
    description: "Five-minute OpenAI Realtime admission reserve; unset uses the safe derived floor",
    validate: isSafeOpenAIRealtimeSessionReserve,
    formatHint: `USD amount >= ${OPENAI_REALTIME_SESSION_MINIMUM_RESERVE_USD.toFixed(2)}`,
  },
  {
    name: "BOTBOUND_ELEVENLABS_VOICE_ENABLED",
    group: "ai",
    required: false,
    description: "Platform-admin account-readiness check only; never enables cloned calls",
    validate: (value) => value === "true" || value === "false",
    formatHint: "true or false; leave false until an explicit operator check",
  },
  {
    name: "BOTBOUND_ELEVENLABS_VOICE_API_KEY",
    group: "ai",
    required: false,
    description: "Restricted, credit-capped ElevenLabs pilot key stored only in Render",
    validate: (value) => /^[!-~]{1,512}$/.test(value),
    formatHint: "Dedicated server-side provider key without whitespace",
  },
  {
    name: "BOTBOUND_ELEVENLABS_WORKSPACE_ID",
    group: "ai",
    required: false,
    description: "Expected ElevenLabs API-key workspace; no voice asset can be adopted by name",
    validate: (value) => /^[A-Za-z0-9_-]{1,128}$/.test(value),
    formatHint: "Documented ElevenLabs workspace identifier",
  },
  {
    name: "VOICE_CLONE_PILOT_ENABLED",
    group: "ai",
    required: false,
    description:
      "Private platform-admin-only voice reference previews; never enables phone cloning",
    validate: (value) => value === "true" || value === "false",
    formatHint: "true or false",
  },
  {
    name: "VOICE_ENGINE_URL",
    group: "ai",
    required: false,
    description: "Dedicated private speech worker origin; HTTPS only",
    validate: (value) => {
      try {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          url.pathname === "/"
        );
      } catch {
        return false;
      }
    },
    formatHint: "https://<private speech worker>",
  },
  {
    name: "VOICE_ENGINE_SERVICE_TOKEN",
    group: "ai",
    required: false,
    description: "Dedicated speech-worker bearer token; not an OpenAI or other vendor key",
    validate: (value) => /^[!-~]{32,512}$/.test(value),
    formatHint: "32-512 printable ASCII characters without spaces",
  },
  {
    name: "VOICE_ENGINE_COMPUTE_USD_PER_MINUTE",
    group: "ai",
    required: false,
    description: "Positive compute tariff for conservative private-preview allowance reservation",
    validate: (value) => Number.isFinite(Number(value)) && Number(value) > 0,
    formatHint: "positive USD amount per compute minute",
  },
  {
    name: "CLOUD_COMPUTER_BROWSER_WS_URL",
    group: "ai",
    required: false,
    description:
      "Isolated hosted-browser CDP endpoint for the OpenAI cloud computer; production requires wss://",
    validate: (value) => /^wss?:\/\//.test(value),
    formatHint: "wss://<hosted browser CDP endpoint>",
  },
  {
    name: "WIRELINE_STRUCTURED_PRIMARY_PROVIDER",
    group: "ai",
    required: false,
    description:
      "Operator override for the first structured reasoning lane. Unset keeps the managed xAI default; the remaining lanes stay as continuity",
    // Same acceptance as normalizeReasoningProvider, including the vendor
    // aliases operators actually type — a working config must not be flagged.
    validate: (value) =>
      ["xai", "openai", "gateway", "grok", "ai-gateway", "vercel"].includes(
        value.trim().toLowerCase(),
      ),
    formatHint: "xai, openai, or gateway (aliases: grok, ai-gateway, vercel)",
  },
  {
    name: "PERPLEXITY_API_KEY",
    group: "ai",
    required: false,
    description: "Perplexity-first live public research for BotBound agents",
    validate: nonEmpty,
  },
  {
    name: "PERPLEXITY_MODEL",
    group: "ai",
    required: false,
    description: "Optional Perplexity live-research model override",
    validate: nonEmpty,
  },
  {
    name: "LIVE_RESEARCH_TIMEOUT_MS",
    group: "ai",
    required: false,
    description: "HTTP timeout for mid-call public web research, not PSTN call length",
    validate: isPositiveNumber,
    formatHint: "milliseconds, e.g. 8000",
  },
  {
    name: "TWILIO_ACCOUNT_SID",
    group: "voice",
    required: false,
    requiredInProd: true,
    description: "Twilio programmable voice and messaging account SID",
    validate: isTwilioAccountSid,
    formatHint: "AC followed by 32 hexadecimal characters",
  },
  {
    name: "TWILIO_AUTH_TOKEN",
    group: "voice",
    required: false,
    requiredInProd: true,
    description: "Twilio API authentication and webhook signature verification",
    validate: nonEmpty,
  },
  {
    name: "TWILIO_API_KEY",
    group: "voice",
    required: false,
    description:
      "Preferred scoped Twilio REST API key; when set with TWILIO_API_SECRET, REST calls avoid the master auth token",
    validate: nonEmpty,
    formatHint: "SK followed by 32 hexadecimal characters",
  },
  {
    name: "TWILIO_API_SECRET",
    group: "voice",
    required: false,
    description: "Secret paired with TWILIO_API_KEY for scoped Twilio REST authentication",
    validate: nonEmpty,
  },
  {
    name: "GOOGLE_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "Google Workspace OAuth client ID",
    validate: nonEmpty,
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "Google Workspace OAuth client secret",
    validate: nonEmpty,
  },
  {
    name: "MICROSOFT_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "Microsoft 365 OAuth client ID",
    validate: nonEmpty,
  },
  {
    name: "MICROSOFT_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "Microsoft 365 OAuth client secret",
    validate: nonEmpty,
  },
  {
    name: "YAHOO_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "Yahoo account sign-in OAuth client ID",
    validate: nonEmpty,
  },
  {
    name: "YAHOO_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "Yahoo account sign-in OAuth client secret",
    validate: nonEmpty,
  },
  {
    name: "SALESFORCE_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "Salesforce connected-app OAuth consumer key",
    validate: nonEmpty,
  },
  {
    name: "SALESFORCE_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "Salesforce connected-app OAuth consumer secret",
    validate: nonEmpty,
  },
  {
    name: "HUBSPOT_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "HubSpot OAuth app client ID",
    validate: nonEmpty,
  },
  {
    name: "HUBSPOT_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "HubSpot OAuth app client secret",
    validate: nonEmpty,
  },
  {
    name: "SLACK_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "Slack OAuth app client ID",
    validate: nonEmpty,
  },
  {
    name: "SLACK_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "Slack OAuth app client secret",
    validate: nonEmpty,
  },
  {
    name: "APOLLO_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "Apollo per-tenant OAuth client ID",
    validate: nonEmpty,
  },
  {
    name: "APOLLO_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "Apollo per-tenant OAuth client secret",
    validate: nonEmpty,
  },
  {
    name: "META_APP_ID",
    group: "oauth",
    required: false,
    description: "Meta OAuth application ID",
    validate: nonEmpty,
  },
  {
    name: "META_APP_SECRET",
    group: "oauth",
    required: false,
    description: "Meta OAuth application secret",
    validate: nonEmpty,
  },
  {
    name: "SHOPIFY_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "Shopify OAuth app client ID",
    validate: nonEmpty,
  },
  {
    name: "SHOPIFY_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "Shopify OAuth app client secret",
    validate: nonEmpty,
  },
  {
    name: "SQUARE_APPLICATION_ID",
    group: "oauth",
    required: false,
    description: "Square OAuth application ID",
    validate: nonEmpty,
  },
  {
    name: "SQUARE_APPLICATION_SECRET",
    group: "oauth",
    required: false,
    description: "Square OAuth application secret",
    validate: nonEmpty,
  },
  {
    name: "X_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "X OAuth 2.0 client ID",
    validate: nonEmpty,
  },
  {
    name: "X_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "X OAuth 2.0 client secret",
    validate: nonEmpty,
  },
  {
    name: "ZOOM_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "Zoom OAuth app client ID",
    validate: nonEmpty,
  },
  {
    name: "ZOOM_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "Zoom OAuth app client secret",
    validate: nonEmpty,
  },
  {
    name: "APOLLO_API_KEY",
    group: "action_engine",
    required: false,
    description: "Apollo platform API-key fallback, separate from per-tenant OAuth",
    validate: nonEmpty,
  },
  {
    name: "STRIPE_SECRET_KEY",
    group: "billing",
    required: false,
    requiredInProd: true,
    description: "Stripe subscriptions, prepaid balances, billing, and portal",
    validate: (value) => !value || isStripe(value),
    formatHint: "sk_live_... or least-privilege rk_live_... for production",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    group: "billing",
    required: false,
    requiredInProd: true,
    description: "Stripe webhook signing secret",
    validate: nonEmpty,
  },
  {
    name: "STRIPE_AUTOMATIC_TAX_ENABLED",
    group: "billing",
    required: false,
    description: "Explicit opt-in for Stripe Automatic Tax after active registrations are verified",
    validate: (value) => !value || value === "true" || value === "false",
    formatHint: "true or false; keep false until Stripe has an active tax registration",
  },
  {
    name: "STRIPE_LIVE_VIDEO_ADDON_PRICE_ID",
    group: "billing",
    required: false,
    description: "Retired Live Video price ID retained only for legacy Stripe reconciliation",
  },
  {
    name: "STRIPE_LIVE_VIDEO_MONTHLY_PRICE_ID",
    group: "billing",
    required: false,
    description:
      "Legacy alias for STRIPE_LIVE_VIDEO_ADDON_PRICE_ID; never enables checkout or sessions",
  },
  {
    name: "UPSTASH_REDIS_REST_URL",
    group: "infrastructure",
    required: false,
    requiredInProd: true,
    description: "Distributed rate-limit URL",
    validate: (value) => !value || isUrl(value),
  },
  {
    name: "UPSTASH_REDIS_REST_TOKEN",
    group: "infrastructure",
    required: false,
    requiredInProd: true,
    description: "Distributed rate-limit token",
  },
  {
    name: "RESEND_API_KEY",
    group: "infrastructure",
    required: false,
    requiredInProd: true,
    description: "Transactional email for verification, billing, support, and lifecycle delivery",
    validate: nonEmpty,
  },
  {
    name: "SENTRY_DSN",
    group: "infrastructure",
    required: false,
    description: "Error tracking DSN",
  },
  {
    name: "OAUTH_STATE_SECRET",
    group: "security",
    required: false,
    requiredInProd: true,
    description: "OAuth state signing secret",
  },
  {
    name: "OAUTH_BRIDGE_SECRET",
    group: "security",
    required: false,
    description: "Dedicated signing secret for browser-bound OAuth sign-in completion codes",
    validate: nonEmpty,
  },
  {
    name: "WIRELINE_DATA_KEY",
    group: "security",
    required: false,
    description: "Secret-vault encryption key",
  },
  {
    name: "CRON_SECRET",
    group: "security",
    required: false,
    description: "Cron authentication token",
  },
  {
    name: "APP_URL",
    group: "operational",
    required: false,
    requiredInProd: true,
    description: "Canonical public deployment URL",
    validate: (value) => !value || value === BOTBOUND_PRODUCTION_ORIGIN,
    formatHint: "https://botbound.app (exactly; no path, port, credentials, or trailing slash)",
  },
  {
    name: "CORS_ORIGINS",
    group: "operational",
    required: false,
    description: "Comma-separated allowed origins",
  },
  {
    name: "WIRELINE_MISSED_CALL_VOICEMAIL_ENABLED",
    group: "operational",
    required: false,
    description:
      "Offers voicemail to callers the Bot cannot take; records audio, so enable only after reviewing recording consent",
    validate: (value) => value === "true" || value === "false",
    formatHint: "true or false",
  },
  {
    name: "WIRELINE_LAUNCH_DEMO_MODE",
    group: "operational",
    required: false,
    description: "Marks internal launch accounts and product telemetry as demo-only",
    validate: (value) => value === "true" || value === "false",
    formatHint: "true or false",
  },
  {
    name: "OWNER_EMAIL",
    group: "operational",
    required: false,
    description: "Platform owner email",
    validate: (value) => !value || isEmail(value),
  },
  {
    name: "OWNER_EMAILS",
    group: "operational",
    required: false,
    description: "Comma-separated additional platform owner emails",
    validate: (value) => !value || isCommaSeparatedEmails(value),
  },
  {
    name: "FEDERAL_DNC_API_URL",
    group: "operational",
    required: false,
    requiredInProd: false,
    description:
      "Federal DNC vendor lookup endpoint (deferred checklist). Marketing outbound fails closed until configured.",
    validate: (value) => !value || isHttpsUrl(value),
    formatHint: "https://www.dncscrub.com/app/main/rpc/scrub",
  },
  {
    name: "FEDERAL_DNC_PROVIDER",
    group: "operational",
    required: false,
    description: "Federal DNC vendor id (e.g. dncscrub for Contact Center Compliance)",
  },
  {
    name: "FEDERAL_DNC_API_KEY",
    group: "operational",
    required: false,
    requiredInProd: false,
    description:
      "Federal DNC vendor loginId (DNCScrub). Deferred until business registration; misplaced Vercel tokens are rejected at runtime by isFederalDncVendorConfigured.",
    validate: nonEmpty,
  },
  {
    name: "OWNER_PHONE",
    group: "operational",
    required: false,
    description: "Platform owner escalation phone",
    validate: (value) => !value || isE164(value),
  },
  {
    name: "VERCEL_OIDC_TOKEN",
    group: "ai",
    required: false,
    description: "Vercel OIDC token for AI Gateway access in production",
    validate: nonEmpty,
  },
];

export function validateEnv(): EnvValidationResult {
  const groups: EnvGroup[] = [
    "core",
    "ai",
    "voice",
    "oauth",
    "billing",
    "action_engine",
    "infrastructure",
    "security",
    "operational",
  ];
  const byGroup = Object.fromEntries(
    groups.map((group) => [group, { valid: 0, invalid: 0, total: 0 }]),
  ) as EnvValidationResult["byGroup"];
  const result: EnvValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    byGroup,
  };
  const isProd = isProductionDeployment();

  for (const config of ENV_REGISTRY) {
    const value = process.env[config.name];
    const required = config.required || (isProd && config.requiredInProd);
    const group = byGroup[config.group];
    group.total++;
    if (required && !value) {
      result.valid = false;
      group.invalid++;
      result.errors.push({
        var: config.name,
        group: config.group,
        message: `Required environment variable ${config.name} is missing`,
        formatHint: config.formatHint,
      });
    } else if (value && config.validate && !config.validate(value)) {
      const message = `Environment variable ${config.name} has invalid format`;
      if (required || isProd) {
        result.valid = false;
        group.invalid++;
        result.errors.push({
          var: config.name,
          group: config.group,
          message,
          formatHint: config.formatHint,
        });
      } else {
        result.warnings.push({
          var: config.name,
          group: config.group,
          message,
        });
        group.valid++;
      }
    } else {
      group.valid++;
    }
  }

  for (const { provider, identifierEnv, secretEnv } of OAUTH_CREDENTIAL_PAIRS) {
    const identifierConfigured = Boolean(process.env[identifierEnv]?.trim());
    const secretConfigured = Boolean(process.env[secretEnv]?.trim());
    if (identifierConfigured === secretConfigured) continue;

    const missingEnv = identifierConfigured ? secretEnv : identifierEnv;
    const message = `${provider} OAuth credentials are incomplete; configure ${identifierEnv} and ${secretEnv} together`;
    if (isProd) {
      result.valid = false;
      byGroup.oauth.valid--;
      byGroup.oauth.invalid++;
      result.errors.push({ var: missingEnv, group: "oauth", message });
    } else {
      result.warnings.push({ var: missingEnv, group: "oauth", message });
    }
  }

  // These credentials belong to fully retired runtime paths. Treat their
  // presence as a deployment error so stale Vercel variables cannot silently
  // reactivate or imply support for a removed provider.
  const retiredVoiceEnv = [
    "ELEVENLABS_API_KEY",
    "VITE_VAPI_PUBLIC_KEY",
    "VAPI_PRIVATE_KEY",
    "VAPI_WEBHOOK_SECRET",
    "VAPI_WEBHOOK_CREDENTIAL_ID",
    "XAI_API_KEY_CHATKIT",
    "XAI_SIP_ALLOWED_ADDRESSES",
    "WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK",
  ] as const;
  for (const variable of retiredVoiceEnv) {
    if (!process.env[variable]?.trim()) continue;
    result.valid = false;
    byGroup.voice.total++;
    byGroup.voice.invalid++;
    result.errors.push({
      var: variable,
      group: "voice",
      message:
        "Retired provider configuration must be removed; BotBound voice uses OpenAI Realtime or xAI Grok Voice with Twilio transport",
    });
  }

  // xAI voice carries phone calls by default. An explicit "xai" without its key
  // is a broken deploy; the unset default only warns, because every call still
  // answers on the OpenAI fallback while the key is missing.
  byGroup.voice.total++;
  const phoneProviderExplicit = String(process.env.WIRELINE_PHONE_VOICE_PROVIDER || "")
    .trim()
    .toLowerCase();
  if (configuredPhoneVoiceProvider() === "xai" && !process.env.XAI_API_KEY?.trim()) {
    if (phoneProviderExplicit === "xai") {
      result.valid = false;
      byGroup.voice.invalid++;
      result.errors.push({
        var: "XAI_API_KEY",
        group: "voice",
        message: "WIRELINE_PHONE_VOICE_PROVIDER=xai requires XAI_API_KEY for xAI Grok Voice calls",
      });
    } else {
      byGroup.voice.valid++;
      if (isProd) {
        result.warnings.push({
          var: "XAI_API_KEY",
          group: "voice",
          message:
            "Phone calls default to xAI voice but XAI_API_KEY is unset, so every call answers on the OpenAI fallback",
        });
      }
    }
  } else {
    byGroup.voice.valid++;
  }

  // Both lanes still answer without the xAI keys, so these are warnings: the
  // product keeps working, but on the backup provider or without the index,
  // and nobody notices from inside the product.
  if (isProd && !process.env.XAI_API_KEY?.trim()) {
    result.warnings.push({
      var: "XAI_API_KEY",
      group: "ai",
      message:
        "Structured reasoning is running on the OpenAI backup lane and voice samples are unavailable; set XAI_API_KEY for the managed primary",
    });
  } else if (isProd && !process.env.XAI_MANAGEMENT_API_KEY?.trim()) {
    result.warnings.push({
      var: "XAI_MANAGEMENT_API_KEY",
      group: "ai",
      message:
        "Meaning-based knowledge search is inactive; set XAI_MANAGEMENT_API_KEY so each Bot's knowledge index can build",
    });
  }

  const managedRuntime = process.env.OPENAI_API_KEY?.trim();
  if (!managedRuntime) {
    result.valid = false;
    byGroup.ai.invalid++;
    result.errors.push({
      var: "OPENAI_API_KEY",
      group: "ai",
      message: "Configure the OpenAI managed runtime before serving AI or voice requests",
    });
  }
  return result;
}

export const getEnvByGroup = (group: EnvGroup) =>
  ENV_REGISTRY.filter((entry) => entry.group === group);

export function logEnvValidation(verbose = false) {
  const result = validateEnv();
  if (result.valid) log.info("Environment validation passed", { groups: result.byGroup });
  else
    log.warn("Environment validation has missing or invalid settings", {
      errors: result.errors.map((error) => error.var),
      ...(verbose ? { byGroup: result.byGroup } : {}),
    });
  return result;
}

export function generateSetupChecklist(): string[] {
  const result = validateEnv();
  return [
    "# BotBound Environment Setup Checklist",
    "",
    ...result.errors.map(
      (error) =>
        `- ${error.var}: ${error.message}${error.formatHint ? ` (${error.formatHint})` : ""}`,
    ),
  ];
}
