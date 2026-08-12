import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ledger = readFileSync("src/components/OutcomeLedger.tsx", "utf8");

describe("outcome action chronology", () => {
  it("derives last action from task timestamps instead of API priority order", () => {
    expect(ledger).toContain("created_at?: string | null");
    expect(ledger).toContain("createdAt?: string | null");
    expect(ledger).toContain("function newestTask(tasks: TaskLite[])");
    expect(ledger).toContain("Date.parse(value)");
    expect(ledger).toContain("newestTask([...pending, ...completed])");
    expect(ledger).not.toContain("const lastAction = pending[0] || completed[0]");
  });

  it("keeps a deterministic fallback for legacy tasks without timestamps", () => {
    expect(ledger).toContain("return newest ?? tasks[0]");
  });
});
