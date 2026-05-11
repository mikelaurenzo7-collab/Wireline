import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  searchSalesforceContacts: vi.fn(),
  logSalesforceCall: vi.fn(),
  createSalesforceOpportunity: vi.fn(),
  searchHubSpotContacts: vi.fn(),
  logHubSpotCall: vi.fn(),
  createHubSpotDeal: vi.fn(),
}));

vi.mock("./salesforce-service", () => ({
  searchContacts: mocks.searchSalesforceContacts,
  logCall: mocks.logSalesforceCall,
  createOpportunity: mocks.createSalesforceOpportunity,
}));

vi.mock("./hubspot-service", () => ({
  searchContacts: mocks.searchHubSpotContacts,
  logCall: mocks.logHubSpotCall,
  createDeal: mocks.createHubSpotDeal,
}));

describe("CRMService.logCall", () => {
  const ENV = process.env;

  beforeEach(() => {
    process.env = { ...ENV };
    delete process.env.SALESFORCE_INSTANCE_URL;
    delete process.env.SALESFORCE_ACCESS_TOKEN;
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  afterEach(() => {
    process.env = ENV;
  });

  it("auto-selects Salesforce when runtime creds exist and links the best phone match", async () => {
    process.env.SALESFORCE_INSTANCE_URL = "https://example.my.salesforce.com";
    process.env.SALESFORCE_ACCESS_TOKEN = "sf-token";
    mocks.searchSalesforceContacts.mockResolvedValue([
      { sf_id: "sf-other", phone: "+1 555 000 0000" },
      { sf_id: "sf-match", phone: "+1 (555) 123-4567" },
    ]);
    mocks.logSalesforceCall.mockResolvedValue("task-123");

    const { CRMService } = await import("./crm-service");
    const service = new CRMService("user-1");

    const activityId = await service.logCall({
      crmType: "auto",
      subject: "Wireline call",
      description: "Summary",
      to_number: "+15551234567",
      outcome: "connected",
    });

    expect(activityId).toBe("task-123");
    expect(mocks.searchSalesforceContacts).toHaveBeenCalledWith("+15551234567");
    expect(mocks.logSalesforceCall).toHaveBeenCalledWith(expect.objectContaining({
      contact_id: "sf-match",
      subject: "Wireline call",
      description: "Summary",
      outcome: "connected",
    }));
  });

  it("uses HubSpot when explicitly requested and falls back to the first search result", async () => {
    process.env.HUBSPOT_ACCESS_TOKEN = "hs-token";
    mocks.searchHubSpotContacts.mockResolvedValue([
      { hs_id: "hs-first", phone: null },
      { hs_id: "hs-second", phone: "+15559876543" },
    ]);
    mocks.logHubSpotCall.mockResolvedValue("call-789");

    const { CRMService } = await import("./crm-service");
    const service = new CRMService("user-2");

    const activityId = await service.logCall({
      crmType: "hubspot",
      subject: "Ignored by HubSpot",
      description: "Detailed summary",
      to_number: "+15550001111",
      duration_minutes: 2,
      outcome: "completed",
    });

    expect(activityId).toBe("call-789");
    expect(mocks.searchHubSpotContacts).toHaveBeenCalledWith("+15550001111");
    expect(mocks.logHubSpotCall).toHaveBeenCalledWith(expect.objectContaining({
      contact_id: "hs-first",
      to_number: "+15550001111",
      duration_ms: 120000,
      body: "Detailed summary",
      outcome: "completed",
    }));
  });

  it("returns null when no CRM runtime configuration is present", async () => {
    const { CRMService } = await import("./crm-service");
    const service = new CRMService("user-3");

    const activityId = await service.logCall({
      crmType: "auto",
      subject: "Wireline call",
      description: "Summary",
      to_number: "+15551234567",
    });

    expect(activityId).toBeNull();
    expect(mocks.searchSalesforceContacts).not.toHaveBeenCalled();
    expect(mocks.searchHubSpotContacts).not.toHaveBeenCalled();
    expect(mocks.logSalesforceCall).not.toHaveBeenCalled();
    expect(mocks.logHubSpotCall).not.toHaveBeenCalled();
  });
});
