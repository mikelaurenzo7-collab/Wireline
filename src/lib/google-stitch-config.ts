/**
 * Google Stitch (Google Labs UI generation) — env + feature detection.
 * Vercel key name: GOOGLE_STITCH_API_KEY (SDK alias: STITCH_API_KEY).
 */

const STITCH_MCP_BASE = "https://stitch.googleapis.com/mcp";
const DEFAULT_STITCH_TIMEOUT_MS = 280_000;

export function getGoogleStitchApiKey(): string | null {
  const key = process.env.GOOGLE_STITCH_API_KEY?.trim() || process.env.STITCH_API_KEY?.trim() || "";
  return key || null;
}

export function isGoogleStitchConfigured(): boolean {
  return Boolean(getGoogleStitchApiKey());
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

/** Optional default project — must be TEXT_TO_UI_PRO (create at stitch.withgoogle.com). */
export function getGoogleStitchProjectId(): string | null {
  const raw =
    process.env.GOOGLE_STITCH_PROJECT_ID?.trim() || process.env.STITCH_PROJECT_ID?.trim() || "";
  if (!raw) return null;
  return raw.replace(/^projects\//, "").trim() || null;
}
