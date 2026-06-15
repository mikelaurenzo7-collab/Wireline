/**
 * Firebase Cloud Messaging (FCM) push for the native Wireline Android app.
 *
 * The Android counterpart to src/lib/apns-push.ts. Two delivery shapes share
 * one transport:
 *   - Wake / VoIP-equivalent: a high-priority DATA message (no `notification`
 *     block) so the app's FirebaseMessagingService.onMessageReceived fires even
 *     in Doze/background and can post a self-managed ConnectionService incoming
 *     call — the Android analogue of CallKit's reportNewIncomingCall.
 *   - Alert: a notification message (recap / mid-call device action).
 *
 * WHY raw fetch + the FCM HTTP v1 API: Wireline's webhook handlers run on Vercel
 * serverless functions — stateless and short-lived. We mint a short-lived OAuth2
 * access token from the service-account credentials (RS256 JWT exchanged at
 * Google's token endpoint, cached ~55 min) and POST one message per request. No
 * firebase-admin SDK (it expects a long-lived process and bundles heavy deps).
 *
 * Fully env-gated: if the FCM_* vars are not configured (local dev, CI, any
 * environment without Firebase credentials) every function is a safe no-op. It
 * must NEVER throw into the webhook path that triggers it.
 */
import crypto from "node:crypto";
import { log } from "./server-context";

interface FcmConfig {
  projectId: string;
  clientEmail: string;
  /** PEM-encoded service-account private key (newlines may be `\n`-escaped). */
  privateKey: string;
  tokenUri: string;
}

function loadFcmConfig(): FcmConfig | null {
  const projectId = process.env.FCM_PROJECT_ID?.trim();
  const clientEmail = process.env.FCM_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.FCM_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyRaw) return null;

  // Vercel env vars can't hold literal newlines — accept `\n`-escaped PEM.
  const privateKey = privateKeyRaw.includes("\\n")
    ? privateKeyRaw.replace(/\\n/g, "\n")
    : privateKeyRaw;
  const tokenUri = process.env.FCM_TOKEN_URI?.trim() || "https://oauth2.googleapis.com/token";
  return { projectId, clientEmail, privateKey, tokenUri };
}

/** Whether FCM is configured in this environment. */
export function isFcmConfigured(): boolean {
  return loadFcmConfig() !== null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
// Google access tokens live 3600s; refresh a little early to avoid edge expiry.
const ACCESS_TOKEN_TTL_MS = 55 * 60 * 1000;
let cachedAccessToken: { value: string; expiresAt: number } | null = null;

/**
 * Mint (or reuse) an OAuth2 access token from the service-account credentials.
 * Signs an RS256 JWT and exchanges it at Google's token endpoint. Returns null
 * on any failure (never throws).
 */
async function getAccessToken(cfg: FcmConfig): Promise<string | null> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now) return cachedAccessToken.value;

  try {
    const iat = Math.floor(now / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(
      JSON.stringify({
        iss: cfg.clientEmail,
        scope: FCM_SCOPE,
        aud: cfg.tokenUri,
        iat,
        exp: iat + 3600,
      }),
    );
    const signingInput = `${header}.${claims}`;
    const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), cfg.privateKey);
    const assertion = `${signingInput}.${base64url(signature)}`;

    const res = await fetch(cfg.tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    });
    if (!res.ok) {
      log.warn("FCM token exchange failed", { status: res.status });
      return null;
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token) return null;
    cachedAccessToken = { value: json.access_token, expiresAt: now + ACCESS_TOKEN_TTL_MS };
    return json.access_token;
  } catch (err) {
    log.warn("FCM token exchange error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export type FcmPushShape = "data" | "notification";

export interface FcmSendResult {
  ok: boolean;
  status: number;
  /** FCM error status string on failure (e.g. "UNREGISTERED"), if any. */
  reason?: string;
}

/** FCM error codes that mean a token will never work again → prune it. */
export function isStaleFcmReason(reason?: string): boolean {
  return reason === "UNREGISTERED" || reason === "INVALID_ARGUMENT";
}

/**
 * Send one FCM message to a single registration token via the HTTP v1 API.
 * `data` is sent as string→string pairs (FCM requirement). When `shape` is
 * "data" the message is data-only and high-priority (wakes a Doze'd app);
 * when "notification" a notification block + optional data ride together.
 * Resolves with the outcome; never throws.
 */
export async function sendFcmPush(
  token: string,
  opts: {
    shape: FcmPushShape;
    data?: Record<string, string>;
    notification?: { title: string; body: string };
  },
): Promise<FcmSendResult> {
  const cfg = loadFcmConfig();
  if (!cfg) return { ok: false, status: 0, reason: "FCM_NOT_CONFIGURED" };
  if (!token) return { ok: false, status: 0, reason: "NO_DEVICE_TOKEN" };

  const accessToken = await getAccessToken(cfg);
  if (!accessToken) return { ok: false, status: 0, reason: "NO_ACCESS_TOKEN" };

  // High-priority data message wakes the app; notification rides normal-ish but
  // we keep priority high so call-related alerts are prompt.
  const message: Record<string, unknown> = {
    token,
    android: { priority: "high" },
  };
  if (opts.data) message.data = opts.data;
  if (opts.shape === "notification" && opts.notification) {
    message.notification = opts.notification;
  }

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ message }),
      },
    );
    if (res.ok) return { ok: true, status: res.status };

    // FCM v1 errors carry a status string in error.status / error.details.
    let reason: string | undefined;
    try {
      const body = (await res.json()) as {
        error?: { status?: string; details?: Array<{ errorCode?: string }> };
      };
      reason = body.error?.details?.find((d) => d.errorCode)?.errorCode || body.error?.status;
    } catch {
      /* non-JSON error body — leave reason undefined */
    }
    return { ok: false, status: res.status, reason };
  } catch (err) {
    log.warn("FCM send error", { error: err instanceof Error ? err.message : String(err) });
    return { ok: false, status: 0, reason: "REQUEST_ERROR" };
  }
}
