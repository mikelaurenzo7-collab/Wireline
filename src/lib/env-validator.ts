/**
 * Environment Variable Validator
 * ---------------------------------------------------------------------------
 * Centralized validation for all environment variables with grouped
 * validation, helpful error messages, and health check integration.
 *
 * This reduces the 40+ env var complexity by providing clear grouping,
 * validation rules, and actionable error messages for missing configuration.
 */

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
  warnings: Array<{
    var: string;
    group: EnvGroup;
    message: string;
  }>;
  byGroup: Record<EnvGroup, { valid: number; invalid: number; total: number }>;
};

// Validation helpers
const isNonEmpty = (v: string) => v.length > 0;
const isUrl = (v: string) => /^https?:\/\//.test(v);
const isPostgresUrl = (v: string) => /^postgresql:\/\//.test(v);
const isStripeKey = (v: string) => /^sk_(test|live)_/.test(v);
const isHex32 = (v: string) => /^[a-f0-9]{64}$/i.test(v);
const isBase64Key = (v: string) => v.length >= 32;

/**
 * Canonical environment variable registry
 * Ordered by group and priority
 */
export const ENV_REGISTRY: EnvVarConfig[] = [
  // CORE - Required for basic operation
  {
    name: "POSTGRES_URL",
    group: "core",
    required: true,
    description: "PostgreSQL connection string for database",
    validate: isPostgresUrl,
    formatHint: "postgresql://user:pass@host:port/db",
  },
  {
    name: "INTERNAL_JWT_SECRET",
    group: "core",
    required: true,
    description: "HMAC secret for session JWT signing",
    validate: isHex32,
    formatHint:
      "64-character hex string (generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")",
  },

  // AI - Required for Claude and Gemini
  {
    name: "ANTHROPIC_API_KEY",
    group: "ai",
    required: true,
    description: "Anthropic API key for Claude reasoning layer",
    validate: (v) => v.startsWith("sk-ant-"),
    formatHint: "sk-ant-api03-...",
  },
  {
    name: "GEMINI_API_KEY",
    group: "ai",
    required: true,
    description: "Google Gemini API key for voice runtime",
    validate: isNonEmpty,
    formatHint: "Get from https://aistudio.google.com/app/apikey",
  },

  // VOICE - Required for Vapi integration
  {
    name: "VAPI_PRIVATE_KEY",
    group: "voice",
    required: true,
    description: "Vapi private key for server API calls",
    validate: isNonEmpty,
  },
  {
    name: "VAPI_WEBHOOK_SECRET",
    group: "voice",
    required: true,
    description: "Secret for verifying Vapi webhook signatures",
    validate: isNonEmpty,
    formatHint: "Generate random string (min 32 chars)",
  },

  // OAUTH - Optional but recommended
  {
    name: "GOOGLE_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "Google OAuth client ID for Gmail integration",
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "Google OAuth client secret",
  },
  {
    name: "MICROSOFT_CLIENT_ID",
    group: "oauth",
    required: false,
    description: "Microsoft OAuth client ID for Outlook integration",
  },
  {
    name: "MICROSOFT_CLIENT_SECRET",
    group: "oauth",
    required: false,
    description: "Microsoft OAuth client secret",
  },

  // BILLING - Optional for self-serve
  {
    name: "STRIPE_SECRET_KEY",
    group: "billing",
    required: false,
    description: "Stripe secret key for payment processing",
    validate: (v) => !v || isStripeKey(v),
    formatHint: "sk_test_... or sk_live_...",
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    group: "billing",
    required: false,
    description: "Stripe webhook signing secret",
  },

  // INFRASTRUCTURE - Recommended for production
  {
    name: "UPSTASH_REDIS_REST_URL",
    group: "infrastructure",
    required: false,
    description: "Upstash Redis REST URL for distributed rate limiting",
    validate: (v) => !v || isUrl(v),
    formatHint: "https://... .upstash.io",
  },
  {
    name: "UPSTASH_REDIS_REST_TOKEN",
    group: "infrastructure",
    required: false,
    description: "Upstash Redis REST token",
  },
  {
    name: "SENTRY_DSN",
    group: "infrastructure",
    required: false,
    description: "Sentry DSN for error tracking",
  },

  // SECURITY - Required for production safety
  {
    name: "OAUTH_STATE_SECRET",
    group: "security",
    required: false,
    description: "Secret for signing OAuth state tokens (CSRF protection)",
    validate: (v) => !v || isBase64Key(v),
    formatHint:
      "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
  },
  {
    name: "WIRELINE_DATA_KEY",
    group: "security",
    required: false,
    description: "Encryption key for secret vault (AES-256-GCM)",
    validate: (v) => !v || isBase64Key(v),
    formatHint: "Base64-encoded 32-byte key",
  },
  {
    name: "CRON_SECRET",
    group: "security",
    required: false,
    description: "Bearer token for cron job authentication",
    validate: (v) => !v || v.length >= 16,
    formatHint: "Min 16 characters",
  },

  // OPERATIONAL - Required for full functionality
  {
    name: "APP_URL",
    group: "operational",
    required: false,
    description: "Canonical public URL of the deployment",
    validate: (v) => !v || isUrl(v),
    formatHint: "https://trywireline.com",
  },
  {
    name: "CORS_ORIGINS",
    group: "operational",
    required: false,
    description: "Comma-separated allowed origins for CORS",
    formatHint: "https://app1.com,https://app2.com",
  },
];

/**
 * Validate all environment variables and return detailed results
 */
export function validateEnv(): EnvValidationResult {
  const result: EnvValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    byGroup: {
      core: { valid: 0, invalid: 0, total: 0 },
      ai: { valid: 0, invalid: 0, total: 0 },
      voice: { valid: 0, invalid: 0, total: 0 },
      oauth: { valid: 0, invalid: 0, total: 0 },
      billing: { valid: 0, invalid: 0, total: 0 },
      action_engine: { valid: 0, invalid: 0, total: 0 },
      infrastructure: { valid: 0, invalid: 0, total: 0 },
      security: { valid: 0, invalid: 0, total: 0 },
      operational: { valid: 0, invalid: 0, total: 0 },
    },
  };

  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";

  for (const config of ENV_REGISTRY) {
    const value = process.env[config.name];
    const hasValue = !!value;
    const group = result.byGroup[config.group];
    group.total++;

    // Check required vars
    if (config.required && !hasValue) {
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

    // Validate format if present and has validator
    if (hasValue && config.validate && !config.validate(value)) {
      if (config.required || isProd) {
        result.valid = false;
        group.invalid++;
        result.errors.push({
          var: config.name,
          group: config.group,
          message: `Environment variable ${config.name} has invalid format`,
          formatHint: config.formatHint,
        });
        continue;
      } else {
        group.valid++;
        result.warnings.push({
          var: config.name,
          group: config.group,
          message: `Environment variable ${config.name} has unexpected format (non-prod, continuing)`,
        });
        continue;
      }
    }

    group.valid++;
  }

  return result;
}

/**
 * Get environment variables by group for organized display
 */
export function getEnvByGroup(group: EnvGroup): EnvVarConfig[] {
  return ENV_REGISTRY.filter((e) => e.group === group);
}

/**
 * Generate a setup checklist for missing environment variables
 */
export function generateSetupChecklist(): string[] {
  const validation = validateEnv();
  const checklist: string[] = [];

  checklist.push("# Wireline Environment Setup Checklist");
  checklist.push("# =====================================");
  checklist.push("");

  for (const group of Object.keys(validation.byGroup) as EnvGroup[]) {
    const groupVars = getEnvByGroup(group);
    const groupResult = validation.byGroup[group];

    if (groupResult.invalid > 0 || groupResult.total === 0) {
      checklist.push(
        `## ${group.toUpperCase()} (${groupResult.valid}/${groupResult.total} configured)`,
      );
      checklist.push("");

      for (const config of groupVars) {
        const value = process.env[config.name];
        const isMissing = config.required && !value;
        const status = isMissing ? "❌ REQUIRED" : value ? "✅ Set" : "⚪ Optional";

        checklist.push(`${status}: ${config.name}`);
        checklist.push(`   Description: ${config.description}`);
        if (config.formatHint && (isMissing || !value)) {
          checklist.push(`   Format: ${config.formatHint}`);
        }
        checklist.push("");
      }
    }
  }

  return checklist;
}

/**
 * Log environment validation results with actionable guidance
 */
export function logEnvValidation(verbose = false): void {
  const validation = validateEnv();

  if (validation.valid) {
    log.info("Environment validation passed", {
      totalVars: ENV_REGISTRY.length,
      byGroup: validation.byGroup,
    });
  } else {
    log.error("Environment validation failed", {
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
      errors: validation.errors.map((e) => ({
        var: e.var,
        group: e.group,
        message: e.message,
      })),
    });

    if (verbose) {
      for (const error of validation.errors) {
        log.error(`Missing/Invalid: ${error.var}`, {
          group: error.group,
          description: ENV_REGISTRY.find((e) => e.name === error.var)?.description,
          formatHint: error.formatHint,
        });
      }
    }
  }

  if (validation.warnings.length > 0) {
    log.warn("Environment validation warnings", {
      count: validation.warnings.length,
      warnings: validation.warnings,
    });
  }
}

/**
 * Assert environment is valid or throw error (for startup)
 */
export function assertEnvValid(): void {
  const validation = validateEnv();
  if (!validation.valid) {
    const missing = validation.errors.map((e) => e.var).join(", ");
    throw new Error(`Environment validation failed. Missing/invalid: ${missing}`);
  }
}
