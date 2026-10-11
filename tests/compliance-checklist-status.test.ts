import { describe, expect, it } from "vitest";
import { getIntegrationChecklistStatus } from "../src/components/admin/compliance-checklist-status";

const healthyConnection = {
  has_oauth_connections: true,
  reconnect_google_calendar: false,
  reconnect_microsoft_calendar: false,
  reconnect_hubspot: false,
  reconnect_salesforce: false,
  reconnect_google_sheets: false,
  reconnect_microsoft_mailbox: false,
  reasons: [],
};

describe("integration compliance checklist status", () => {
  it("marks an account with no OAuth connections not applicable", () => {
    expect(
      getIntegrationChecklistStatus({ ...healthyConnection, has_oauth_connections: false }),
    ).toBe("not_applicable");
  });

  it("marks a healthy connected account done", () => {
    expect(getIntegrationChecklistStatus(healthyConnection)).toBe("done");
  });

  it("keeps reconnect needs pending", () => {
    expect(
      getIntegrationChecklistStatus({
        ...healthyConnection,
        reconnect_salesforce: true,
        reasons: ["Reconnect Salesforce."],
      }),
    ).toBe("pending");
  });

  it("fails closed for missing or incomplete health responses", () => {
    expect(getIntegrationChecklistStatus(null)).toBe("pending");
    expect(
      getIntegrationChecklistStatus({ ...healthyConnection, has_oauth_connections: undefined }),
    ).toBe("pending");
    expect(
      getIntegrationChecklistStatus({ ...healthyConnection, reconnect_google_calendar: undefined }),
    ).toBe("pending");
  });
});
