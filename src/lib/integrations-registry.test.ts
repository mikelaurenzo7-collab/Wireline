import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./claude-brain", () => ({
  isClaudeAvailable: vi.fn(() => true),
}));

describe("integrations registry", () => {
  const ENV = process.env;

  beforeEach(() => {
    process.env = { ...ENV };
    delete process.env.SALESFORCE_INSTANCE_URL;
    delete process.env.SALESFORCE_ACCESS_TOKEN;
    delete process.env.SALESFORCE_CLIENT_ID;
    delete process.env.SALESFORCE_CLIENT_SECRET;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = ENV;
  });

  it("marks Salesforce configured when the runtime sync env vars are present", async () => {
    process.env.SALESFORCE_INSTANCE_URL = "https://example.my.salesforce.com";
    process.env.SALESFORCE_ACCESS_TOKEN = "sf-token";

    const { getIntegrationsStatus } = await import("./integrations-registry");
    const salesforce = getIntegrationsStatus().find((entry) => entry.id === "salesforce");

    expect(salesforce?.status).toBe("configured");
    expect(salesforce?.envVars).toEqual([
      { name: "SALESFORCE_INSTANCE_URL", present: true },
      { name: "SALESFORCE_ACCESS_TOKEN", present: true },
    ]);
  });

  it("marks Salesforce fallback when only Connected App credentials are present", async () => {
    process.env.SALESFORCE_CLIENT_ID = "client-id";
    process.env.SALESFORCE_CLIENT_SECRET = "client-secret";

    const { getIntegrationsStatus } = await import("./integrations-registry");
    const salesforce = getIntegrationsStatus().find((entry) => entry.id === "salesforce");

    expect(salesforce?.status).toBe("fallback");
  });

  it("surfaces the service-role key in Supabase integration health", async () => {
    const { getIntegrationsStatus } = await import("./integrations-registry");
    const supabase = getIntegrationsStatus().find((entry) => entry.id === "supabase");

    expect(supabase?.envVars.map((entry) => entry.name)).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("marks Twilio configured when SID and auth token are present", async () => {
    process.env.TWILIO_ACCOUNT_SID = "AC123";
    process.env.TWILIO_AUTH_TOKEN = "twilio-token";

    const { getIntegrationsStatus } = await import("./integrations-registry");
    const twilio = getIntegrationsStatus().find((entry) => entry.id === "twilio");

    expect(twilio?.status).toBe("configured");
    expect(twilio?.envVars).toEqual([
      { name: "TWILIO_ACCOUNT_SID", present: true },
      { name: "TWILIO_AUTH_TOKEN", present: true },
    ]);
  });
});
