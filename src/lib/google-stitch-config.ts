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

export function getGoogleCloudProjectId(): string | null {
  return process.env.GOOGLE_CLOUD_PROJECT?.trim() || null;
}

export function getGoogleApplicationCredentialsJson(): string | null {
  return process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim() || null;
}

export function isGoogleStitchConfigured(): boolean {
  const hasApiKey = Boolean(getGoogleStitchApiKey());
  const hasOAuth = Boolean(getGoogleApplicationCredentialsJson() && getGoogleCloudProjectId());
  return hasApiKey || hasOAuth;
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

/** Poll schedule after generate_screen_from_text — Stitch compose can take 3–5 min. */
export function getStitchComposePollDelaysMs(): number[] {
  const budgetMs = Math.max(120_000, getGoogleStitchTimeoutMs() - 150_000);
  const delays = [0];
  let elapsed = 0;
  let step = 5_000;
  while (elapsed < budgetMs) {
    elapsed += step;
    delays.push(elapsed);
    if (step < 10_000) step = 8_000;
    else step = 10_000;
  }
  return delays;
}

/**
 * Default Stitch project — numeric ID from stitch.withgoogle.com/projects/{id}.
 * This is NOT GOOGLE_CLOUD_PROJECT (GCP console); Wireline uses API-key auth only.
 * Project must be TEXT_TO_UI / TEXT_TO_UI_PRO (created in Stitch web UI, not MCP create_project).
 */
export function getGoogleStitchProjectId(): string | null {
  const raw =
    process.env.GOOGLE_STITCH_PROJECT_ID?.trim() || process.env.STITCH_PROJECT_ID?.trim() || "";
  if (!raw) return null;
  return raw.replace(/^projects\//, "").trim() || null;
}
