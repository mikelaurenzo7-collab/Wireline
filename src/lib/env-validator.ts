import { log } from "./server-context";
import { isPostgresConnectionString } from "./database-connection";
import { isProductionDeployment } from "./deployment-environment";

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
const isStripe = (value: string) => /^sk_(test|live)_/.test(value);
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isE164 = (value: string) => /^\+[1-9]\d{6,14}$/.test(value);
const isTwilioAccountSid = (value: string) => /^AC[a-fA-F0-9]{32}$/.test(value);
const isPositiveNumber = (value: string) => Number.isFinite(Number(value)) && Number(value) > 0;

const isCommaSeparatedEmails = (value: string) =>
  !value || value.split(",").every((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry.trim()));

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
    name: "OPENAI_API_KEY",
    group: "ai",
    required: false,
    requiredInProd: true,
    description: "Primary managed reasoning and OpenAI Realtime credential",
    validate: (value) => value.startsWith("sk-"),
    formatHint: "sk-...",
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
    name: "GEMINI_API_KEY",
    group: "ai",
    required: false,
    description: "Gemini continuity fallback and grounded search",
    validate: nonEmpty,
  },
  {
    name: "XAI_API_KEY",
    group: "ai",
    required: false,
    description:
      "xAI credential. Activates the Grok structured continuity lane and Wireline Preview voice rendering; OpenAI stays the managed default",
    validate: nonEmpty,
  },
  {
    name: "XAI_API_KEY_CHATKIT",
    group: "ai",
    required: false,
    description: "Optional scoped xAI credential for isolated experiments",
    validate: nonEmpty,
  },
  {
    name: "WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK",
    group: "ai",
    required: false,
    description:
      "Operator opt-out for the xAI structured lane. Unset means the lane is active whenever XAI_API_KEY is configured; set false to disable it",
    validate: (value) => value === "true" || value === "false",
    formatHint: "true or false",
  },
  {
    name: "WIRELINE_STRUCTURED_PRIMARY_PROVIDER",
    group: "ai",
    required: false,
    description:
      "Operator override for the first structured reasoning lane. Unset keeps the managed OpenAI default; the remaining lanes stay as continuity",
    validate: (value) =>
      ["openai", "gemini", "gateway", "xai"].includes(value.trim().toLowerCase()),
    formatHint: "openai, gemini, gateway, or xai",
  },
  {
    name: "PERPLEXITY_API_KEY",
    group: "ai",
    required: false,
    description: "Perplexity-first live public research for Wireline CEO agents",
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
    description:
      "HTTP timeout for mid-call public web research (Perplexity/Gemini) — not PSTN call length",
    validate: isPositiveNumber,
    formatHint: "milliseconds, e.g. 8000",
  },
  {
    name: "VAPI_PRIVATE_KEY",
    group: "voice",
    required: false,
    requiredInProd: true,
    description: "Managed Vapi PSTN orchestration and phone handling",
    validate: nonEmpty,
  },
  {
    name: "VAPI_WEBHOOK_SECRET",
    group: "voice",
    required: false,
    requiredInProd: true,
    description: "Vapi webhook verification",
    validate: nonEmpty,
  },
  {
    name: "VAPI_WEBHOOK_CREDENTIAL_ID",
    group: "voice",
    required: false,
    description:
      "Preferred Vapi Custom Credential ID for authenticated webhook delivery; falls back to the shared secret during migration",
    validate: nonEmpty,
  },
  {
    name: "VITE_VAPI_PUBLIC_KEY",
    group: "voice",
    required: false,
    description: "Vapi browser test-call public key",
    validate: nonEmpty,
  },
  {
    name: "ELEVENLABS_API_KEY",
    group: "voice",
    required: false,
    requiredInProd: true,
    description: "Server-only managed studio speech and authorized private voice cloning",
    validate: nonEmpty,
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
    name: "LIVEAVATAR_API_KEY",
    group: "voice",
    required: false,
    description: "LiveAvatar (HeyGen) photoreal video presenter",
    validate: nonEmpty,
  },
  {
    name: "HEYGEN_API_KEY",
    group: "voice",
    required: false,
    description: "HeyGen Studio API credential for optional presenter voice previews",
    validate: nonEmpty,
  },
  {
    name: "LIVEAVATAR_DEFAULT_AVATAR_ID",
    group: "voice",
    required: false,
    description:
      "Ops-only bootstrap UUID for live video add-on previews (not required for core agents)",
    validate: nonEmpty,
  },
  {
    name: "LIVEAVATAR_SANDBOX",
    group: "voice",
    required: false,
    description: "Force sandbox LiveAvatar sessions (true/false)",
  },
  {
    name: "GOOGLE_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "Google Workspace OAuth client ID",
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "Google Workspace OAuth client secret",
  },
  {
    name: "MICROSOFT_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "Microsoft 365 OAuth client ID",
  },
  {
    name: "MICROSOFT_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "Microsoft 365 OAuth client secret",
  },
  {
    name: "STRIPE_SECRET_KEY",
    group: "billing",
    required: false,
    requiredInProd: true,
    description: "Stripe subscriptions, prepaid balances, billing, and portal",
    validate: (value) => !value || isStripe(value),
    formatHint: "sk_live_... for production",
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
    description: "Stripe price ID for photoreal live video add-on ($19/mo)",
  },
  {
    name: "STRIPE_LIVE_VIDEO_MONTHLY_PRICE_ID",
    group: "billing",
    required: false,
    description: "SKU-shaped alias for STRIPE_LIVE_VIDEO_ADDON_PRICE_ID; either is honored",
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
    description: "Canonical public deployment URL",
    validate: (value) => !value || isUrl(value),
  },
  {
    name: "CORS_ORIGINS",
    group: "operational",
    required: false,
    description: "Comma-separated allowed origins",
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

  const gateway =
    process.env.AI_GATEWAY_API_KEY?.trim() || (isProd && process.env.VERCEL_OIDC_TOKEN?.trim());
  const managedRuntime = process.env.OPENAI_API_KEY?.trim() || gateway;
  if (!managedRuntime) {
    result.valid = false;
    byGroup.ai.invalid++;
    result.errors.push({
      var: "OPENAI_API_KEY / AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN",
      group: "ai",
      message:
        "Configure the OpenAI managed runtime or Vercel AI Gateway before serving AI requests",
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
    "# Wireline Environment Setup Checklist",
    "",
    ...result.errors.map(
      (error) =>
        `- ${error.var}: ${error.message}${error.formatHint ? ` (${error.formatHint})` : ""}`,
    ),
  ];
}
