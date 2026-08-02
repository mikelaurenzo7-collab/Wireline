/**
 * Canonical Vercel team and project identity for ops scripts.
 *
 * Every script that talks to the Vercel REST API reads these two identifiers.
 * Keeping one definition here means a project or team move is a one-line edit
 * instead of a repository-wide find-and-replace that silently misses a script.
 *
 * Both values are public routing identifiers, not secrets; the credential is
 * always `VERCEL_TOKEN`, which stays in the environment. `VERCEL_TEAM_ID` and
 * `VERCEL_PROJECT_ID` override the defaults so a fork, duplicate project, or
 * CI runner can point the same scripts at a different target.
 */

export const TEAM_ID = process.env.VERCEL_TEAM_ID?.trim() || "team_ssX7cPECdHvXGFHSOuS9iXos";
export const PROJECT_ID =
  process.env.VERCEL_PROJECT_ID?.trim() || "prj_mCjWa69TtFye8z11u8bSaWwO41f2";

/** Bearer headers for the Vercel REST API. */
export function vercelAuthHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Read `VERCEL_TOKEN`, exiting with usage guidance when it is absent.
 * Ops scripts should fail fast and identically rather than surfacing an
 * opaque 403 from the API.
 */
export function requireVercelToken(usage) {
  const token = process.env.VERCEL_TOKEN?.trim();
  if (!token) {
    console.error(usage || "VERCEL_TOKEN is required. Usage: VERCEL_TOKEN=... node <script>");
    process.exit(1);
  }
  return token;
}
