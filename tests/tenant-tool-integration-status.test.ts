import { describe, expect, it } from "vitest";

import { resolveTenantToolIntegrationStatus } from "../src/lib/tenant-tool-integration-status";

describe("tenant tool integration status", () => {
  const base = {
    oauthStatus: {},
    calendarReconnectGoogle: false,
    calendarReconnectMicrosoft: false,
    emailProviders: [] as string[],
  };

  it("treats platform-managed tools as configured", () => {
    expect(resolveTenantToolIntegrationStatus("twilio", base)).toBe("configured");
    expect(resolveTenantToolIntegrationStatus("docusign", base)).toBe("configured");
  });

  it("requires a live CRM connection for CRM tools", () => {
    expect(resolveTenantToolIntegrationStatus("crm", base)).toBe("missing");
    expect(
      resolveTenantToolIntegrationStatus("crm", {
        ...base,
        oauthStatus: { hubspot: { connected: true } },
      }),
    ).toBe("configured");
  });

  it("requires calendar-ready workspace mail for calendar tools", () => {
    expect(resolveTenantToolIntegrationStatus("calendar", base)).toBe("missing");
    expect(
      resolveTenantToolIntegrationStatus("calendar", {
        ...base,
        emailProviders: ["google"],
        calendarReconnectGoogle: false,
      }),
    ).toBe("configured");
  });
});
