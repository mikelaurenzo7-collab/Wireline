import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RESEND_WEBHOOK_MAX_AGE_SECONDS,
  verifyResendWebhookSignature,
} from "../src/lib/resend-webhook-signature";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function signingFixture(payload: Buffer, timestamp = 1_800_000_000) {
  const key = Buffer.from("wireline-resend-webhook-test-secret-2026", "utf8");
  const secret = `whsec_${key.toString("base64")}`;
  const webhookId = "msg_wireline_resend_test_1";
  const digest = createHmac("sha256", key)
    .update(Buffer.concat([Buffer.from(`${webhookId}.${timestamp}.`), payload]))
    .digest("base64");
  return {
    secret,
    webhookId,
    timestamp,
    headers: {
      "svix-id": webhookId,
      "svix-timestamp": String(timestamp),
      "svix-signature": `v1,${digest}`,
    },
  } as const;
}

describe("Resend delivery-feedback contract", () => {
  it("verifies the exact raw payload and rejects tampering", () => {
    const body = Buffer.from('{"type":"email.bounced","data":{"email_id":"em_1"}}');
    const fixture = signingFixture(body);

    expect(
      verifyResendWebhookSignature(body, fixture.headers, fixture.secret, fixture.timestamp),
    ).toEqual({ ok: true, webhookId: fixture.webhookId, timestamp: fixture.timestamp });

    expect(
      verifyResendWebhookSignature(
        Buffer.from(`${body.toString("utf8")} `),
        fixture.headers,
        fixture.secret,
        fixture.timestamp,
      ),
    ).toEqual({ ok: false, code: "invalid_signature" });
  });

  it("rejects missing signatures and stale replay attempts", () => {
    const body = Buffer.from("{}");
    const fixture = signingFixture(body);

    expect(verifyResendWebhookSignature(body, {}, fixture.secret, fixture.timestamp)).toEqual({
      ok: false,
      code: "missing_headers",
    });
    expect(
      verifyResendWebhookSignature(
        body,
        fixture.headers,
        fixture.secret,
        fixture.timestamp + RESEND_WEBHOOK_MAX_AGE_SECONDS + 1,
      ),
    ).toEqual({ ok: false, code: "stale_timestamp" });
  });

  it("authenticates before parsing or database processing", () => {
    const parser = read("src/lib/body-parsers.ts");
    const route = read("src/routes/resend-webhook-routes.ts");
    const sameOrigin = read("src/middleware/same-origin.ts");
    const authzGenerator = read("scripts/generate-authz-matrix.ts");
    const verifyAt = route.indexOf("verifyResendWebhookSignature(");
    const processAt = route.indexOf("processVerifiedResendWebhook(");

    expect(parser).toContain('"/api/webhooks/resend"');
    expect(parser).toContain('express.raw({ type: "application/json", limit: RESEND_WEBHOOK_LIMIT })');
    expect(sameOrigin).toContain('"/api/webhooks/resend"');
    expect(verifyAt).toBeGreaterThanOrEqual(0);
    expect(processAt).toBeGreaterThan(verifyAt);
    expect(route.slice(0, processAt)).not.toContain("JSON.parse");
    for (const code of [
      "INVALID_CONTENT_TYPE",
      "RAW_WEBHOOK_BODY_REQUIRED",
      "WEBHOOK_VERIFICATION_UNAVAILABLE",
      "INVALID_WEBHOOK_SIGNATURE",
      "MALFORMED_WEBHOOK_PAYLOAD",
    ]) {
      expect(route).toContain(`code: "${code}"`);
    }
    expect(authzGenerator).toContain('/^\\/api\\/webhooks\\/resend$/');
    expect(authzGenerator).toContain(
      "Resend/Svix timestamped HMAC-SHA256 signature + replay window",
    );
  });

  it("suppresses only permanent recipient-risk events", () => {
    const processor = read("src/lib/resend-webhook.ts");
    expect(processor).toContain('case "email.bounced"');
    expect(processor).toContain('case "email.complained"');
    expect(processor).toContain('case "email.suppressed"');
    expect(processor).toContain('eventType === "email.delivery_delayed"');
    expect(processor).toContain('eventType === "email.failed"');

    const permanentBlock = processor.slice(
      processor.indexOf("export function resendPermanentSuppressionReason"),
      processor.indexOf("export function resendEventDetailCode"),
    );
    expect(permanentBlock).not.toContain("email.delivery_delayed");
    expect(permanentBlock).not.toContain("email.failed");
  });

  it("keeps provider delivery risk separate from user unsubscribe preference", () => {
    const delivery = read("src/lib/email-delivery-suppression.ts");
    const migration = read("drizzle/migrations/0142_resend_delivery_feedback.sql");

    expect(delivery).toContain("recordProviderDeliverySuppression");
    expect(delivery).toContain("recordEmailSuppression(normalized, reason)");
    expect(delivery).toContain("isProviderDeliverySuppressed");
    expect(migration).toContain("wireline_email_delivery_suppressions");
    expect(migration).toContain("wireline_resend_webhook_events");
    expect(migration).toContain("webhook_id        text PRIMARY KEY");
  });

  it("persists bounded operational metadata, never rendered message content", () => {
    const migration = read("drizzle/migrations/0142_resend_delivery_feedback.sql");
    const processor = read("src/lib/resend-webhook.ts");

    for (const forbidden of ["subject", "html", "text_body", "rendered_body", "raw_payload"]) {
      expect(migration.toLowerCase()).not.toContain(forbidden);
    }
    expect(processor).toContain("recipientCount");
    expect(processor).toContain("suppressionCount");
    expect(processor).toContain("detailCode");
  });

  it("makes every platform Resend send preflight provider delivery suppression", () => {
    const emailService = read("src/lib/email-service.ts");
    const sender = emailService.slice(
      emailService.indexOf("async function sendViaResend"),
      emailService.indexOf("export async function sendEmail"),
    );
    expect(emailService).toContain('from "./email-delivery-suppression"');
    expect(sender).toContain("isProviderDeliverySuppressed(args.to)");
    expect(sender.indexOf("isProviderDeliverySuppressed(args.to)")).toBeLessThan(
      sender.indexOf('fetch("https://api.resend.com/emails"'),
    );
    expect(sender).toContain("Provider delivery suppression check failed");

    const supportRoute = read("src/routes/support-routes.ts");
    expect(supportRoute).toContain('from "../lib/email-delivery-suppression"');
    expect(supportRoute).toContain("isProviderDeliverySuppressed(args.to)");
    expect(supportRoute.indexOf("isProviderDeliverySuppressed(args.to)")).toBeLessThan(
      supportRoute.indexOf('fetch("https://api.resend.com/emails"'),
    );
    expect(supportRoute).toContain("Email delivery safety check unavailable");
  });

  it("fails closed before public support intake can create unbounded provider work", () => {
    const supportRoute = read("src/routes/support-routes.ts");
    expect(supportRoute).toContain('from "../lib/rate-limit"');
    expect(supportRoute).toContain("distributedLimiterStatus()");
    expect(supportRoute).toContain("failClosedOnError: true");
    expect(supportRoute).toContain('code: "RATE_LIMITER_ERROR"');
    expect(supportRoute).toContain('code: "SUPPORT_RATE_LIMITED"');
    expect(supportRoute).toContain("normalizeEmail(email)");
    expect(supportRoute).toContain("const cleanSubject = subject.trim()");
    expect(supportRoute).toContain("const cleanBody = body.trim()");
    expect(supportRoute).not.toContain("Tracked in-memory");
  });

  it("makes production activation explicit and keeps live Resend credentials production-only", () => {
    const readiness = read("scripts/check-resend-webhook-readiness.mjs");
    const sync = read("scripts/sync-resend-env-to-vercel.mjs");
    const docs = read("docs/RESEND_DELIVERY_FEEDBACK.md");
    const build = read("scripts/vercel-build.mjs");
    const envExample = read(".env.example");

    expect(readiness).toContain("RESEND_WEBHOOK_SECRET");
    expect(readiness).toContain("https://trywireline.com/api/webhooks/resend");
    expect(sync).toContain('const PRODUCTION_TARGET = ["production"]');
    expect(sync).not.toContain("ALL_TARGETS");
    expect(sync).toContain(
      '{ key: "RESEND_API_KEY", value: resendKey, targets: PRODUCTION_TARGET }',
    );
    expect(sync).toContain('key: "RESEND_WEBHOOK_SECRET"');
    expect(sync).toContain("envEntries.length === 0");
    expect(envExample).toContain("RESEND_WEBHOOK_SECRET=");
    expect(envExample).toMatch(/Production-only Svix\/Resend signing secret/i);
    expect(build).toContain("check-resend-webhook-readiness.mjs");
    expect(build).toContain("tests/resend-webhook-feedback-contract.test.ts");

    for (const eventType of [
      "email.bounced",
      "email.complained",
      "email.suppressed",
      "email.failed",
      "email.delivery_delayed",
    ]) {
      expect(docs).toContain(eventType);
    }
    expect(docs).toMatch(/production(?:-| )only/i);
    expect(docs).toContain("code path launch-ready");
  });
});
