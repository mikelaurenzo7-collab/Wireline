import { log, IS_PROD } from "./server-context";
import { getInternalJwtSecret } from "./internal-jwt-secret";
import { validateEnv, logEnvValidation, generateSetupChecklist } from "./env-validator";
import { isFederalDncVendorConfigured } from "./federal-dnc-service";
import { isPreviewDeployment, isProductionDeployment } from "./deployment-environment";
import { isolatedPreviewInMemoryRateLimitAllowed } from "./preview-spend-policy";

const isNoDatabaseImportSmoke = () => process.env.WIRELINE_IMPORT_SMOKE_NO_DATABASE === "true";
const isAffirmative = (value: string | undefined) =>
  ["1", "true", "yes", "on"].includes(
    String(value || "")
      .trim()
      .toLowerCase(),
  );

/**
 * Startup env validation: surface production configuration faults without
 * crashing every route behind an opaque serverless import failure.
 */
export function validateStartupEnv() {
  const validation = validateEnv();
  const importSmokeWithoutDatabase = isNoDatabaseImportSmoke();
  // NODE_ENV=production and VERCEL=1 describe Vercel's secure runtime in both
  // Preview and Production. Launch-only provider, CORS, observability, and
  // distributed-infrastructure requirements belong only to the canonical
  // Production environment. Keep IS_PROD for runtime security behavior while
  // using VERCEL_ENV-aware policy for startup severity.
  const productionDeployment = isProductionDeployment();
  const previewDeployment = isPreviewDeployment();
  const previewInMemoryRateLimit =
    previewDeployment && isAffirmative(process.env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT);
  const previewInMemoryRateLimitAllowed = isolatedPreviewInMemoryRateLimitAllowed();
  const distributedRateLimitMissing =
    !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN;

  if (importSmokeWithoutDatabase) {
    log.info("Skipping startup env error log during no-database import smoke.");
  } else {
    logEnvValidation(productionDeployment);
  }

  // Validates that the JWT secret can be resolved; production policy remains
  // owned by the secret helper and route-level degraded responses.
  getInternalJwtSecret();

  const recommended: string[] = [];
  // APP_URL is a production requirement. Keep the local-development hint
  // without misclassifying the same production fault as merely recommended.
  if (!IS_PROD && !process.env.APP_URL) recommended.push("APP_URL");

  if (productionDeployment && !process.env.CORS_ORIGINS && !process.env.APP_URL) {
    recommended.push("CORS_ORIGINS");
  }

  // Without shared Redis, serverless rate limits reset on invocation boundaries.
  if (!importSmokeWithoutDatabase && distributedRateLimitMissing) {
    if (productionDeployment) {
      log.error(
        "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set in production, " +
          "rate limits are per-invocation only and provide no protection in serverless. " +
          "Set both vars in the hosting service settings before serving real traffic.",
      );
    } else if (previewInMemoryRateLimitAllowed) {
      log.info(
        "Preview explicitly uses per-invocation rate limiting for isolated, provider-free QA. Keep this deployment access-protected; never use the override for public or Production traffic.",
      );
    } else if (previewInMemoryRateLimit) {
      log.warn(
        "Preview in-memory rate limiting was requested but refused. The override requires isolated demo data and no live external provider authority; spend-sensitive routes remain fail-closed.",
      );
    } else if (previewDeployment) {
      log.warn(
        "UPSTASH Redis is not configured for Preview. Authentication and spend-sensitive routes remain fail-closed. Protected isolated QA may use a branch-scoped WIRELINE_ALLOW_INMEMORY_RATE_LIMIT=true override.",
      );
    }
  }

  // Keep the app importable so each affected route can return actionable JSON.
  if (!validation.valid) {
    const missing = validation.errors.map((e) => e.var);

    if (productionDeployment) {
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
      log.info("Non-production runtime started with unavailable feature configuration", {
        missing,
        count: missing.length,
      });
    }
  }

  if (!importSmokeWithoutDatabase && productionDeployment && !isFederalDncVendorConfigured()) {
    log.warn(
      "Federal DNC screening is not configured. It remains a deferred operations checklist item; marketing and campaign outbound will fail closed until configuration is valid.",
    );
  }

  if (!importSmokeWithoutDatabase && productionDeployment && !process.env.SENTRY_DSN) {
    log.warn(
      "SENTRY_DSN not set in production, 5xx and unhandled errors rely on manual log review. Set in the hosting service before scaling traffic.",
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
