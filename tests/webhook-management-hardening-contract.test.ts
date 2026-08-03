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
    expect(source).toContain("id: delivery.id.toString()");
  });

  it("does not retain a broad selected-webhook test fallback", () => {
    expect(source).not.toContain('router.post(\n  "/:id/test"');
    expect(source).not.toContain("dispatchWebhook(req.user.id");
  });
});
