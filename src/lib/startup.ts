import { log, IS_PROD } from "./server-context";
import { getInternalJwtSecret } from "./internal-jwt-secret";

/**
 * Startup env validation — fail fast in production rather than
 * silently booting with placeholder Supabase URLs / missing webhook
 * secrets.
 */
export function validateStartupEnv() {
  const jwtSecret = getInternalJwtSecret();

  // Required in production; warn in dev so local hacking still works.
  const prodRequired: [string, string | undefined][] = [
    ["INTERNAL_JWT_SECRET", jwtSecret],
    ["ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY],
    ["GEMINI_API_KEY", process.env.GEMINI_API_KEY],
    ["VAPI_PRIVATE_KEY", process.env.VAPI_PRIVATE_KEY],
    ["VAPI_WEBHOOK_SECRET", process.env.VAPI_WEBHOOK_SECRET],
    ["OAUTH_STATE_SECRET", process.env.OAUTH_STATE_SECRET],
    ["APP_URL", process.env.APP_URL],
    // Stripe is wired into every billing route — without the secret
    // key, /api/billing/* throws on first request rather than at boot.
    ["STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY],
    // Drizzle reads this at server-context init. Without it the app
    // boots but every DB-touching route 500s instantly.
    ["POSTGRES_URL", process.env.POSTGRES_URL],
  ];

  const missingProd = prodRequired.filter(([, v]) => !v).map(([k]) => k);
  const missing = IS_PROD ? missingProd : [];

  const recommended: string[] = [];
  if (!process.env.APP_URL) recommended.push("APP_URL");

  if (IS_PROD && !process.env.CORS_ORIGINS && !process.env.APP_URL) {
    recommended.push("CORS_ORIGINS");
  }

  // Rate limiting: without Upstash Redis each Vercel invocation has its own
  // in-memory state, so limits reset on every cold start and provide no real
  // protection. This is a security-relevant missing config, not just a perf nit.
  if (IS_PROD && (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)) {
    log.warn(
      "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — " +
        "rate limits are per-invocation only and provide no protection in serverless. " +
        "Set both vars in Vercel project settings to enable global rate limiting.",
    );
  }

  if (!IS_PROD && missingProd.length) {
    log.warn("Prod-required env vars not set (dev mode — continuing)", { vars: missingProd });
  }

  if (missing.length) {
    if (IS_PROD) {
      log.error("Missing required env vars. App may be unstable.", { missing });
      throw new Error(`Missing required env vars: ${missing.join(", ")}`);
    } else {
      log.warn("Required env vars missing (dev mode — continuing with placeholders)", { missing });
    }
  }

  if (recommended.length) {
    log.warn("Recommended env vars not set", { recommended });
  }
}
