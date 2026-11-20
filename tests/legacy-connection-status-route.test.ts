import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const h = vi.hoisted(() => ({ rows: [] as unknown[], where: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { select: () => ({ from: () => ({ where: h.where }) }) },
  log: { error: vi.fn() },
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/lib/salesforce-service", () => ({ sfOAuthConfigured: () => true }));
vi.mock("../src/lib/hubspot-service", () => ({ hsOAuthConfigured: () => true }));
vi.mock("../src/lib/slack-service", () => ({ slackOAuthConfigured: () => true }));
vi.mock("../src/lib/x-service", () => ({ xOAuthConfigured: () => true }));
vi.mock("../src/lib/zoom-service", () => ({ zoomOAuthConfigured: () => true }));
vi.mock("../src/lib/apollo-service", () => ({
  apolloOAuthConfigured: () => true,
  apolloPlatformConfigured: () => true,
}));
vi.mock("../src/lib/meta-service", () => ({ metaOAuthConfigured: () => true }));
vi.mock("../src/lib/shopify-service", () => ({ shopifyOAuthConfigured: () => true }));
vi.mock("../src/lib/square-service", () => ({ squareOAuthConfigured: () => true }));
vi.mock("../src/lib/microsoft-graph-service", () => ({ microsoftGraphConfigured: () => true }));
vi.mock("../src/lib/google-sheets-service", () => ({ googleSheetsConfigured: () => true }));
vi.mock("../src/lib/integration-health", () => ({ computeIntegrationHealth: vi.fn() }));

import statusRouter from "../src/routes/oauth/status";

describe("legacy tool grant status", () => {
  it("reports inactive saved credentials without returning credentials or claiming a live connection", async () => {
    h.where.mockResolvedValue([
      { provider: "google_sheets", active: false, hasSavedGrant: true },
      { provider: "slack", active: false, hasSavedGrant: false },
    ]);
    const layer = statusRouter.stack.find((entry) => entry.route?.path === "/api/oauth/crm/status");
    const handler = layer!.route.stack.at(-1).handle as (
      req: Request,
      res: Response,
    ) => Promise<void>;
    const json = vi.fn();
    await handler({ user: { id: "owner" } } as Request, { json } as unknown as Response);
    const body = json.mock.calls[0][0];
    expect(body.google_sheets.connected).toBe(false);
    expect(body.saved_grants.google_sheets).toBe(true);
    expect(body.saved_grants.slack).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/accessToken|refreshToken/);
  });
});
