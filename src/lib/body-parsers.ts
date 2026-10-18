/**
 * Centralized webhook body parsers.
 *
 * Vendor webhooks sign the request body before delivery. Signed routes must
 * therefore mount their dedicated parser before the global JSON parser. This
 * module is the single source of truth for that ordering and for conservative
 * request-size ceilings on unauthenticated provider callbacks.
 */
import express from "express";

/** Express app surface used by the parser installer. */
type ExpressApp = ReturnType<typeof express>;

const RAW_WEBHOOK_LIMIT = "1mb";
const RESEND_WEBHOOK_LIMIT = "256kb";
const OPENAI_REALTIME_WEBHOOK_LIMIT = "256kb";
const AGENTMAIL_WEBHOOK_LIMIT = "1mb";
const TWILIO_WEBHOOK_LIMIT = "256kb";

/**
 * Mount vendor parsers before ordinary application JSON parsing.
 *
 * Adding a webhook must happen here so raw-body requirements and payload caps
 * stay reviewable in one place.
 */
export function installWebhookBodyParsers(app: ExpressApp): void {
  // Stripe — raw JSON, signed with Stripe-Signature.
  app.use(
    "/api/stripe-webhook",
    express.raw({ type: "application/json", limit: RAW_WEBHOOK_LIMIT }),
  );

  // Resend / Standard Webhooks — raw JSON signed across the untouched bytes.
  app.use(
    "/api/webhooks/resend",
    express.raw({ type: "application/json", limit: RESEND_WEBHOOK_LIMIT }),
  );

  // OpenAI Realtime SIP incoming-call events use Standard Webhooks signing.
  // The verifier signs the exact bytes, so this parser must stay before the
  // global JSON middleware and must never parse/re-stringify the body first.
  app.use(
    "/api/webhooks/openai/realtime",
    express.raw({ type: "application/json", limit: OPENAI_REALTIME_WEBHOOK_LIMIT }),
  );

  // xAI Grok Voice SIP incoming-call events use the same Standard Webhooks
  // envelope, signed with each registered number's own secret.
  app.use(
    "/api/webhooks/xai/realtime",
    express.raw({ type: "application/json", limit: OPENAI_REALTIME_WEBHOOK_LIMIT }),
  );

  // AgentMail / Svix — signed raw JSON. AgentMail documents a 1 MB payload
  // ceiling and omits oversized body fields at that boundary, so accepting
  // less here would reject otherwise-valid provider deliveries.
  app.use(
    "/api/webhooks/agentmail",
    express.raw({ type: "application/json", limit: AGENTMAIL_WEBHOOK_LIMIT }),
  );

  // Meta Lead Ads and data-deletion callbacks — raw bytes for HMAC validation.
  app.use("/api/webhooks/meta/leads", express.raw({ type: "*/*", limit: RAW_WEBHOOK_LIMIT }));
  app.use("/api/webhooks/meta/deletion", express.raw({ type: "*/*", limit: RAW_WEBHOOK_LIMIT }));

  // Twilio voice and messaging callbacks are form encoded. Keep extended=false
  // so signature validation receives a flat parameter object, and cap both the
  // body size and parameter count to reduce unauthenticated parsing exposure.
  app.use(
    "/api/twilio-webhook",
    express.urlencoded({
      extended: false,
      limit: TWILIO_WEBHOOK_LIMIT,
      parameterLimit: 128,
    }),
  );
}
