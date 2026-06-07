/**
 * Google Stitch (Google Labs UI generation) — env + feature detection.
 * Vercel key name: GOOGLE_STITCH_API_KEY (SDK alias: STITCH_API_KEY).
 */

const STITCH_MCP_BASE = "https://stitch.googleapis.com/mcp";
/** Match Director / Vercel budget — Stitch generate can run 3–5 min. */
const DEFAULT_STITCH_TIMEOUT_MS = 540_000;

/** Matches vercel.json `api/index.ts` maxDuration on Pro. */
export const STITCH_VERCEL_MAX_DURATION_MS = 600_000;
/** Headroom for JSON response, artifact uploads, and platform jitter. */
export const STITCH_REQUEST_HEADROOM_MS = 45_000;
/** In-request asset poll after generate — finalize handles the rest. */
export const STITCH_IN_REQUEST_ASSET_POLL_MS = 90_000;
/** Per finalize HTTP invocation (client retries on 202). */
export const STITCH_FINALIZE_POLL_BUDGET_MS = 120_000;

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

/** Wall-clock deadline for a single Director Stitch turn (stays under Vercel cap). */
export function getStitchInRequestDeadlineMs(): number {
  const timeout = getGoogleStitchTimeoutMs();
  return Math.min(timeout, STITCH_VERCEL_MAX_DURATION_MS - STITCH_REQUEST_HEADROOM_MS);
}

/** Build cumulative poll timestamps from zero up to budgetMs. */
export function buildStitchPollDelaysMs(budgetMs: number): number[] {
  const budget = Math.max(15_000, budgetMs);
  const delays = [0];
  let elapsed = 0;
  let step = 5_000;
  while (elapsed < budget) {
    elapsed += step;
    delays.push(elapsed);
    if (step < 10_000) step = 8_000;
    else step = 10_000;
  }
  return delays;
}

/** Poll schedule for /api/director/stitch/finalize (one invocation; client loops). */
export function getStitchFinalizePollDelaysMs(): number[] {
  return buildStitchPollDelaysMs(STITCH_FINALIZE_POLL_BUDGET_MS);
}

/** Short in-request asset poll — returns pending + client finalize when exhausted. */
export function getStitchInRequestAssetPollDelaysMs(remainingMs?: number): number[] {
  const budget =
    remainingMs !== undefined
      ? Math.max(15_000, Math.min(remainingMs, STITCH_IN_REQUEST_ASSET_POLL_MS))
      : STITCH_IN_REQUEST_ASSET_POLL_MS;
  return buildStitchPollDelaysMs(budget);
}

/** Screen-list poll when generate() ends early — capped so asset poll still fits. */
export function getStitchScreenDiscoveryPollDelaysMs(remainingMs: number): number[] {
  const budget = Math.max(30_000, Math.min(remainingMs, 180_000));
  return buildStitchPollDelaysMs(budget);
}

/** @deprecated Prefer getStitchFinalizePollDelaysMs or getStitchInRequestAssetPollDelaysMs */
export function getStitchComposePollDelaysMs(): number[] {
  return getStitchFinalizePollDelaysMs();
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
