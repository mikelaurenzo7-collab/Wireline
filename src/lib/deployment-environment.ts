export type DeploymentEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Vercel builds run with NODE_ENV=production in every environment. Give the
 * explicit VERCEL_ENV value precedence so Preview never inherits Production's
 * launch-only secret policy. Local/non-Vercel production keeps the NODE_ENV
 * fallback.
 */
export function isProductionDeployment(
  env: DeploymentEnvironment = process.env,
): boolean {
  const vercelEnvironment = env.VERCEL_ENV?.trim().toLowerCase();
  if (vercelEnvironment) return vercelEnvironment === "production";
  return env.NODE_ENV?.trim().toLowerCase() === "production";
}
