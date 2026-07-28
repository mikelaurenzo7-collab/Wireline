import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isIdempotentAgentTool } from "../src/lib/agent-tool-idempotency";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("live-call DNC opt-out contract", () => {
  it("journals a deduplicating user-and-phone uniqueness migration", () => {
    const migration = read("drizzle/migrations/0109_dnc_user_phone_uniqueness.sql");
    const journal = read("drizzle/migrations/meta/_journal.json");

    expect(migration).toMatch(/PARTITION BY user_id, phone/);
    expect(migration).toMatch(/duplicate_rank > 1/);
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS wireline_dnc_list_user_phone_unique/,
    );
    expect(migration).toMatch(/\(user_id, phone\)/);
    expect(journal).toContain('"tag": "0109_dnc_user_phone_uniqueness"');
  });

  it("keeps legal opt-outs independent of the auxiliary tool ledger", () => {
    const coreHandler = read("src/routes/vapi/tool-handlers-core.ts");

    expect(isIdempotentAgentTool("add_to_dnc")).toBe(false);
    expect(coreHandler).toContain('if (fn === "add_to_dnc")');
    expect(coreHandler).toMatch(
      /onConflictDoNothing\(\{ target: \[schema\.dncList\.userId, schema\.dncList\.phone\] \}\)/,
    );
    expect(coreHandler).toContain("sentinel.terminateActiveCallsForNumber");
  });
});
