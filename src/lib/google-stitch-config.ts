/**
 * Google Stitch (Google Labs UI generation) — env + feature detection.
 * Vercel key name: GOOGLE_STITCH_API_KEY (SDK alias: STITCH_API_KEY).
 */

const STITCH_MCP_BASE = "https://stitch.googleapis.com/mcp";
/** Match Director / Vercel budget — Stitch generate can run 3–5 min. */
const DEFAULT_STITCH_TIMEOUT_MS = 540_000;

export function getGoogleStitchApiKey(): string | null {
  const key = process.env.GOOGLE_STITCH_API_KEY?.trim() || process.env.STITCH_API_KEY?.trim() || "";
  return key || null;
}

export function getGoogleStitchAccessToken(): string | null {
  const token = process.env.STITCH_ACCESS_TOKEN?.trim() || "";
  return token || null;
}

export function getGoogleStitchQuotaProjectId(): string | null {
  const raw = process.env.GOOGLE_CLOUD_PROJECT?.trim() || "";
  return raw || null;
}

export function hasGoogleStitchCredentials(): boolean {
  if (getGoogleStitchApiKey()) return true;
  return Boolean(getGoogleStitchAccessToken() && getGoogleStitchQuotaProjectId());
}

export function isGoogleStitchConfigured(): boolean {
  return hasGoogleStitchCredentials();
}

export function getGoogleStitchMcpBaseUrl(): string {
  return process.env.STITCH_HOST?.trim() || STITCH_MCP_BASE;
}

export function getGoogleStitchTimeoutMs(): number {
  const raw = process.env.GOOGLE_STITCH_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_STITCH_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 30_000 ? Math.min(n, 540_000) : DEFAULT_STITCH_TIMEOUT_MS;
}

/**
 * Default Stitch project — numeric ID from stitch.withgoogle.com/projects/{id}.
 * This is NOT GOOGLE_CLOUD_PROJECT (GCP console); GOOGLE_CLOUD_PROJECT is only for OAuth quota.
 * Project must be TEXT_TO_UI / TEXT_TO_UI_PRO (created in Stitch web UI, not MCP create_project).
 */
export function parseGoogleStitchProjectId(raw: string | undefined | null): string | null {
  const value = raw?.trim() || "";
  if (!value) return null;
  const urlMatch = value.match(/(?:^|\/)projects\/([^/?#]+)/i);
  const candidate = (urlMatch?.[1] || value.replace(/^projects\//i, "")).trim();
  return candidate.replace(/[?#].*$/, "") || null;
}

export function getGoogleStitchProjectId(): string | null {
  const raw =
    process.env.GOOGLE_STITCH_PROJECT_ID?.trim() || process.env.STITCH_PROJECT_ID?.trim() || "";
  return parseGoogleStitchProjectId(raw);
}
