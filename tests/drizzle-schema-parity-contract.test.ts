import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "src/db/schema.ts"), "utf8");

const section = (start: string, end: string) => {
  const startIndex = schema.indexOf(start);
  const endIndex = schema.indexOf(end, startIndex);

  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);

  return schema.slice(startIndex, endIndex);
};

describe("Drizzle source schema parity", () => {
  it("tracks the latest committed migration", () => {
    // Derived from the journal rather than a literal: this header drifted at
    // 0129 (2026-08-04 audit) and again at 0134 (PR #1023) because nothing
    // recomputed the expectation when a migration landed.
    const journal = JSON.parse(
      readFileSync(resolve(process.cwd(), "drizzle/migrations/meta/_journal.json"), "utf8"),
    ) as { entries: Array<{ tag: string }> };
    const latestTag = journal.entries[journal.entries.length - 1]?.tag;
    expect(latestTag).toBeTruthy();
    expect(schema).toContain(`\`drizzle/migrations/${latestTag}.sql\``);
  });

  it("mirrors the server-owned account environment classification", () => {
    const settings = section(
      'export const settings = pgTable("wireline_settings"',
      "// 1.0.1 SHAREABLE RECAP ARTIFACTS",
    );

    expect(settings).toMatch(
      /accountEnvironment:\s*text\("account_environment",\s*\{\s*enum:\s*\["production",\s*"test",\s*"demo"\],?\s*\}\)\s*\.default\("production"\)\s*\.notNull\(\)/,
    );
  });

  it("mirrors the current non-null Free Builder spend guard", () => {
    const spendBudgets = section(
      'export const spendBudgets = pgTable("wireline_spend_budgets"',
      "// 1.2.1 SPEND ALERTS",
    );

    expect(spendBudgets).toMatch(/monthlyLimitUsd:[\s\S]*?\.default\("1\.50"\)\s*\.notNull\(\)/);
    expect(spendBudgets).toMatch(
      /hardCap:\s*boolean\("hard_cap"\)\s*\.default\(true\)\s*\.notNull\(\)/,
    );
    expect(spendBudgets).toMatch(
      /warnThresholdPct:\s*integer\("warn_threshold_pct"\)\s*\.default\(80\)\s*\.notNull\(\)/,
    );
    expect(spendBudgets).toMatch(
      /enabled:\s*boolean\("enabled"\)\s*\.default\(true\)\s*\.notNull\(\)/,
    );
    expect(spendBudgets).toMatch(
      /updatedAt:\s*timestamp\("updated_at",\s*\{\s*withTimezone:\s*true\s*\}\)\s*\.defaultNow\(\)\s*\.notNull\(\)/,
    );
    expect(spendBudgets).not.toContain('.default("0")');
    expect(spendBudgets).not.toContain('hardCap: boolean("hard_cap").default(false)');
  });
});
