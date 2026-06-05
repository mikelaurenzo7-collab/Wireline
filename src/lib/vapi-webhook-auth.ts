import type { Request } from "express";
import { timingSafeEqual } from "node:crypto";
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

/** Verify Vapi webhook secret headers (timing-safe). Fails closed in production when unset. */
export function vapiWebhookSecretOk(req: Request): boolean {
  const expected = process.env.VAPI_WEBHOOK_SECRET || "";
  if (!expected) {
    return !isProductionRuntime();
  }
  const provided =
    (req.headers["x-vapi-secret"] as string | undefined) ||
    (req.headers["x-vapi-signature"] as string | undefined) ||
    "";
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}
