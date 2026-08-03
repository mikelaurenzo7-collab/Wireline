import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const source = fs.readFileSync(path.join(root, "src/lib/webhook-helpers.ts"), "utf8");

describe("webhook delivery truth", () => {
  it("leases a pending delivery atomically before external work", () => {
    const claim = source.indexOf("const nextAttempts = await claimWebhookDelivery");
    const fetch = source.indexOf("drizzle.query.webhookDeliveries.findFirst");
    const network = source.indexOf("await fetchWithTimeout");

    expect(source).toContain("WEBHOOK_DELIVERY_LEASE_MS");
    expect(source).toContain("async function claimWebhookDelivery");
    expect(source).toContain("coalesce(${schema.webhookDeliveries.attempts}, 0) + 1");
    expect(source).toContain("eq(schema.webhookDeliveries.status, WEBHOOK_DELIVERY_PENDING)");
    expect(source).toContain("lte(schema.webhookDeliveries.nextAttemptAt, now)");
    expect(source).toContain("if (nextAttempts === null) return");
    expect(claim).toBeGreaterThan(-1);
    expect(fetch).toBeGreaterThan(claim);
    expect(network).toBeGreaterThan(fetch);
  });

  it("records delivery timestamps and clears stale errors on success", () => {
    expect(source).toContain("deliveredAt: outcome.deliveredAt");
    expect(source).toContain("const deliveredAt = success ? new Date() : null");
    expect(source).toContain("lastError: outcome.lastError");
    expect(source).toContain("lastError = success ? null : `http_${response.status}`");
  });

  it("updates the selected endpoint summary in the same transaction", () => {
    expect(source).toContain("await drizzle.transaction(async (tx) =>");
    expect(source).toContain("lastTriggeredAt: attemptedAt");
    expect(source).toContain("lastStatus: outcome.statusCode");
    expect(source).toContain("coalesce(${schema.webhooks.deliveryCount}, 0) + 1");
    expect(source).toContain(".where(eq(schema.webhooks.id, outcome.webhookId))");
  });

  it("persists terminal guard failures instead of returning silently", () => {
    expect(source).toContain('lastError: "webhook_missing"');
    expect(source).toContain('lastError: "secret_decrypt_failed"');
    expect(source).toContain('lastError = "redirect_blocked"');
    expect(source).toContain('lastError = "request_failed"');
  });
});
