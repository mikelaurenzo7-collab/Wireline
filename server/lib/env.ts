/**
 * Centralized environment validation. The single place where we read
 * `process.env`. All other modules import the typed `env` object.
 *
 * Goals:
 *   - Fail fast in production if required vars are missing.
 *   - Tolerate missing vars in development so `npm run dev` still boots.
 *   - Stop falling back to GOOGLE_CLIENT_SECRET as the OAuth state HMAC key
 *     in production (Phase 1 hardening item).
 */
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

// `optional` here means: not required to *boot*; individual code paths still
// guard with `getRequired()` helpers when actually used. Production tightens
// the contract.
const baseSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  APP_URL: z.string().url().optional(),

  // Supabase
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Gemini
  GEMINI_API_KEY: z.string().min(1).optional(),

  // Vapi
  VAPI_PRIVATE_KEY: z.string().min(1).optional(),
  WIRELINE_WEBHOOK_SECRET: z.string().min(16).optional(),

  // Google Workspace OAuth
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  OAUTH_STATE_SECRET: z.string().min(16).optional(),
});

const productionSchema = baseSchema.extend({
  APP_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  WIRELINE_WEBHOOK_SECRET: z.string().min(16),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  OAUTH_STATE_SECRET: z.string().min(16),
});

function parseEnv() {
  const schema = isProduction ? productionSchema : baseSchema;
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    const message = `Invalid environment configuration:\n${issues}`;

    if (isProduction) {
      console.error(`CRITICAL: ${message}`);
      process.exit(1);
    } else {
      console.warn(`WARNING: ${message}`);
      // In dev, fall back to a permissive shape so the server can still boot.
      return baseSchema.parse({
        ...process.env,
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "https://placeholder.supabase.co",
        VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? "placeholder",
      });
    }
  }

  return result.data;
}

export const env = parseEnv();
export type Env = typeof env;

export function isProductionEnv() {
  return isProduction;
}

export function getRequiredEnv<K extends keyof Env>(name: K): NonNullable<Env[K]> {
  const value = env[name];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${String(name)}`);
  }
  return value as NonNullable<Env[K]>;
}
