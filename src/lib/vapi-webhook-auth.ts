import type { Request } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isProductionRuntime } from "./session-cookie";

export type VapiWebhookReject = { ok: false; status: 503 | 401; error: string };
export type VapiWebhookAllow = { ok: true };

/** Main /api/vapi-webhook gate — 503 when secret missing in prod, 401 on bad signature. */
export function evaluateVapiWebhookAuth(req: Request): VapiWebhookAllow | VapiWebhookReject {
  if (!process.env.VAPI_WEBHOOK_SECRET) {
    if (isProductionRuntime()) {
      return { ok: false, status: 503, error: "Webhook auth not configured." };
    }
    return { ok: true };
  }
  if (!vapiWebhookSecretOk(req)) {
    return { ok: false, status: 401, error: "Invalid webhook signature." };
  }
  return { ok: true };
}

function timingSafeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function getRawBody(req: Request): Buffer | null {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (Buffer.isBuffer(raw)) return raw;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body && typeof req.body === "object") return Buffer.from(JSON.stringify(req.body));
  return null;
}

function verifyVapiHmac(req: Request, expectedSecret: string): boolean {
  // Vapi supports HMAC credential auth with optional timestamp replay protection
  // (docs.vapi.ai/server-url/server-authentication, checked 2026-06-08).
  const signature = (req.headers["x-vapi-signature"] || req.headers["x-webhook-signature"]) as
    | string
    | undefined;
  const timestamp = (req.headers["x-vapi-timestamp"] || req.headers["x-webhook-timestamp"]) as
    | string
    | undefined;
  if (!signature || !timestamp) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const ageMs = Math.abs(Date.now() - ts * 1000);
  if (ageMs > 5 * 60 * 1000) return false;

  const rawBody = getRawBody(req);
  if (!rawBody) return false;
  const signed = Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]);
  const hex = createHmac("sha256", expectedSecret).update(signed).digest("hex");
  const base64 = createHmac("sha256", expectedSecret).update(signed).digest("base64");
  const candidates = [
    hex,
    `sha256=${hex}`,
    base64,
    `sha256=${base64}`,
    `v1=${hex}`,
    `v1=${base64}`,
  ];
  return candidates.some((candidate) => timingSafeStringEqual(signature, candidate));
}

/** Verify Vapi webhook auth. Prefer timestamped HMAC; allow legacy x-vapi-secret token. */
export function vapiWebhookSecretOk(req: Request): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET || "";
  if (!expected) {
    return !isProductionRuntime();
  }
  if (verifyVapiHmac(req, expected)) return true;
  const provided = (req.headers["x-vapi-secret"] as string | undefined) || "";
  return timingSafeStringEqual(provided, expected);
}
