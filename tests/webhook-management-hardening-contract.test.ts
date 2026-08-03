import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/routes/webhook-routes.ts", import.meta.url),
  "utf8",
);

describe("webhook management hardening", () => {
  it("parses PostgreSQL bigint delivery IDs without a JavaScript number round-trip", () => {
    expect(source).toContain("const id = BigInt(raw)");
    expect(source).toContain("POSTGRES_BIGINT_MAX");
    expect(source).not.toContain("BigInt(id)");
    expect(source).not.toMatch(/const id = parseInt\(req\.params\.id\)/);
  });

  it("serializes bigint delivery IDs explicitly", () => {
    expect(source).toContain("id: row.id.toString()");
  });

  it("does not retain a broad selected-webhook test fallback", () => {
    expect(source).not.toContain('router.post(\n  "/:id/test"');
    expect(source).not.toContain("dispatchWebhook(req.user.id");
  });

  it("never returns plaintext or encrypted webhook secret columns", () => {
    expect(source).toContain("function publicWebhookRecord");
    expect(source).toContain("webhook: publicWebhookRecord(data)");
    expect(source).not.toContain("res.json({ webhook: data })");
  });

  it("keeps the established snake_case admin response contract explicit", () => {
    expect(source).toContain("secret_last_four: row.secretLastFour");
    expect(source).toContain("last_status_code: row.lastStatusCode");
    expect(source).toContain('status: row.status === "failed" ? "dead" : row.status');
    expect(source).toContain("webhooks: (webhooks || []).map(publicWebhookRecord)");
    expect(source).toContain("deliveries: (deliveries || []).map(publicDeliveryRecord)");
  });

  it("claims manual replay atomically from failed state only", () => {
    expect(source).toContain('eq(schema.webhookDeliveries.status, "failed")');
    expect(source).toContain('code: "DELIVERY_NOT_FAILED"');
    expect(source).toContain('returning({ id: schema.webhookDeliveries.id })');
  });

  it("treats a pending manual replay request as an idempotent no-op", () => {
    expect(source).toContain('if (owned.status === "pending")');
    expect(source).toContain("This delivery is already pending or in progress.");
  });
});
