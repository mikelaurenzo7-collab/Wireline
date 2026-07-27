import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("round7 launch finetune contracts", () => {
  it("derives onboarding has_voice from provisioned phone numbers, not unused vapi_private_key", () => {
    const settingsRoutes = read("src/routes/settings-routes.ts");
    expect(settingsRoutes).toContain("from(phoneNumbers)");
    expect(settingsRoutes).toContain("has_voice: hasVoice");
    expect(settingsRoutes).toContain('stepId: "connect_voice"');
    expect(settingsRoutes).toContain("ON CONFLICT (user_id, step_id) DO UPDATE");
    expect(settingsRoutes).not.toMatch(
      /has_voice:\s*!!settingsRow\?\.vapiPrivateKey/,
    );
  });

  it("aligns OAuth signed-state TTL with the 10-minute bridge cookie", () => {
    const oauthHelpers = read("src/lib/oauth-helpers.ts");
    const bridge = read("src/lib/oauth-bridge-cookie.ts");
    expect(bridge).toContain("10 * 60 * 1000");
    expect(oauthHelpers).toContain("10 * 60 * 1000");
    expect(oauthHelpers).not.toContain("20 * 60 * 1000");
  });

  it("fail-closes OAuth rate limiting when the distributed limiter is unavailable", () => {
    const rateLimit = read("src/middleware/rate-limit-middleware.ts");
    const oauthBlock = rateLimit.slice(rateLimit.indexOf("oauthRateLimiter"));
    expect(oauthBlock).toContain("refusedForNoDistributedLimiter");
    expect(oauthBlock).toContain("authRateLimitOptions(\"oauth\"");
  });

  it("records failed purge number releases in the platform orphan ledger before hard-delete", () => {
    const deletion = read("src/lib/account-deletion.ts");
    const schema = read("src/db/schema.ts");
    const migration = read("drizzle/migrations/0116_orphan_carrier_resources.sql");
    expect(schema).toContain('pgTable(\n  "wireline_orphan_carrier_resources"');
    expect(deletion).toContain("orphanCarrierResources");
    expect(deletion).toContain("wireline_orphan_carrier_resources");
    expect(deletion).toContain("recording orphan for janitor");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.wireline_orphan_carrier_resources");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON public.wireline_orphan_carrier_resources TO wireline_server");
  });

  it("blocks preview inheritance of webhook base URL, DNC URL, and launch demo mode", () => {
    const boundaries = read("scripts/check-deployment-boundaries.mjs");
    for (const key of [
      "TWILIO_WEBHOOK_BASE_URL",
      "FEDERAL_DNC_API_URL",
      "WIRELINE_LAUNCH_DEMO_MODE",
    ]) {
      expect(boundaries).toContain(`"${key}"`);
    }
  });
});
