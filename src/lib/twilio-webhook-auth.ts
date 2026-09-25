import type { Request } from "express";
import Twilio from "twilio";
import { resolveCanonicalAppUrl } from "./app-url";
import { LEGACY_PRODUCTION_ORIGIN } from "./brand";
import { isProductionRuntime } from "./session-cookie";

export type TwilioWebhookReject = { ok: false };
export type TwilioWebhookAllow = { ok: true };

function firstHeaderValue(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || "")
    .split(",")[0]
    .trim();
}

function normalizedOrigin(value: string | undefined): string | null {
  const candidate = String(value || "").trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function requestTarget(req: Request): string | null {
  const target = String(req.originalUrl || "");
  return target.startsWith("/") && !target.startsWith("//") ? target : null;
}

function requestUrlAtOrigin(origin: string | null, target: string): string | null {
  return origin ? `${origin}${target}` : null;
}

function resolveTwilioRequestUrl(req: Request): string | null {
  const target = requestTarget(req);
  if (!target) return null;

  const explicitBase = normalizedOrigin(process.env.TWILIO_WEBHOOK_BASE_URL);

  if (isProductionRuntime()) {
    const canonical = resolveCanonicalAppUrl();
    const allowedOrigins = [
      ...("error" in canonical ? [] : [canonical.url]),
      "https://botbound.me",
      LEGACY_PRODUCTION_ORIGIN,
    ]
      .map((origin) => normalizedOrigin(origin))
      .filter((origin): origin is string => Boolean(origin));
    const forwardedHost =
      firstHeaderValue(req.headers["x-forwarded-host"]) || firstHeaderValue(req.headers.host);
    const matchedOrigin = allowedOrigins.find(
      (origin) => new URL(origin).host.toLowerCase() === forwardedHost.toLowerCase(),
    );
    if (matchedOrigin) return requestUrlAtOrigin(matchedOrigin, target);

    // Some trusted proxies replace the public Host. An explicit external base
    // remains a deliberate fallback; deployment policy pins it to BotBound.
    if (explicitBase) {
      return requestUrlAtOrigin(explicitBase, target);
    }
    return null;
  }

  if (explicitBase) return requestUrlAtOrigin(explicitBase, target);

  const protocol = firstHeaderValue(req.headers["x-forwarded-proto"]) || req.protocol || "http";
  const host =
    firstHeaderValue(req.headers["x-forwarded-host"]) || firstHeaderValue(req.headers.host);
  return host ? `${protocol}://${host}${target}` : null;
}

/**
 * Verify a Twilio webhook with Twilio's official SDK. Fails closed whenever the
 * auth token or canonical external URL is unavailable. An explicit dev-only
 * bypass is available through TWILIO_WEBHOOK_DISABLE_AUTH for local tunnels
 * (ngrok/cloudflared), but it is rejected in production and never silently
 * auto-enabled.
 */
export function evaluateTwilioWebhookAuth(
  req: Request,
  authToken: string | undefined = process.env.TWILIO_AUTH_TOKEN,
): TwilioWebhookAllow | TwilioWebhookReject {
  if (req.method !== "POST") return { ok: false };

  if (!authToken) {
    const devBypass = process.env.TWILIO_WEBHOOK_DISABLE_AUTH === "1";
    if (devBypass && !isProductionRuntime()) {
      return { ok: true };
    }
    return { ok: false };
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
