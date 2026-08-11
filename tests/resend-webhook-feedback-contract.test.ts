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
    const verifyAt = route.indexOf("verifyResendWebhookSignature(");
    const processAt = route.indexOf("processVerifiedResendWebhook(");

    expect(parser).toContain('"/api/webhooks/resend"');
    expect(parser).toContain('express.raw({ type: "application/json", limit: RESEND_WEBHOOK_LIMIT })');
    expect(verifyAt).toBeGreaterThanOrEqual(0);
    expect(processAt).toBeGreaterThan(verifyAt);
    expect(route.slice(0, processAt)).not.toContain("JSON.parse");
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
  });
});
