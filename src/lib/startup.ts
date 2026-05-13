import { log, IS_PROD } from "./server-context";

/**
 * Startup env validation — fail fast in production rather than
 * silently booting with placeholder Supabase URLs / missing webhook
 * secrets.
 */
export function validateStartupEnv() {
  // Hard required in all environments (app cannot function without these).
  const alwaysRequired: [string, string | undefined][] = [
    ["VITE_SUPABASE_URL",     process.env.VITE_SUPABASE_URL],
    ["VITE_SUPABASE_ANON_KEY", process.env.VITE_SUPABASE_ANON_KEY],
  ];
  // Required in production; warn in dev so local hacking still works.
  // The server must boot with the service-role key in production so
  // privileged DB paths never silently fall back to the anon key.
  const prodRequired: [string, string | undefined][] = [
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
    ["ANTHROPIC_API_KEY",   process.env.ANTHROPIC_API_KEY],
    ["GEMINI_API_KEY",      process.env.GEMINI_API_KEY],
    ["VAPI_PRIVATE_KEY",    process.env.VAPI_PRIVATE_KEY],
    ["VAPI_WEBHOOK_SECRET", process.env.VAPI_WEBHOOK_SECRET],
    ["OAUTH_STATE_SECRET",  process.env.OAUTH_STATE_SECRET],
  ];

  const missingAlways = alwaysRequired.filter(([, v]) => !v).map(([k]) => k);
  const missingProd   = prodRequired.filter(([, v]) => !v).map(([k]) => k);
  const missing       = IS_PROD ? [...missingAlways, ...missingProd] : missingAlways;

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
