import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createWebhookSchema } from "../src/lib/api-validation-base";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("webhook creation contract is satisfiable", () => {
  /**
   * validateBody replaces req.body with zod's parsed output, and z.object
   * strips unknown keys. createWebhookSchema omitted `name`, so the field the
   * handler requires — and that wireline_webhooks.name declares NOT NULL — was
   * deleted from every request before the handler ran. POST /api/webhooks
   * returned 400 for every possible body.
   */
  it("accepts the body the client actually sends", () => {
    const parsed = createWebhookSchema.safeParse({
      name: "Slack #sales",
      url: "https://hooks.slack.com/services/T/B/X",
      events: ["call.completed"],
      secret: "s".repeat(16),
    });
    expect(parsed.success).toBe(true);
    // The name must SURVIVE parsing — that is the whole defect.
    expect(parsed.success && parsed.data.name).toBe("Slack #sales");
    expect(parsed.success && parsed.data.active).toBe(true);
  });

  it("requires the name the NOT NULL column and handler both demand", () => {
    const missing = createWebhookSchema.safeParse({
      url: "https://example.com/hook",
      events: ["call.completed"],
    });
    expect(missing.success).toBe(false);
  });

  it("names the active flag the way the handler and update schema read it", () => {
    // The schema called it `isActive` while the handler destructured `active`,
    // so an explicit `active: false` was stripped and silently defaulted true by
    // `active ?? true` — a paused webhook would have been created live.
    const parsed = createWebhookSchema.safeParse({
      name: "Paused hook",
      url: "https://example.com/hook",
      events: ["call.completed"],
      active: false,
    });
    expect(parsed.success && parsed.data.active).toBe(false);
    expect(parsed.success && "isActive" in parsed.data).toBe(false);
  });

  it("publishes a contract a client can actually satisfy", () => {
    // The OpenAPI block advertised `description` and `enabled`, which no layer
    // reads, and omitted the required `name`. A caller following the published
    // spec could only ever get a 400.
    const spec = read("src/lib/openapi-spec.ts");
    const block = spec.slice(
      spec.indexOf('operationId: "createWebhook"'),
      spec.indexOf(
        '"400": COMMON_ERROR_RESPONSES["400"]',
        spec.indexOf('operationId: "createWebhook"'),
      ),
    );
    expect(block).toContain('required: ["name", "url", "events"]');
    expect(block).toContain("name: {");
    expect(block).toContain("active: {");
    expect(block).not.toContain("enabled:");
    expect(block).not.toMatch(/^\s+description: \{ type: "string" \},$/m);
  });
});
