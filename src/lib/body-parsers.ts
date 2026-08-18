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
const XAI_VOICE_WEBHOOK_LIMIT = "256kb";
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

  // xAI Direct SIP incoming-call events use Standard Webhooks HMAC signing.
  // The verifier signs the exact bytes, so this parser must stay before the
  // global JSON middleware and must never parse/re-stringify the body first.
  app.use(
    "/api/webhooks/xai/voice",
    express.raw({ type: "application/json", limit: XAI_VOICE_WEBHOOK_LIMIT }),
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

  // Legacy Vapi webhook — retained only during the rollback certification
  // window. Native xAI/Twilio traffic never enters this parser or route.
  app.use(
    "/api/vapi-webhook",
    express.json({
      limit: "2mb",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      verify: (req: any, _res: any, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
}
