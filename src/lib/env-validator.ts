import { log } from "./server-context";
import { isPostgresConnectionString } from "./database-connection";

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
  errors: Array<{ var: string; group: EnvGroup; message: string; formatHint?: string }>;
  warnings: Array<{ var: string; group: EnvGroup; message: string }>;
  byGroup: Record<EnvGroup, { valid: number; invalid: number; total: number }>;
};

const nonEmpty = (value: string) => value.length > 0;
const isUrl = (value: string) => /^https?:\/\//.test(value);
const isHex32 = (value: string) => /^[a-f0-9]{64}$/i.test(value);
const isStripe = (value: string) => /^sk_(test|live)_/.test(value);
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isE164 = (value: string) => /^\+[1-9]\d{6,14}$/.test(value);
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
    description: "AI Gateway key for local and non-Vercel execution",
    validate: nonEmpty,
  },
  {
    name: "XAI_API_KEY",
    group: "ai",
    required: false,
    requiredInProd: true,
    description: "Primary managed Grok runtime and realtime voice credential",
    validate: nonEmpty,
  },
  {
    name: "XAI_API_KEY_CHATKIT",
    group: "ai",
    required: false,
    description: "Scoped xAI credential for ChatGPT app realtime voice spend isolation",
    validate: nonEmpty,
  },
  {
    name: "OPENAI_API_KEY",
    group: "ai",
    required: false,
    description: "Direct OpenAI continuity fallback",
    validate: (value) => value.startsWith("sk-"),
    formatHint: "sk-...",
  },
  {
    name: "GEMINI_API_KEY",
    group: "ai",
    required: false,
    description: "Gemini fallback and grounded search",
    validate: nonEmpty,
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
    description: "Timeout budget for live public research calls",
    validate: isPositiveNumber,
    formatHint: "milliseconds, e.g. 8000",
  },
  {
    name: "VAPI_PRIVATE_KEY",
    group: "voice",
    required: false,
    description: "Independent Vapi phone-handling capability",
    validate: nonEmpty,
  },
  {
    name: "VAPI_WEBHOOK_SECRET",
    group: "voice",
    required: false,
    description: "Independent Vapi webhook verification",
    validate: nonEmpty,
  },
  {
    name: "ELEVENLABS_API_KEY",
    group: "voice",
    required: false,
    description: "Independent voice configuration",
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
    description: "Stripe billing key",
    validate: (value) => !value || isStripe(value),
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    group: "billing",
    required: false,
    description: "Stripe signing secret",
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
    name: "SENTRY_DSN",
    group: "infrastructure",
    required: false,
    description: "Error tracking DSN",
  },
  {
    name: "OAUTH_STATE_SECRET",
    group: "security",
    required: false,
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
    description: "Federal DNC vendor lookup endpoint (outbound scrub)",
    validate: (value) => !value || isUrl(value),
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
    description: "Federal DNC vendor API key",
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
  const result: EnvValidationResult = { valid: true, errors: [], warnings: [], byGroup };
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

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
        result.warnings.push({ var: config.name, group: config.group, message });
        group.valid++;
      }
    } else {
      group.valid++;
    }
  }

  const gateway =
    process.env.AI_GATEWAY_API_KEY?.trim() || (isProd && process.env.VERCEL_OIDC_TOKEN?.trim());
  const fallback = process.env.OPENAI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  if (!gateway && !fallback) {
    result.valid = false;
    byGroup.ai.invalid++;
    result.errors.push({
      var: "AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN",
      group: "ai",
      message: "Configure AI Gateway or a direct model fallback before serving AI requests",
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
