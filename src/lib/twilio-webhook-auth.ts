import type { Request } from "express";
import Twilio from "twilio";
import { resolveCanonicalAppUrl } from "./app-url";
import { isProductionRuntime } from "./session-cookie";

export type TwilioWebhookReject = { ok: false };
export type TwilioWebhookAllow = { ok: true };

function firstHeaderValue(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || "")
    .split(",")[0]
    .trim();
}

function resolveTwilioRequestUrl(req: Request): string | null {
  const explicitBase = String(process.env.TWILIO_WEBHOOK_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (explicitBase) {
    try {
      return new URL(req.originalUrl, `${explicitBase}/`).toString();
    } catch {
      return null;
    }
  }

  if (isProductionRuntime()) {
    const canonical = resolveCanonicalAppUrl();
    if ("error" in canonical) return null;
    try {
      return new URL(req.originalUrl, `${canonical.url}/`).toString();
    } catch {
      return null;
    }
  }

  const protocol = firstHeaderValue(req.headers["x-forwarded-proto"]) || req.protocol || "http";
  const host =
    firstHeaderValue(req.headers["x-forwarded-host"]) || firstHeaderValue(req.headers.host);
  return host ? `${protocol}://${host}${req.originalUrl}` : null;
}

/**
 * Verify a Twilio webhook with Twilio's official SDK. Production fails closed
 * when the auth token or canonical external URL is unavailable. Development
 * may pass through only when no auth token has been configured.
 */
export function evaluateTwilioWebhookAuth(
  req: Request,
  authToken: string | undefined = process.env.TWILIO_AUTH_TOKEN,
): TwilioWebhookAllow | TwilioWebhookReject {
  if (req.method !== "POST") return { ok: false };

  if (!authToken) {
    return isProductionRuntime() ? { ok: false } : { ok: true };
  }

  const signature = firstHeaderValue(req.headers["x-twilio-signature"]);
  if (!signature) return { ok: false };

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const expectedAccountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const receivedAccountSid =
    typeof body.AccountSid === "string" ? String(body.AccountSid).trim() : "";
  if (expectedAccountSid && receivedAccountSid && receivedAccountSid !== expectedAccountSid) {
    return { ok: false };
  }

  const url = resolveTwilioRequestUrl(req);
  if (!url) return { ok: false };

  return Twilio.validateRequest(authToken, signature, url, body) ? { ok: true } : { ok: false };
}
