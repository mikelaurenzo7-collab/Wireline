const INTERNAL_JWT_SECRET = "INTERNAL_JWT_SECRET";
const LEGACY_JWT_SECRET = "SUPABASE_JWT_SECRET";
const MIN_SECRET_LENGTH = 32;

function isProductionRuntime(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === "production" || env.VERCEL === "1";
}

export function getInternalJwtSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const internalSecret = env[INTERNAL_JWT_SECRET];
  const legacySecret = env[LEGACY_JWT_SECRET];

  if (internalSecret && legacySecret && internalSecret !== legacySecret) {
    throw new Error(
      "JWT_SECRET_CONFLICT: INTERNAL_JWT_SECRET and SUPABASE_JWT_SECRET are both set but differ. " +
        "Keep INTERNAL_JWT_SECRET as the canonical BotBound session secret; remove SUPABASE_JWT_SECRET " +
        "after confirming active sessions no longer depend on it.",
    );
  }

  return internalSecret || legacySecret;
}

export function requireInternalJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = getInternalJwtSecret(env);

  if (!secret) {
    throw new Error(
      "JWT_SECRET_NOT_CONFIGURED: INTERNAL_JWT_SECRET or SUPABASE_JWT_SECRET must be set. " +
        "In development, use a secure random string (at least 32 characters). " +
        "In production, this is a critical security requirement.",
    );
  }

  // Fail closed on a short/low-entropy signing secret in production. A short
  // HS256 secret makes offline token forgery feasible. Non-production remains
  // lenient so local development and legacy scripts can use short values.
  if (secret.length < MIN_SECRET_LENGTH && isProductionRuntime(env)) {
    throw new Error(
      `JWT_SECRET_TOO_SHORT: INTERNAL_JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production.`,
    );
  }

  return secret;
}
