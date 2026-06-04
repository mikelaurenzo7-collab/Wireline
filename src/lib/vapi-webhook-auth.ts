import type { Request } from "express";
import { timingSafeEqual } from "node:crypto";
import { isProductionRuntime } from "./session-cookie";

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
