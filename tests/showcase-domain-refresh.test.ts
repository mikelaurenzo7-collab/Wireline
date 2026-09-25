import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getTableColumns } from "drizzle-orm";
import { agents } from "../src/db/schema";
// @ts-expect-error -- operator helper shared by the explicit data migration.
import {
  planFounderDomainRefresh,
  planShowcaseDomainRefresh,
  SHOWCASE_DOMAIN_REFRESH_VERSION,
} from "../scripts/lib/showcase-domain-refresh.mjs";

const handoff =
  "- If the caller asks for a human, a manager, or a callback: do not pretend one is coming. Warmly explain this is a live demo of BotBound, then offer a real next step: email them a signup link, or point them to botbound.me to create a Bot and add Runtime Balance when ready for live calls.";
const row = {
  id: "founder-showcase:owner:jordan",
  userId: "owner",
  name: "Jordan",
  systemPromptOverride: `Preserve this customized greeting.\n${handoff}\nPreserve the saved playbook.`,
  businessVariables: {
    founder_showcase: true,
    founder_showcase_kind: "demo",
    founder_showcase_runtime_version: "openai-realtime-v1-2026-08-29",
    custom: "preserved",
  },
};

describe("explicit showcase domain refresh", () => {
  it("writes only columns defined by the canonical agent schema", () => {
    const migration = readFileSync(
      new URL("../scripts/migrations/2026-09-25-showcase-domain.mjs", import.meta.url),
      "utf8",
    );
    const update = migration.match(/UPDATE\s+wireline_agents\s+SET\s+([\s\S]*?)\s+WHERE\b/i);
    expect(update).not.toBeNull();
    const columns = [...update![1].matchAll(/\b([a-z_]+)\s*=/g)].map((match) => match[1]);
    expect(columns.length).toBeGreaterThan(0);
    const schemaColumns = new Set(Object.values(getTableColumns(agents)).map((column) => column.name));
    expect(columns.filter((column) => !schemaColumns.has(column))).toEqual([]);
  });

  it("changes only the exact managed handoff while retaining saved custom text and metadata", () => {
    const plan = planShowcaseDomainRefresh(row);
    expect(plan.status).toBe("refresh");
    expect(plan.systemPromptOverride).toBe(
      row.systemPromptOverride.replace("botbound.me", "botbound.app"),
    );
    expect(plan.businessVariables).toEqual({
      ...row.businessVariables,
      founder_showcase_domain_version: SHOWCASE_DOMAIN_REFRESH_VERSION,
    });
    expect(planShowcaseDomainRefresh({ ...row, ...plan }).status).toBe("current");
  });

  it("requires manual review for edited or additional legacy instructions", () => {
    expect(
      planShowcaseDomainRefresh({
        ...row,
        systemPromptOverride: "My custom botbound.me instruction",
      }).status,
    ).toBe("manual-review");
    expect(
      planShowcaseDomainRefresh({
        ...row,
        systemPromptOverride: `${row.systemPromptOverride}\nCustom link: https://botbound.me/elsewhere`,
      }).status,
    ).toBe("manual-review");
    expect(
      planShowcaseDomainRefresh({ ...row, systemPromptOverride: `${handoff}\n${handoff}` }).status,
    ).toBe("manual-review");
  });

  it("never changes another Bot or an unknown managed template version", () => {
    expect(planShowcaseDomainRefresh({ ...row, id: "customer-bot" }).status).toBe("not-managed");
    expect(
      planShowcaseDomainRefresh({
        ...row,
        businessVariables: { ...row.businessVariables, founder_showcase: false },
      }).status,
    ).toBe("not-managed");
    expect(
      planShowcaseDomainRefresh({
        ...row,
        businessVariables: { ...row.businessVariables, founder_showcase_runtime_version: "future" },
      }).status,
    ).toBe("manual-review");
  });

  it("refreshes only an exact legacy website default on a managed founder Bot", () => {
    const fleet = {
      id: "founder-jordan",
      websiteUrl: "https://botbound.me",
      businessVariables: { founder_fleet_seed: true, custom: "keep" },
    };
    expect(planFounderDomainRefresh(fleet)).toEqual({
      status: "refresh",
      websiteUrl: "https://botbound.app",
      businessVariables: {
        ...fleet.businessVariables,
        founder_site_domain_version: SHOWCASE_DOMAIN_REFRESH_VERSION,
      },
    });
    expect(planFounderDomainRefresh({ ...fleet, websiteUrl: "https://customer.example" })).toEqual({
      status: "current",
    });
    expect(
      planFounderDomainRefresh({ ...fleet, websiteUrl: "https://botbound.me/custom" }),
    ).toEqual({ status: "manual-review" });
    expect(planFounderDomainRefresh({ ...fleet, businessVariables: {} })).toEqual({
      status: "not-managed",
    });
  });
});
