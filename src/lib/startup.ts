import { log, IS_PROD } from "./server-context";

/**
 * Startup env validation — fail fast in production rather than
 * silently booting with placeholder Supabase URLs / missing webhook
 * secrets.
 */
export function validateStartupEnv() {
  // Required in production; warn in dev so local hacking still works.
  const prodRequired: [string, string | undefined][] = [
    ["INTERNAL_JWT_SECRET", process.env.INTERNAL_JWT_SECRET],
    ["POSTGRES_URL",        process.env.POSTGRES_URL],
    ["OAUTH_STATE_SECRET",  process.env.OAUTH_STATE_SECRET],
    ["ANTHROPIC_API_KEY",   process.env.ANTHROPIC_API_KEY],
    ["GEMINI_API_KEY",      process.env.GEMINI_API_KEY],
    ["VAPI_PRIVATE_KEY",    process.env.VAPI_PRIVATE_KEY],
    ["VAPI_WEBHOOK_SECRET", process.env.VAPI_WEBHOOK_SECRET],
  ];

  const missingProd = prodRequired.filter(([, v]) => !v).map(([k]) => k);
  const missing     = IS_PROD ? missingProd : [];

  const recommended: string[] = [];
  if (!process.env.APP_URL) recommended.push("APP_URL");
  
  if (IS_PROD && !process.env.CORS_ORIGINS && !process.env.APP_URL) {
    recommended.push("CORS_ORIGINS");
  }
  
  if (!IS_PROD && missingProd.length) {
    log.warn("Prod-required env vars not set (dev mode — continuing)", { vars: missingProd });
  }

  if (missing.length) {
    if (IS_PROD) {
      log.error("Missing required env vars. App may be unstable.", { missing });
    } else {
      log.warn("Required env vars missing (dev mode — continuing with placeholders)", { missing });
    }
  }
  
  if (recommended.length) {
    log.warn("Recommended env vars not set", { recommended });
  }
}
