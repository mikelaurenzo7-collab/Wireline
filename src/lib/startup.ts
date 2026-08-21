import { log, IS_PROD } from "./server-context";
import { getInternalJwtSecret } from "./internal-jwt-secret";
import { validateEnv, logEnvValidation, generateSetupChecklist } from "./env-validator";
import { isFederalDncVendorConfigured } from "./federal-dnc-service";

const isNoDatabaseImportSmoke = () => process.env.WIRELINE_IMPORT_SMOKE_NO_DATABASE === "true";

/**
 * Startup env validation: surface production configuration faults without
 * crashing every route behind an opaque serverless import failure.
 */
export function validateStartupEnv() {
  const validation = validateEnv();
  const importSmokeWithoutDatabase = isNoDatabaseImportSmoke();

  if (importSmokeWithoutDatabase) {
    log.info("Skipping startup env error log during no-database import smoke.");
  } else {
    logEnvValidation(IS_PROD);
  }

  // Validates that the JWT secret can be resolved; production policy remains
  // owned by the secret helper and route-level degraded responses.
  getInternalJwtSecret();

  const recommended: string[] = [];
  // APP_URL is a production requirement. Keep the local-development hint
  // without misclassifying the same production fault as merely recommended.
  if (!IS_PROD && !process.env.APP_URL) recommended.push("APP_URL");

  if (IS_PROD && !process.env.CORS_ORIGINS && !process.env.APP_URL) {
    recommended.push("CORS_ORIGINS");
  }

  // Without shared Redis, serverless rate limits reset on invocation boundaries.
  if (
    !importSmokeWithoutDatabase &&
    IS_PROD &&
    (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)
  ) {
    log.error(
      "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set in production, " +
        "rate limits are per-invocation only and provide no protection in serverless. " +
        "Set both vars in Vercel project settings before serving real traffic.",
    );
  }

  // Keep the app importable so each affected route can return actionable JSON.
  if (!validation.valid) {
    const missing = validation.errors.map((e) => e.var);

    if (IS_PROD) {
      if (importSmokeWithoutDatabase) {
        log.info("No-database import smoke validated import-safe degraded startup path.");
      } else {
        log.error(
          "Missing required env vars in production. Affected features will return errors at request time.",
          {
            missing,
            groupSummary: validation.byGroup,
          },
        );

        generateSetupChecklist();
        log.info("Environment setup checklist generated. See logs above for details.");
      }
    } else {
      log.warn("Required env vars missing (dev mode, continuing with placeholders)", {
        missing,
        count: missing.length,
      });
    }
  }

  if (!importSmokeWithoutDatabase && IS_PROD && !isFederalDncVendorConfigured()) {
    log.warn(
      "Federal DNC screening is not configured. It remains a deferred operations checklist item; marketing and campaign outbound will fail closed until configuration is valid.",
    );
  }

  if (!importSmokeWithoutDatabase && IS_PROD && !process.env.SENTRY_DSN) {
    log.warn(
      "SENTRY_DSN not set in production, 5xx and unhandled errors rely on manual log review. Set in Vercel before scaling traffic.",
    );
  }

  if (!importSmokeWithoutDatabase && recommended.length) {
    log.warn("Recommended env vars not set", { recommended });
  }

  if (validation.valid) {
    log.info("Environment validation passed", {
      configured: Object.values(validation.byGroup).reduce((sum, g) => sum + g.valid, 0),
      total: Object.values(validation.byGroup).reduce((sum, g) => sum + g.total, 0),
    });
  }
}
