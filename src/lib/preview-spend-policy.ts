type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

const PREVIEW_SPEND_AUTHORITY_KEYS = [
  "AGENTMAIL_API_KEY",
  "AI_GATEWAY_API_KEY",
  "APOLLO_API_KEY",
  "ELEVENLABS_API_KEY",
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
  return normalized(env.VERCEL_ENV).toLowerCase() === "preview";
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
    isVercelPreview(env) &&
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
  if (isVercelPreview(env)) return isolatedPreviewInMemoryRateLimitAllowed(env);
  if (normalized(env.VERCEL_ENV) || affirmative(env.VERCEL)) return false;
  return true;
}
