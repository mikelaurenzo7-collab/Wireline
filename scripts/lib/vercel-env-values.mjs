/**
 * Shared Vercel env-value reader for ops scripts.
 *
 * The bulk `GET /v9/projects/:id/env?decrypt=true` listing returns ciphertext
 * for `encrypted`-type variables; only the per-variable
 * `GET /v1/projects/:id/env/:envId?decrypt=true` endpoint decrypts them.
 * Secrets in this project are stored as `encrypted` (never `plain`), so any
 * script that needs a secret's value must resolve it per variable.
 */

const TEAM_ID = "team_ssX7cPECdHvXGFHSOuS9iXos";
const PROJECT_ID = "prj_mCjWa69TtFye8z11u8bSaWwO41f2";

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

/** List all env rows (metadata + plain values; encrypted values unresolved). */
export async function listVercelEnvs(token) {
  const res = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env?decrypt=true&teamId=${TEAM_ID}`,
    { headers: authHeaders(token) },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${text.slice(0, 400)}`);
  const { envs = [] } = JSON.parse(text);
  return envs;
}

/** Resolve one env row's decrypted value via the per-variable endpoint. */
export async function resolveVercelEnvValue(token, envRow) {
  if (!envRow) return undefined;
  if (envRow.type !== "encrypted" && envRow.type !== "sensitive") return envRow.value;
  const res = await fetch(
    `https://api.vercel.com/v1/projects/${PROJECT_ID}/env/${envRow.id}?teamId=${TEAM_ID}&decrypt=true`,
    { headers: authHeaders(token) },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text).value;
}

/**
 * Fetch the decrypted value of `key` for a deployment target
 * (default "production"). Returns undefined when the key is absent.
 */
export async function getVercelEnvValue(token, key, target = "production") {
  const envs = await listVercelEnvs(token);
  const row =
    envs.find((env) => env.key === key && env.target?.includes(target)) ||
    envs.find((env) => env.key === key);
  return resolveVercelEnvValue(token, row);
}
