import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createWebhookSchema } from "../src/lib/api-validation-base";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("shared number pool is read platform-wide", () => {
  /**
   * The self-serve picker subtracts claimed numbers from the shared Vapi
   * account's listing. The listing is platform-wide; the claimed set was read
   * inside `tenantStore`, where RLS narrows it to the caller's own rows. Every
   * OTHER tenant's live business number therefore came back as "available", and
   * the anti-double-claim guard was checking the same blinded set.
   */
  it("reads the claimed set outside the tenant context, and only the opaque id", () => {
    const routes = read("src/routes/carrier-routes.ts");

    expect(routes).toContain("function selectPlatformClaimedVapiIds()");
    expect(routes).toContain("tenantStore.exit(");
    // Only the provider id may cross the RLS boundary. Selecting the phone
    // number or the owning user here would put tenant data back in reach.
    const helper = routes.slice(
      routes.indexOf("function selectPlatformClaimedVapiIds()"),
      routes.indexOf("* Available numbers in the pool"),
    );
    expect(helper).toContain("select({ vapiId: schema.phoneNumbers.vapiNumberId })");
    expect(helper).not.toContain("phoneNumber:");
    expect(helper).not.toContain("userId:");

    // Both call sites must use it — the picker AND the claim guard. A blinded
    // read left in either place reopens the leak or the double-claim race.
    const uses = routes.match(/selectPlatformClaimedVapiIds\(\)/g) || [];
    expect(uses.length).toBeGreaterThanOrEqual(3); // definition + 2 call sites

    // The query itself must exist exactly ONCE, and inside the helper. A second
    // copy anywhere else in this file is by definition a tenant-blinded read of
    // a platform-wide fact — the original defect.
    const reads = routes.match(/select\(\{ vapiId: schema\.phoneNumbers\.vapiNumberId \}\)/g) || [];
    expect(reads.length).toBe(1);
    expect(helper).toContain("select({ vapiId: schema.phoneNumbers.vapiNumberId })");
  });

  it("keeps the sibling carrier listing scoped to owned lines", () => {
    // /api/carrier/numbers hits the same shared Vapi account and was already
    // fixed by intersecting with owned rows. It must stay that way — it is the
    // route that exposes the internal Vapi id.
    const routes = read("src/routes/carrier-routes.ts");
    expect(routes).toContain("eq(schema.phoneNumbers.userId, req.user.id)");
    expect(routes).toContain("ownedVapiIds.has(num.id) || ownedNumbers.has(num.number)");
  });
});

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
