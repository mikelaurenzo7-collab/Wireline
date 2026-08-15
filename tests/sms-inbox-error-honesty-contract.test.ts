import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { customerSafeSmsFailureReason } from "../src/lib/sms-customer-errors";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("sms inbox error honesty", () => {
  it("does not mask thread/message failures as empty success", () => {
    const source = read("src/routes/sms-routes.ts");
    expect(source).toContain("rethrowIfAppError");
    expect(source).toContain('throw AppError.fromHttpStatus(500, "Failed to load SMS threads")');
    expect(source).toContain('throw AppError.fromHttpStatus(500, "Failed to load SMS messages")');
    expect(source).toContain('throw AppError.fromHttpStatus(500, "Failed to mark SMS thread read")');
    expect(source).toContain("evaluateOutboundDialGate");
    expect(source).toContain("isLiveSessionFollowUp: true");
    expect(source).not.toContain('res.json({ threads: [] })');
    expect(source).not.toContain('res.json({ messages: [] })');
    expect(source).not.toContain("res.json({ ok: false })");
    expect(source).not.toContain("migration may be pending");
  });

  it("keeps provider internals server-side while preserving customer recovery", () => {
    expect(
      customerSafeSmsFailureReason({
        reason: "Twilio credentials are not configured on this deployment.",
      }),
    ).not.toMatch(/Twilio|credential|deployment/i);
    expect(
      customerSafeSmsFailureReason({ reason: "Configure a Twilio sender before sending." }),
    ).not.toMatch(/Twilio|sender/i);
    expect(
      customerSafeSmsFailureReason({ reason: "This contact has opted out of messaging." }),
    ).toBe("This contact has opted out of messaging.");
    expect(
      customerSafeSmsFailureReason({
        reason: "Add Runtime Balance before sending.",
        code: "INSUFFICIENT_RUNTIME_BALANCE",
      }),
    ).toBe("Add Runtime Balance before sending.");
  });

  it("does not claim carrier acceptance is final delivery or clear unread state on failure", () => {
    const component = read("src/components/SmsThreads.tsx");
    expect(component).toContain('success("SMS queued"');
    expect(component).not.toContain("Message delivered to customer");
    expect(component).toContain("if (markReadResponse.ok)");
    expect(component).not.toMatch(/mark-read[^]*?\.catch\(\s*\(\) => \{\}/);
  });
});
