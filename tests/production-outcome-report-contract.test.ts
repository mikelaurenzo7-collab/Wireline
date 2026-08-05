import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "scripts/production-outcome-report.ts"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("production outcome report", () => {
  it("reads only production-classified, non-demo evidence", () => {
    expect(source).toContain("WHERE account_environment = 'production'");
    expect(source).toContain("audit.event_type = 'product.event'");
    expect(source).toContain("audit.metadata->>'account_environment' = 'production'");
    expect(source).toContain("COALESCE(calls.demo, false) = false");
    expect(source).toContain("environment_drift_rows");
  });

  it("reports outcome, reliability, escalation, and cost without inventing revenue", () => {
    for (const field of [
      "calls_with_outcome_tag",
      "reviewed_outcomes",
      "total_provider_cost_usd",
      "tool_calls_failed",
      "successful_escalations",
      "calls_with_pipeline_error",
      "calls_with_stt_error",
      "calls_with_tts_error",
      "average_qa_score",
    ]) {
      expect(source).toContain(field);
    }
    expect(source).toContain(
      "neither is treated as booked revenue without system-of-record evidence",
    );
    expect(source).toContain('"unproven_no_production_calls"');
    expect(source).toContain('"production_calls_without_recorded_outcomes"');
    expect(source).toContain('"production_outcomes_observed"');
  });

  it("is bounded, read-only, and PII-free", () => {
    expect(source).toContain('client.query("BEGIN READ ONLY")');
    expect(source).toContain("SET LOCAL statement_timeout = '15s'");
    expect(source).toContain("Report windows may not exceed 366 days.");
    expect(source).toContain("--to may not be materially in the future.");
    expect(source).toContain("piiIncluded: false");

    for (const piiField of [
      "customer_number",
      "transcript",
      "recording_url",
      "actor_email",
      "ip_address",
      "user_agent",
    ]) {
      expect(source).not.toContain(piiField);
    }

    expect(source).not.toMatch(/\b(?:insert|update|delete|alter|drop|truncate)\b/i);
  });
});
