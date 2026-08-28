import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getIntegrationStatusDetail,
  resolveIntegrationAvailability,
  resolveIntegrationPrimaryAction,
  SAVED_CONNECTION_INACTIVE_HELP,
  summarizeIntegrationAvailability,
} from "../src/components/CrmConnectionCard";

describe("CRM connection availability", () => {
  it("reports platform credential readiness even for saved active connections", () => {
    const statusRoute = readFileSync(resolve(process.cwd(), "src/routes/oauth/status.ts"), "utf8");

    for (const [provider, resolver] of [
      ["salesforce", "sfOAuthConfigured()"],
      ["hubspot", "hsOAuthConfigured()"],
      ["slack", "slackOAuthConfigured()"],
      ["x", "xOAuthConfigured()"],
      ["zoom", "zoomOAuthConfigured()"],
      ["apollo", "apolloPlatformConfigured()"],
      ["meta", "metaOAuthConfigured()"],
      ["shopify", "shopifyOAuthConfigured()"],
      ["square", "squareOAuthConfigured()"],
      ["microsoft_teams", "microsoftGraphConfigured()"],
      ["microsoft_excel", "microsoftGraphConfigured()"],
      ["google_sheets", "googleSheetsConfigured()"],
    ] as const) {
      const escapedResolver = resolver.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(statusRoute).toMatch(
        new RegExp(
          `${provider}: isLive\\([^)]*\\)\\s*\\?\\s*\\{\\s*connected: true,\\s*configured: ${escapedResolver}`,
        ),
      );
    }
  });

  it("counts configured providers as live or available and exposes unconfigured providers", () => {
    expect(
      summarizeIntegrationAvailability([
        { connected: true, configured: true },
        { connected: false, configured: true },
        { connected: true, configured: false },
        { connected: false, configured: false },
      ]),
    ).toEqual({ live: 1, available: 1, unavailable: 2 });
  });

  it("keeps a stale saved grant disconnectable without treating it as usable", () => {
    const unavailableSavedGrant = resolveIntegrationAvailability({
      connected: true,
      configured: false,
    });
    expect(unavailableSavedGrant).toEqual({
      available: false,
      connected: false,
      hasSavedGrant: true,
    });
    expect(resolveIntegrationPrimaryAction(unavailableSavedGrant, true)).toBe("disconnect");
    expect(resolveIntegrationPrimaryAction(unavailableSavedGrant, false)).toBe("disconnect");
    expect(getIntegrationStatusDetail("CRM", unavailableSavedGrant, true)).toBe(
      "CRM · Saved connection inactive",
    );
    expect(SAVED_CONNECTION_INACTIVE_HELP).toBe(
      "BotBound cannot use this saved authorization while the integration is unavailable. Disconnect to remove it from BotBound.",
    );

    expect(
      resolveIntegrationAvailability({
        connected: true,
        configured: true,
        platform_active: false,
      }),
    ).toEqual({ available: false, connected: false, hasSavedGrant: true });
  });

  it("does not label an inactive saved grant as a provider that is merely unavailable", () => {
    const component = readFileSync(
      resolve(process.cwd(), "src/components/CrmConnectionCard.tsx"),
      "utf8",
    );

    expect(component).toContain('primaryAction === "disconnect"');
    expect(component).toContain("Saved connection inactive");
    expect(component).toMatch(/<Unlink[^>]*\/>\s*Disconnect/);
  });

  it("keeps legacy connected status payloads usable while failing missing provider rows closed", () => {
    expect(resolveIntegrationAvailability({ connected: true })).toEqual({
      available: true,
      connected: true,
      hasSavedGrant: true,
    });
    expect(resolveIntegrationAvailability(undefined)).toEqual({
      available: false,
      connected: false,
      hasSavedGrant: false,
    });
  });
});
