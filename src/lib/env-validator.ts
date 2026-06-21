import { log } from "./server-context";

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
const isPostgresUrl = (value: string) => /^postgresql:\/\//.test(value);
const isHex32 = (value: string) => /^[a-f0-9]{64}$/i.test(value);
const isStripe = (value: string) => /^sk_(test|live)_/.test(value);
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isE164 = (value: string) => /^\+[1-9]\d{6,14}$/.test(value);

export const ENV_REGISTRY: EnvVarConfig[] = [
  {
    name: "POSTGRES_URL",
    group: "core",
    required: true,
    description: "PostgreSQL connection string",
    validate: isPostgresUrl,
    formatHint: "postgresql://user:pass@host:port/db",
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
    name: "OPENAI_API_KEY",
    group: "ai",
    required: true,
    description: "OpenAI key for managed AI runtime",
    validate: (value) => value.startsWith("sk-"),
    formatHint: "sk-...",
  },
  {
    name: "GEMINI_API_KEY",
    group: "ai",
    required: false,
    description: "Gemini native automatic fallback and grounded search",
    validate: nonEmpty,
  },
  {
    name: "OPENROUTER_API_KEY",
    group: "ai",
    required: false,
    description: "Explicit agent-selected OpenRouter model access",
    validate: nonEmpty,
  },
  {
    name: "VAPI_PRIVATE_KEY",
    group: "voice",
    required: true,
    description: "Vapi private key for phone handling",
    validate: nonEmpty,
  },
  {
    name: "VAPI_WEBHOOK_SECRET",
    group: "voice",
    required: true,
    description: "Vapi webhook signature secret",
    validate: nonEmpty,
  },
  {
    name: "ELEVENLABS_API_KEY",
    group: "voice",
    required: false,
    description: "ElevenLabs agent voice and pronunciation configuration",
    validate: nonEmpty,
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
    description: "Secret vault encryption key",
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
    name: "OWNER_EMAIL",
    group: "operational",
    required: false,
    description: "Platform owner email",
    validate: (value) => !value || isEmail(value),
  },
  {
    name: "OWNER_PHONE",
    group: "operational",
    required: false,
    description: "Platform owner escalation phone",
    validate: (value) => !value || isE164(value),
  },
];

export function validateEnv(): EnvValidationResult {
  const groupNames: EnvGroup[] = [
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
    groupNames.map((group) => [group, { valid: 0, invalid: 0, total: 0 }]),
  ) as EnvValidationResult["byGroup"];
  const result: EnvValidationResult = { valid: true, errors: [], warnings: [], byGroup };
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  for (const config of ENV_REGISTRY) {
    const value = process.env[config.name];
    const hasValue = !!value;
    const group = byGroup[config.group];
    group.total++;
    const required = config.required || (isProd && config.requiredInProd);
    if (required && !hasValue) {
      result.valid = false;
      group.invalid++;
      result.errors.push({
        var: config.name,
        group: config.group,
        message: `Required environment variable ${config.name} is missing`,
        formatHint: config.formatHint,
      });
      continue;
    }
    if (hasValue && config.validate && !config.validate(value)) {
      if (required || isProd) {
        result.valid = false;
        group.invalid++;
        result.errors.push({
          var: config.name,
          group: config.group,
          message: `Environment variable ${config.name} has invalid format`,
          formatHint: config.formatHint,
        });
        continue;
      }
      result.warnings.push({
        var: config.name,
        group: config.group,
        message: `Environment variable ${config.name} has an unexpected format`,
      });
    }
    group.valid++;
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
