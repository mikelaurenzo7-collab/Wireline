import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const source = fs.readFileSync(path.join(root, "src/lib/webhook-helpers.ts"), "utf8");

describe("webhook delivery truth", () => {
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
  });

  it("persists terminal guard failures instead of returning silently", () => {
    expect(source).toContain('lastError: "webhook_missing"');
    expect(source).toContain('lastError: "secret_decrypt_failed"');
    expect(source).toContain('lastError = "redirect_blocked"');
    expect(source).toContain('lastError = "request_failed"');
  });
});
