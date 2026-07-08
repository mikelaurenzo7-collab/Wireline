import { log, IS_PROD } from "./server-context";
import { getInternalJwtSecret } from "./internal-jwt-secret";
import { validateEnv, logEnvValidation, generateSetupChecklist } from "./env-validator";

/**
 * Startup env validation — fail fast in production rather than
 * silently booting with placeholder Supabase URLs / missing webhook
 * secrets.
 *
 * Uses the comprehensive env-validator for detailed, grouped validation
 * with actionable error messages and setup guidance.
 */
export function validateStartupEnv() {
  // Run comprehensive validation
  const validation = validateEnv();

  // Log results with verbose mode in production
  logEnvValidation(IS_PROD);

  // Additional legacy checks for backward compatibility
  // Validates that JWT secret can be resolved (throws if missing in prod)
  getInternalJwtSecret();

  const recommended: string[] = [];
  if (!process.env.APP_URL) recommended.push("APP_URL");

  if (IS_PROD && !process.env.CORS_ORIGINS && !process.env.APP_URL) {
    recommended.push("CORS_ORIGINS");
  }

  // Rate limiting: without Upstash Redis each Vercel invocation has its own
  // in-memory state, so limits reset on every cold start and provide no real
  // protection. This is a security-relevant missing config, not just a perf nit.
  // We do not throw (see the note below on why boot-time throws hurt more than
  // they help), but we log at `error` in prod so it surfaces in incident review
  // and the daily env-health audit script has a distinct signal to key on.
  if (IS_PROD && (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)) {
    log.error(
      "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set in production — " +
        "rate limits are per-invocation only and provide no protection in serverless. " +
        "Set both vars in Vercel project settings before serving real traffic.",
    );
  }

  // If validation failed, log loudly but DO NOT throw — even in production.
  //
  // Previously this threw in IS_PROD, which crashed the Vercel serverless
  // function at module load. The handler in `api/index.ts` could no longer
  // import `dist/server.cjs`, so Vercel responded to every request with its
  // generic "A server error has occurred" HTML page. That broke every
  // auth surface (Google / Microsoft / Yahoo OAuth and email-password sign-in)
  // any time a single required env var (e.g. VAPI_WEBHOOK_SECRET) was
  // forgotten, with zero diagnostic signal to the end user.
  //
  // The individual routes already short-circuit cleanly when their
  // specific env vars are missing (e.g. `/api/auth/google/url` returns
  // 503 `{"error":"Google sign-in is not configured."}` when
  // GOOGLE_CLIENT_ID is unset). Keeping the app booted means those
  // route-level errors surface to the SPA as actionable JSON instead
  // of an opaque Vercel 500.
  if (!validation.valid) {
    const missing = validation.errors.map((e) => e.var);

    if (IS_PROD) {
      log.error(
        "Missing required env vars in production. Affected features will return errors at request time.",
        {
          missing,
          groupSummary: validation.byGroup,
        },
      );

      // Generate setup checklist for easier onboarding
      generateSetupChecklist();
      log.info("Environment setup checklist generated. See logs above for details.");
    } else {
      log.warn("Required env vars missing (dev mode — continuing with placeholders)", {
        missing,
        count: missing.length,
      });
    }
  }

  if (IS_PROD && (!process.env.FEDERAL_DNC_API_URL || !process.env.FEDERAL_DNC_API_KEY)) {
    log.warn(
      "FEDERAL_DNC_API_URL / FEDERAL_DNC_API_KEY not set in production — federal DNC scrub is skipped until configured. Set both before scaling marketing outbound.",
    );
  }

  if (IS_PROD && !process.env.SENTRY_DSN) {
    log.warn(
      "SENTRY_DSN not set in production — 5xx and unhandled errors rely on manual log review. Set in Vercel before scaling traffic.",
    );
  }

  if (recommended.length) {
    log.warn("Recommended env vars not set", { recommended });
  }

  // Success logging
  if (validation.valid) {
    log.info("Environment validation passed", {
      configured: Object.values(validation.byGroup).reduce((sum, g) => sum + g.valid, 0),
      total: Object.values(validation.byGroup).reduce((sum, g) => sum + g.total, 0),
    });
  }
}
