const INTERNAL_JWT_SECRET = "INTERNAL_JWT_SECRET";
const LEGACY_JWT_SECRET = "SUPABASE_JWT_SECRET";

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

  return secret;
}
