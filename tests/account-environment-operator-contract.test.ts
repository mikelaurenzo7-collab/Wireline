import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0131_manage_account_environment.sql"),
  "utf8",
);
const command = readFileSync(
  resolve(process.cwd(), "scripts/set-account-environment.ts"),
  "utf8",
);

describe("account environment operator contract", () => {
  it("keeps classification mutation behind a narrow privileged function", () => {
    expect(migration).toContain("wireline_set_account_environment");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });

  it("validates, locks, mutates, repairs, and audits atomically", () => {
    expect(migration).toContain("v_environment NOT IN ('production', 'test', 'demo')");
    expect(migration).toContain("char_length(v_reason) < 8");
    expect(migration).toContain("INTO STRICT");
    expect(migration).toContain("FOR UPDATE OF settings");
    expect(migration).toContain("SET account_environment = v_environment");
    expect(migration).toContain("wireline_audit_log.event_type = 'product.event'");
    expect(migration).toContain("'operator.account_environment'");
    expect(migration).toContain("'database_session_user', session_user");
  });

  it("requires explicit operator evidence before invoking the mutation", () => {
    expect(command).toContain('requireFlag(args, "email")');
    expect(command).toContain('requireFlag(args, "environment")');
    expect(command).toContain('requireFlag(args, "reason")');
    expect(command).toContain('requireFlag(args, "actor-email")');
    expect(command).toContain('requireFlag(args, "confirm-email")');
    expect(command).toContain('args.includes("--apply")');
    expect(command).toContain("confirmationEmail !== accountEmail");
    expect(command).toContain("wireline_set_account_environment($1, $2, $3, $4)");
    expect(command).toContain("resolveDatabaseConnection()");
  });
});
