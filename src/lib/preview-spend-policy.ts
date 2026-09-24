import {
  getDeploymentIdentity,
  isPreviewDeployment,
  isProductionDeployment,
  type DeploymentEnvironment,
} from "./deployment-environment";

type RuntimeEnvironment = DeploymentEnvironment;

const PREVIEW_SPEND_AUTHORITY_KEYS = [
  "AGENTMAIL_API_KEY",
  "AI_GATEWAY_API_KEY",
  "APOLLO_API_KEY",
  "FEDERAL_DNC_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_API_KEY_CHATKIT",
  "PERPLEXITY_PREVIEW_API_KEY",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "TWILIO_API_KEY",
  "TWILIO_API_SECRET",
  "TWILIO_AUTH_TOKEN",
  "VAPI_PRIVATE_KEY",
  "XAI_API_KEY",
  "XAI_API_KEY_CHATKIT",
] as const;

function normalized(value: string | undefined): string {
  return String(value || "").trim();
}

function affirmative(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(normalized(value).toLowerCase());
}

export function isVercelPreview(env: RuntimeEnvironment = process.env): boolean {
  return getDeploymentIdentity(env).provider === "vercel" && isPreviewDeployment(env);
}

/** Ambiguous or non-production Render releases must never inherit live authority. */
export function requiresPreviewProviderIsolation(env: RuntimeEnvironment = process.env): boolean {
  const identity = getDeploymentIdentity(env);
  return (
    isPreviewDeployment(env) ||
    identity.provider === "conflict" ||
    (identity.provider === "render" && !isProductionDeployment(env))
  );
}

export function liveStripeCredentialBlocked(env: RuntimeEnvironment = process.env): boolean {
  if (!requiresPreviewProviderIsolation(env)) return false;
  if (!/^(?:sk|rk)_live_/.test(normalized(env.STRIPE_SECRET_KEY))) return false;
  // Preserve the legacy Vercel rollback policy. Render has no live-preview bypass.
  return (
    getDeploymentIdentity(env).provider !== "vercel" ||
    env.WIRELINE_ALLOW_LIVE_PROVIDER_KEYS_IN_PREVIEW !== "true"
  );
}

/**
 * A Preview process is provider-free only when it has no credential that can
 * reach a billable external plane. Preview OIDC is not counted: the Gateway
 * transport makes that automatically managed token unusable in Preview, and
 * tests pin that fail-closed boundary.
 */
export function hasPreviewSpendAuthority(env: RuntimeEnvironment = process.env): boolean {
  return PREVIEW_SPEND_AUTHORITY_KEYS.some((name) => Boolean(normalized(env[name])));
}

/**
 * The only serverless in-memory exception is an access-protected QA Preview
 * backed by an isolated demo database and no live provider authority. These
 * conditions are intentionally redundant with the build boundary: runtime
 * spend protection must still fail closed if environment inheritance drifts.
 */
export function isolatedPreviewInMemoryRateLimitAllowed(
  env: RuntimeEnvironment = process.env,
): boolean {
  return (
    isPreviewDeployment(env) &&
    affirmative(env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT) &&
    affirmative(env.WIRELINE_PREVIEW_DATABASE_ISOLATED) &&
    affirmative(env.WIRELINE_LAUNCH_DEMO_MODE) &&
    !hasPreviewSpendAuthority(env)
  );
}

/**
 * Explicit fallback for one long-lived non-Vercel process. Vercel Preview has
 * its narrower QA-only policy above; every other Vercel environment requires
 * a distributed limiter.
 */
export function inMemoryRateLimitAllowed(env: RuntimeEnvironment = process.env): boolean {
  if (!affirmative(env.WIRELINE_ALLOW_INMEMORY_RATE_LIMIT)) return false;
  if (isPreviewDeployment(env)) return isolatedPreviewInMemoryRateLimitAllowed(env);
  const identity = getDeploymentIdentity(env);
  if (identity.provider === "conflict") return false;
  if (identity.provider === "render" && !isProductionDeployment(env)) return false;
  if (normalized(env.VERCEL_ENV) || affirmative(env.VERCEL)) return false;
  return true;
}
