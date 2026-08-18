import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("hot-path knowledge and jobs indexes", () => {
  it("ships the live-missing covering indexes and trigger execute lockdown", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "drizzle/migrations/0155_hot_path_knowledge_and_jobs_indexes.sql"),
      "utf8",
    );
    const schema = readFileSync(resolve(process.cwd(), "src/db/schema-base.ts"), "utf8");
    const journal = readFileSync(
      resolve(process.cwd(), "drizzle/migrations/meta/_journal.json"),
      "utf8",
    );

    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_knowledge_agent_user");
    expect(migration).toContain("wireline_knowledge USING btree (agent_id, user_id)");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_knowledge_user_created");
    expect(migration).toContain("wireline_knowledge USING btree (user_id, created_at DESC)");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_jobs_user_status");
    expect(migration).toContain("wireline_jobs USING btree (user_id, status, created_at)");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.wireline_reclaim_abandoned_stripe_event_claim() FROM PUBLIC",
    );
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.wireline_set_subscription_entitlement_source() FROM PUBLIC",
    );
    expect(migration).not.toMatch(/DROP\s+INDEX/i);
    expect(schema).toContain(
      "idx_jobs_user_status ON wireline_jobs USING btree (user_id, status, created_at)",
    );
    expect(journal).toContain('"tag": "0155_hot_path_knowledge_and_jobs_indexes"');
  });
});
