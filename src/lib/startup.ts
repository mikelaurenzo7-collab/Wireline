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
  const jwtSecret = getInternalJwtSecret();

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

  // If validation failed, throw with helpful guidance
  if (!validation.valid) {
    const missing = validation.errors.map((e) => e.var);

    if (IS_PROD) {
      log.error("Missing required env vars. App may be unstable.", {
        missing,
        groupSummary: validation.byGroup,
      });

      // Generate setup checklist for easier onboarding
      const checklist = generateSetupChecklist();
      log.info("Environment setup checklist generated. See logs above for details.");

      throw new Error(
        `Missing required env vars: ${missing.join(", ")}. ` +
          `Run with VERBOSE_ENV=1 for detailed setup instructions.`,
      );
    } else {
      log.warn("Required env vars missing (dev mode — continuing with placeholders)", {
        missing,
        count: missing.length,
      });
    }
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
