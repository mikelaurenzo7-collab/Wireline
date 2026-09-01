import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("number provisioning tells the tenant something true and nothing internal", () => {
  const source = read("src/lib/voice/native-phone-provisioning.ts");

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
      'log.error("Twilio line exists but OpenAI routing could not be confirmed"',
    );
    expect(source).toContain(
      'log.error("Native phone ownership persisted but its purchase claim could not be cleared"',
    );
    expect(source).toContain('log.warn("Native phone provisioning blocked by account environment"');
  });

  it("says the failure is ours and what still works", () => {
    expect(source).toContain('code: "PHONE_RUNTIME_NOT_CONFIGURED"');
    expect(source).toContain(
      "Phone activation is temporarily unavailable because live-call routing is not configured. No number was purchased.",
    );
    expect(source).not.toContain('error: "OpenAI Realtime SIP is not configured."');
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
