/**
 * Canonical Vercel team and project identity for ops scripts.
 *
 * Every script that talks to the Vercel REST API reads these two identifiers.
 * Keeping one definition here means a project or team move is a one-line edit
 * instead of a repository-wide find-and-replace that silently misses a script.
 *
 * Both values are public routing identifiers, not secrets; the credential is
 * always `VERCEL_TOKEN`, which stays in the environment. Production operations
 * are intentionally not environment-overridable: a copied env file must never
 * redirect Wireline migrations, aliases, or provider configuration to a fork.
 */

export const CANONICAL_TEAM_ID = "team_ssX7cPECdHvXGFHSOuS9iXos";
export const CANONICAL_PROJECT_ID = "prj_mCjWa69TtFye8z11u8bSaWwO41f2";
export const TEAM_ID = CANONICAL_TEAM_ID;
export const PROJECT_ID = CANONICAL_PROJECT_ID;

/** Bearer headers for the Vercel REST API. */
export function vercelAuthHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

/** Documented operator token first, with explicit automation aliases. */
export function resolveVercelToken(env = process.env) {
  return (
    env.VERCEL_TOKEN?.trim() ||
    env.VERCEL_ACCESS_TOKEN?.trim() ||
    env.VERCEL_OIDC_TOKEN?.trim() ||
    ""
  );
}

/**
 * Read `VERCEL_TOKEN`, exiting with usage guidance when it is absent.
 * Ops scripts should fail fast and identically rather than surfacing an
 * opaque 403 from the API.
 */
export function requireVercelToken(usage) {
  const token = resolveVercelToken();
  if (!token) {
    console.error(usage || "VERCEL_TOKEN is required. Usage: VERCEL_TOKEN=... node <script>");
    process.exit(1);
  }
  return token;
}
