import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("settings entitlement write lockdown", () => {
  it("rejects entitlement columns via SettingsSchema strip (no passthrough)", () => {
    const contract = read("contracts/api-types.ts");
    const schemaMatch = contract.match(/export const SettingsSchema = z\.object\(\{([\s\S]*?)\}\);/);
    expect(schemaMatch).not.toBeNull();
    const schemaBody = schemaMatch![1];
    expect(contract).not.toMatch(/SettingsSchema[\s\S]*\.passthrough\(\)/);
    expect(schemaBody).not.toContain("trial_ends_at");
    expect(schemaBody).not.toContain("trial_outbound_count");
    expect(schemaBody).not.toContain("live_video_addon_enabled");
    expect(schemaBody).not.toContain("ai_tier");
    expect(schemaBody).not.toContain("signup_plan_interest");
    expect(schemaBody).not.toContain("vapi_private_key");
    expect(contract).toContain("Explicit allowlist of client-writable columns");
  });

  it("filters POST /api/settings through an allowlist, not a deny-list", () => {
    const route = read("src/routes/settings-routes.ts");
    expect(route).toContain("CLIENT_WRITABLE_SETTINGS");
    expect(route).toContain("ADMIN_WRITABLE_SETTINGS");
    expect(route).toContain("pickWritableSettings");
    expect(route).toContain("liveVideoAddonEnabled");
    expect(route).toMatch(/Allowlist only[\s\S]*liveVideoAddonEnabled/);
    // Legacy deny-list alone is insufficient with Drizzle column matching.
    expect(route).not.toMatch(/delete update\.subscriptionStatus;\s*\n\s*delete update\.maxAgents/);
  });

  it("applies Zod parse result onto req.body so strip cannot be bypassed", () => {
    const validate = read("src/middleware/validate.ts");
    expect(validate).toContain("req.body = await schema.parseAsync(req.body)");
  });
});
