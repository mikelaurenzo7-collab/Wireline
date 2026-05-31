/**
 * Centralised body-parser wiring for the Express app.
 *
 * Order matters and is the whole point of this module: provider webhooks that
 * verify a signature over the *exact* received bytes (Stripe, Meta, ElevenLabs)
 * must have their `express.raw()` parser registered BEFORE the global
 * `express.json()` middleware. If `express.json()` runs first it consumes the
 * request stream and sets `req._body = true`, so the route-scoped raw parser
 * gets nothing and `req.body` ends up as a parsed object — breaking HMAC
 * verification (re-serialising a parsed object is not byte-identical to the
 * original payload). Likewise Twilio posts `application/x-www-form-urlencoded`,
 * so it needs `express.urlencoded()` registered before the global JSON parser.
 *
 * Keeping this in one function lets the server and the regression tests mount
 * the identical stack, so router-only tests can no longer mask an ordering bug.
 */
import express from "express";

export function installBodyParsers(app: ReturnType<typeof express>): void {
  // ── Raw-body webhooks (signature verification needs the exact bytes) ──
  // These MUST precede the global express.json() below.
  app.use("/api/stripe-webhook", express.raw({ type: "application/json" }));
  app.use("/api/webhooks/meta/leads", express.raw({ type: "*/*" }));
  app.use("/api/webhooks/meta/deletion", express.raw({ type: "*/*" }));
  app.use("/api/webhooks/elevenlabs", express.raw({ type: "*/*" }));

  // ── Form-encoded webhooks ──
  // Twilio posts application/x-www-form-urlencoded; without this req.body is
  // empty and STOP/START keyword handling (TCPA opt-out) silently breaks.
  app.use("/api/twilio-webhook", express.urlencoded({ extended: false }));

  // ── Scoped + global JSON parsers ──
  app.use("/api/claude/knowledge-from-document", express.json({ limit: "50mb" }));
  app.use("/api/outbound/bulk", express.json({ limit: "16mb" }));
  app.use(express.json({ limit: "1mb" }));
}
