import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export type XAIWebhookHeaders = {
  webhookId: string;
  webhookTimestamp: string;
  webhookSignature: string;
};

export type XAIWebhookVerification =
  | { ok: true; webhookId: string; timestamp: number }
  | {
      ok: false;
      reason:
        | "missing_headers"
        | "invalid_timestamp"
        | "expired"
        | "invalid_secret"
        | "invalid_signature";
    };

function decodeSigningSecret(secret: string): Buffer | null {
  const trimmed = secret.trim();
  if (!trimmed) return null;
  const encoded = trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : trimmed;
  if (!encoded) return null;

  try {
    const decoded = Buffer.from(encoded, "base64");
    if (decoded.length >= 16) return decoded;
  } catch {
    // Some private-beta secrets may be delivered as opaque text. The fallback
    // keeps verification compatible without ever logging or exposing the key.
  }

  const utf8 = Buffer.from(encoded, "utf8");
  return utf8.length >= 16 ? utf8 : null;
}

function signatureCandidates(header: string): Buffer[] {
  return header
    .split(/[\s]+/)
    .flatMap((entry) => entry.split(";"))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const comma = entry.indexOf(",");
      const version = comma >= 0 ? entry.slice(0, comma) : "";
      const encoded = comma >= 0 ? entry.slice(comma + 1) : "";
      if (version !== "v1" || !encoded) return null;
      try {
        const value = Buffer.from(encoded, "base64");
        return value.length ? value : null;
      } catch {
        return null;
      }
    })
    .filter((value): value is Buffer => Boolean(value));
}

function equalDigest(expected: Buffer, candidate: Buffer): boolean {
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

/**
 * Verify xAI's Standard Webhooks HMAC envelope.
 *
 * The signature covers the exact UTF-8 body as
 * `webhook-id.webhook-timestamp.raw-payload`. The raw body parser must run
 * before any JSON parser; parsing and re-stringifying the payload invalidates
 * the signature.
 */
export function verifyXAIWebhook(input: {
  rawBody: Buffer;
  headers: XAIWebhookHeaders;
  signingSecret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): XAIWebhookVerification {
  const webhookId = input.headers.webhookId.trim();
  const timestampText = input.headers.webhookTimestamp.trim();
  const signatureHeader = input.headers.webhookSignature.trim();
  if (!webhookId || !timestampText || !signatureHeader) {
    return { ok: false, reason: "missing_headers" };
  }

  const timestamp = Number(timestampText);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const tolerance = Math.max(30, input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS);
  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - timestamp) > tolerance) {
    return { ok: false, reason: "expired" };
  }

  const key = decodeSigningSecret(input.signingSecret);
  if (!key) return { ok: false, reason: "invalid_secret" };

  const signedContent = Buffer.concat([
    Buffer.from(`${webhookId}.${timestampText}.`, "utf8"),
    input.rawBody,
  ]);
  const expected = createHmac("sha256", key).update(signedContent).digest();
  const valid = signatureCandidates(signatureHeader).some((candidate) =>
    equalDigest(expected, candidate),
  );
  return valid
    ? { ok: true, webhookId, timestamp }
    : { ok: false, reason: "invalid_signature" };
}
