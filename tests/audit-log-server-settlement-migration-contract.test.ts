import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0177_audit_log_server_settlement_policies.sql"),
  "utf8",
);

describe("server audit settlement RLS migration", () => {
  it("lets the server update only the current tenant's audit rows", () => {
    expect(migration).toMatch(
      /CREATE POLICY server_audit_update ON public\.wireline_audit_log\s+FOR UPDATE TO wireline_server\s+USING \(user_id = \(SELECT public\.wireline_current_user_id\(\)\)\)\s+WITH CHECK \(user_id = \(SELECT public\.wireline_current_user_id\(\)\)\)/,
    );
  });

  it("lets the server release only the current tenant's rejected reservation", () => {
    expect(migration).toMatch(
      /CREATE POLICY server_audit_delete ON public\.wireline_audit_log\s+FOR DELETE TO wireline_server\s+USING \(user_id = \(SELECT public\.wireline_current_user_id\(\)\)\)/,
    );
  });

  it("does not grant cross-tenant or unconditional server writes", () => {
    expect(migration).not.toMatch(/(?:USING|WITH CHECK)\s*\(true\)/i);
  });
});
