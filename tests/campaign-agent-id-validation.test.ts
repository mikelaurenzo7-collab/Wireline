import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CampaignCreateSchema, CampaignUpdateSchema } from "../src/lib/form-validators";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("campaign Bot assignment validation", () => {
  it("rejects whitespace-only IDs while preserving and normalizing supported text IDs", () => {
    expect(CampaignCreateSchema.safeParse({ name: "Launch", agent_id: "   " }).success).toBe(false);
    expect(CampaignUpdateSchema.safeParse({ agent_id: "\t\n" }).success).toBe(false);

    const created = CampaignCreateSchema.parse({
      name: "Launch",
      agent_id: " agent-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa ",
    });
    const updated = CampaignUpdateSchema.parse({ agent_id: " founder-prospector " });

    expect(created.agent_id).toBe("agent-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(updated.agent_id).toBe("founder-prospector");
  });

  it("preserves the intended AppError status from campaign creation", () => {
    const routes = source("src/routes/campaign-routes.ts");
    const createRoute = routes.slice(
      routes.indexOf('router.post(\n  "/api/campaigns"'),
      routes.indexOf("router.patch("),
    );

    expect(createRoute).toContain("rethrowIfAppError(error);");
    expect(createRoute.indexOf("rethrowIfAppError(error);")).toBeLessThan(
      createRoute.indexOf('log.error("Failed to create campaign"'),
    );
  });
});
