/**
 * Centralized webhook body parsers.
 *
 * Vendor webhooks (Stripe, Meta, ElevenLabs, Twilio, …) sign their
 * payloads against the *raw* request bytes. If `express.json()` runs
 * first the stream is already consumed and the parsed object is not
 * byte-identical to what the vendor signed — HMAC verification then
 * silently fails and the webhook becomes a no-op.
 *
 * The fix is to mount the per-route raw/urlencoded parsers BEFORE the
 * global `express.json()`. This module is the single source of truth
 * for that ordering so `server.ts` can't accidentally drift.
 *
 * Mount order in server.ts:
 *
 *   installWebhookBodyParsers(app);            // raw / urlencoded for vendors
 *   app.use(assertSameOrigin);                  // reject unsafe mutations first
 *   app.use(express.json({ limit: "6mb" }));   // ordinary application JSON
 *
 * The 6 MB Express ceiling is not a media-upload allowance. Vercel Functions
 * enforce a lower platform request ceiling, so browser media flows must stay
 * below that limit or upload directly to object storage.
 *
 * Adding a new webhook? Register its parser here, not inline at the
 * route, so the ordering invariant stays visible in one place.
 */
import express from "express";

/**
 * Express app surface we depend on. Typed loosely because the repo's
 * env-shim already models the same module.
 */
type ExpressApp = ReturnType<typeof express>;

/**
 * Per-path body parser registrations for vendor webhooks. Mounted at
 * the path level (so siblings of the same router that *do* expect
 * JSON still get JSON downstream).
 *
 * `type: "*\/*"` is intentional — vendors occasionally POST with
 * `application/x-www-form-urlencoded` or no `Content-Type` at all,
 * and we want the raw bytes regardless.
 */
export function installWebhookBodyParsers(app: ExpressApp): void {
  // Stripe — raw JSON, signed with Stripe-Signature header.
  app.use("/api/stripe-webhook", express.raw({ type: "application/json" }));

  // Meta (Facebook) Lead Ads — signed with X-Hub-Signature-256 over raw body.
  app.use("/api/webhooks/meta/leads", express.raw({ type: "*/*" }));
  // Meta data-deletion callback — form-urlencoded `signed_request` blob;
  // we parse it ourselves from the raw body to verify the HMAC.
  app.use("/api/webhooks/meta/deletion", express.raw({ type: "*/*" }));

  // ElevenLabs voice-clone callbacks — HMAC-SHA256 over raw body in
  // xi-webhook-signature header.
  app.use("/api/webhooks/elevenlabs", express.raw({ type: "*/*" }));

  app.use("/api/twilio-webhook", express.urlencoded({ extended: false }));

  // Vapi webhook — JSON parser with verify callback to populate req.rawBody for signature verification.
  app.use(
    "/api/vapi-webhook",
    express.json({
      limit: "2mb",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      verify: (req: any, _res: any, buf: any) => {
        req.rawBody = buf;
      },
    }),
  );
}
