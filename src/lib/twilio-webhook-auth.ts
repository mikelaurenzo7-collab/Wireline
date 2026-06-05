import type { Request } from "express";
import Twilio from "twilio";
import { isProductionRuntime } from "./session-cookie";

export type TwilioWebhookReject = { ok: false };
export type TwilioWebhookAllow = { ok: true };

/**
 * Verify Twilio SMS webhook signature. Fails closed in production when
 * TWILIO_AUTH_TOKEN is unset; dev allows passthrough without a token.
 */
export function evaluateTwilioWebhookAuth(
  req: Request,
  authToken: string | undefined = process.env.TWILIO_AUTH_TOKEN,
): TwilioWebhookAllow | TwilioWebhookReject {
  if (!authToken) {
    return isProductionRuntime() ? { ok: false } : { ok: true };
  }
  const signature = req.headers["x-twilio-signature"] as string | undefined;
  if (!signature) return { ok: false };

  const protocol = (req.headers["x-forwarded-proto"] as string | undefined) || req.protocol;
  const host = (req.headers["host"] as string | undefined) || "";
  const url = `${protocol}://${host}${req.originalUrl}`;

  const valid = Twilio.validateRequest(authToken, signature, url, req.body || {});
  return valid ? { ok: true } : { ok: false };
}
