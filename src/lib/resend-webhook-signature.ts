import { createHmac, timingSafeEqual } from "node:crypto";

export const RESEND_WEBHOOK_MAX_AGE_SECONDS = 5 * 60;
const MAX_HEADER_LENGTH = 2048;

type HeaderValue = string | string[] | undefined;

export type ResendWebhookHeaders = {
  "svix-id"?: HeaderValue;
  "svix-timestamp"?: HeaderValue;
  "svix-signature"?: HeaderValue;
};

export type ResendWebhookVerification =
  | { ok: true; webhookId: string; timestamp: number }
  | {
      ok: false;
      code:
        | "missing_secret"
        | "missing_headers"
        | "malformed_headers"
        | "stale_timestamp"
        | "invalid_signature";
    };

function firstHeader(value: HeaderValue): string {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function decodeSigningSecret(secret: string): Buffer | null {
  const encoded = secret.trim().replace(/^whsec_/, "");
  if (!encoded) return null;
  try {
    const decoded = Buffer.from(encoded, "base64");
    return decoded.length >= 16 ? decoded : null;
  } catch {
    return null;
  }
}

/** Keep readiness aligned with the verifier's actual credential contract. */
export function resendWebhookSecretConfigured(secret = process.env.RESEND_WEBHOOK_SECRET): boolean {
  return typeof secret === "string" && decodeSigningSecret(secret) !== null;
}

/**
 * Verify Resend's Standard Webhooks/Svix envelope against the untouched body.
 * No JSON parsing or external work may occur before this returns `ok: true`.
 */
export function verifyResendWebhookSignature(
  rawBody: Buffer,
  headers: ResendWebhookHeaders,
  signingSecret = process.env.RESEND_WEBHOOK_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
): ResendWebhookVerification {
  if (!signingSecret?.trim()) return { ok: false, code: "missing_secret" };

  const webhookId = firstHeader(headers["svix-id"]);
  const timestampRaw = firstHeader(headers["svix-timestamp"]);
  const signatureRaw = firstHeader(headers["svix-signature"]);
  if (!webhookId || !timestampRaw || !signatureRaw) {
    return { ok: false, code: "missing_headers" };
  }
  if (
    webhookId.length > MAX_HEADER_LENGTH ||
    timestampRaw.length > 32 ||
    signatureRaw.length > MAX_HEADER_LENGTH
  ) {
    return { ok: false, code: "malformed_headers" };
  }

  const timestamp = Number(timestampRaw);
  if (!Number.isInteger(timestamp) || timestamp <= 0) {
    return { ok: false, code: "malformed_headers" };
  }
  if (Math.abs(nowSeconds - timestamp) > RESEND_WEBHOOK_MAX_AGE_SECONDS) {
    return { ok: false, code: "stale_timestamp" };
  }

  const key = decodeSigningSecret(signingSecret);
  if (!key) return { ok: false, code: "missing_secret" };

  const signed = Buffer.concat([Buffer.from(`${webhookId}.${timestamp}.`, "utf8"), rawBody]);
  const expected = createHmac("sha256", key).update(signed).digest();
  const candidates = signatureRaw
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [version, encoded] = entry.split(",", 2);
      return version === "v1" && encoded ? [encoded] : [];
    });

  for (const encoded of candidates) {
    const candidate = Buffer.from(encoded, "base64");
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return { ok: true, webhookId, timestamp };
    }
  }

  return { ok: false, code: "invalid_signature" };
}
