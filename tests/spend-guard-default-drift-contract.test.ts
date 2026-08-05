import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("spend guard database defaults", () => {
  it("restores the verified signup fallback without mutating tenant rows", () => {
    const migration = read("drizzle/migrations/0133_restore_spend_guard_defaults.sql");
    const journal = read("drizzle/migrations/meta/_journal.json");

    expect(migration).toContain("ALTER COLUMN monthly_limit_usd SET DEFAULT 0.50");
    expect(migration).toContain("ALTER COLUMN hard_cap SET DEFAULT true");
    expect(migration).toContain("ALTER COLUMN warn_threshold_pct SET DEFAULT 80");
    expect(migration).toContain("ALTER COLUMN enabled SET DEFAULT true");
    expect(migration).toContain("ALTER COLUMN updated_at SET DEFAULT now()");

    expect(migration).not.toMatch(/\bUPDATE\s+public\.wireline_spend_budgets\b/i);
    expect(migration).not.toMatch(/\bINSERT\s+INTO\s+public\.wireline_spend_budgets\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+public\.wireline_spend_budgets\b/i);

    expect(journal).toContain('"tag": "0133_restore_spend_guard_defaults"');
  });
});
