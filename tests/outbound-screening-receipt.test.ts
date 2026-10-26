import { describe, expect, it } from "vitest";

import {
  issueOutboundScreeningReceipt,
  outboundScreeningMatches,
} from "../src/lib/voice/outbound-screening-receipt";

const input = {
  userId: "tenant",
  agentId: "bot",
  phone: "+13125550101",
  callPurpose: "marketing_or_sales" as const,
  attemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  leadId: "7",
  now: Date.parse("2026-10-26T12:00:00.000Z"),
};

describe("outbound screening receipt", () => {
  it("matches only the same call and is not recorded as express consent", () => {
    const receipt = issueOutboundScreeningReceipt(input);
    expect(receipt.admissionKind).toBe("platform_screen");
    expect(receipt.effectiveCallPurpose).toBe("marketing_or_sales");
    expect(receipt).not.toHaveProperty("hasExpressWrittenConsent");
    expect(
      outboundScreeningMatches({
        ...input,
        artifactId: receipt.artifactId,
        expiresAt: receipt.expiresAt,
        receiptId: receipt.receiptId,
        grantHash: receipt.grantHash,
        receiptHash: receipt.receiptHash,
        now: input.now + 1000,
      }),
    ).toBe(true);
    expect(
      outboundScreeningMatches({
        ...input,
        phone: "+13125550102",
        artifactId: receipt.artifactId,
        expiresAt: receipt.expiresAt,
        receiptId: receipt.receiptId,
        grantHash: receipt.grantHash,
        receiptHash: receipt.receiptHash,
        now: input.now + 1000,
      }),
    ).toBe(false);
    expect(
      outboundScreeningMatches({
        ...input,
        artifactId: receipt.artifactId,
        expiresAt: receipt.expiresAt,
        receiptId: receipt.receiptId,
        grantHash: receipt.grantHash,
        receiptHash: receipt.receiptHash,
        now: Date.parse(receipt.expiresAt),
      }),
    ).toBe(false);
  });
});
