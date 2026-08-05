import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const report = readFileSync(
  resolve(process.cwd(), "scripts/production-activation-report.ts"),
  "utf8",
);

describe("production activation report contract", () => {
  it("derives its durable stages from the canonical public funnel", () => {
    expect(report).toContain("PUBLIC_SELF_SERVE_FUNNEL_EVENT_NAMES");
    expect(report).toContain('event !== "signup_started"');
    expect(report).toContain("DURABLE_PUBLIC_SELF_SERVE_FUNNEL_EVENT_NAMES");
    expect(report).toContain("Activation report stage order diverged from the canonical funnel.");
  });

  it("is explicitly bounded and read only", () => {
    expect(report).toContain('requireDateFlag(args, "from")');
    expect(report).toContain('requireDateFlag(args, "to")');
    expect(report).toContain("Report windows may not exceed 366 days.");
    expect(report).toContain("BEGIN READ ONLY");
    expect(report).toContain("SET LOCAL statement_timeout = '15s'");
    expect(report).not.toContain("INSERT INTO");
    expect(report).not.toContain("UPDATE public.");
    expect(report).not.toContain("DELETE FROM");
  });

  it("requires production truth at both the account and event boundaries", () => {
    expect(report).toContain("account_environment = 'production'");
    expect(report).toContain("audit.metadata->>'account_environment' = 'production'");
    expect(report).toContain("environment_drift_rows");
    expect(report).toContain("trustworthy: environmentDriftRows === 0");
  });

  it("counts distinct accounts and exposes retries without PII", () => {
    expect(report).toContain("count(DISTINCT events.user_id)");
    expect(report).toContain("duplicateOrRepeatEvents");
    expect(report).toContain("first durable signup_completed event occurred inside the window");
    expect(report).toContain("piiIncluded: false");
    expect(report).not.toContain("users.email");
    expect(report).not.toContain("account_email");
  });
});
