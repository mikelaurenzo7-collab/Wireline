import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./claude-brain", () => ({
  isClaudeAvailable: vi.fn(() => true),
}));

describe("integrations registry", () => {
  const ENV = process.env;

  beforeEach(() => {
    process.env = { ...ENV };
    delete process.env.SALESFORCE_CLIENT_ID;
    delete process.env.SALESFORCE_CLIENT_SECRET;
    delete process.env.HUBSPOT_CLIENT_ID;
    delete process.env.HUBSPOT_CLIENT_SECRET;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = ENV;
  });

  it("marks Salesforce configured when OAuth credentials are present", async () => {
    process.env.SALESFORCE_CLIENT_ID = "client-id";
    process.env.SALESFORCE_CLIENT_SECRET = "client-secret";

    const { getIntegrationsStatus } = await import("./integrations-registry");
    const salesforce = getIntegrationsStatus().find((entry) => entry.id === "salesforce");

    expect(salesforce?.status).toBe("configured");
    expect(salesforce?.envVars).toEqual([
      { name: "SALESFORCE_CLIENT_ID", present: true },
      { name: "SALESFORCE_CLIENT_SECRET", present: true },
    ]);
  });

  it("marks HubSpot configured when OAuth credentials are present", async () => {
    process.env.HUBSPOT_CLIENT_ID = "hs-client-id";
    process.env.HUBSPOT_CLIENT_SECRET = "hs-client-secret";

    const { getIntegrationsStatus } = await import("./integrations-registry");
    const hubspot = getIntegrationsStatus().find((entry) => entry.id === "hubspot");

    expect(hubspot?.status).toBe("configured");
    expect(hubspot?.envVars).toEqual([
      { name: "HUBSPOT_CLIENT_ID", present: true },
      { name: "HUBSPOT_CLIENT_SECRET", present: true },
    ]);
  });

  it("marks Salesforce missing when OAuth credentials absent", async () => {
    const { getIntegrationsStatus } = await import("./integrations-registry");
    const salesforce = getIntegrationsStatus().find((entry) => entry.id === "salesforce");

    expect(salesforce?.status).toBe("missing");
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
