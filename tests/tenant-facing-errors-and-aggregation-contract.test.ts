import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("number provisioning tells the tenant something true and nothing internal", () => {
  const source = read("src/lib/phone-provisioning.ts");

  it("never returns a provider name or environment variable to the caller", () => {
    // PhoneSetupPanel renders `body.error` verbatim on /settings/phone, so any
    // string returned here is on a page every signed-in customer can reach.
    expect(source).not.toContain('error: "Vapi not configured on platform (VAPI_PRIVATE_KEY)."');
    expect(source).not.toContain("WIRELINE_AUTO_PROVISION_NUMBERS=false.");
    const returned = source.match(/ok: false, error: [^\n]+/g) ?? [];
    for (const line of returned) {
      expect(line).not.toMatch(/VAPI_|TWILIO_|WIRELINE_[A-Z_]+=/);
    }
  });

  it("never hands the carrier SDK's own message back to the tenant", () => {
    // It can carry account SIDs, internal URLs, and provider account names.
    expect(source).not.toContain("ok: false, error: getErrorMessage(err)");
  });

  it("still records the real cause for the operator", () => {
    expect(source).toContain(
      'log.error("number provisioning refused, VAPI_PRIVATE_KEY is not set"',
    );
    expect(source).toContain(
      'log.error("number provisioning refused, auto-provisioning is disabled"',
    );
    expect(source).toContain('log.error("releaseTenantNumber failed"');
    expect(source).toContain('log.error("provisionTenantNumber failed"');
  });

  it("says the failure is ours and what still works", () => {
    expect(source).toContain("NUMBER_PROVISIONING_UNAVAILABLE");
    const message = source.slice(source.indexOf("const NUMBER_PROVISIONING_UNAVAILABLE"));
    expect(message.slice(0, 400)).toContain("on our side");
    expect(message.slice(0, 400)).toMatch(/texts, email, and follow-up/);
  });
});

describe("audit stats aggregate in Postgres, not in the function's memory", () => {
  const source = read("src/lib/audit-handlers.ts");
  const handler = source.slice(
    source.indexOf("async function auditStatsHandler"),
    source.indexOf("function sanitizeCSV"),
  );

  it("does not pull every row of a year of audit history", () => {
    // One row per AI call, `metadata` jsonb and all, for up to 365 days.
    expect(handler).not.toContain(".select()\n        .from(schema.auditLog)");
    expect(handler).not.toContain("events.forEach(");
  });

  it("groups and counts in SQL", () => {
    expect(handler).toContain(".groupBy(severityExpr)");
    expect(handler).toContain(".groupBy(typeExpr)");
    expect(handler).toContain("count(*) filter (where");
    expect(handler).toContain("coalesce(sum(");
  });

  it("preserves the JavaScript truthiness fallbacks the old code relied on", () => {
    // Both columns are NOT NULL with defaults, so only an empty string could
    // reach the literal fallback — nullif reproduces that exactly.
    expect(handler).toContain("coalesce(nullif(${schema.auditLog.severity}, ''), 'info')");
    expect(handler).toContain(
      "coalesce(nullif(${schema.auditLog.eventType}, ''), nullif(${schema.auditLog.action}, ''), 'unknown')",
    );
  });

  it("keeps the same response shape", () => {
    for (const key of [
      "total_events:",
      "by_severity:",
      "by_type:",
      "total_cost_usd:",
      "total_api_calls:",
      "period_days:",
    ]) {
      expect(handler).toContain(key);
    }
  });
});
