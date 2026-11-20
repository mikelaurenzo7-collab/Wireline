import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ where: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: () => ({ from: () => ({ where: h.where }) }) },
}));
vi.mock("../src/lib/oauth-helpers", () => ({
  googleGrantedScopesAllowCalendarWrite: () => true,
  microsoftGrantedScopesAllowCalendarWrite: () => true,
}));
import { computeIntegrationHealth } from "../src/lib/integration-health";

describe("connection health after tool retirement", () => {
  it("directs inactive saved tools to Connections while retaining real mail/calendar recovery", async () => {
    h.where
      .mockReset()
      .mockResolvedValueOnce([
        {
          provider: "microsoft",
          oauthGrantedScopes: "mail calendar",
          accessToken: null,
          refreshToken: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { provider: "google_sheets", active: false },
        { provider: "hubspot", active: false },
      ]);
    const health = await computeIntegrationHealth("owner");
    expect(health.reasons).toContain(
      "Google Sheets is inactive. Manage the saved connection in Connections.",
    );
    expect(health.reasons).toContain(
      "HubSpot is inactive. Manage the saved connection in Connections.",
    );
    expect(health.reasons.join(" ")).not.toMatch(/reconnect (Google Sheets|HubSpot)/i);
    expect(health.reconnect_microsoft_mailbox).toBe(true);
    expect(health.reasons.join(" ")).toContain("Reconnect Outlook in Connections.");
  });
});
