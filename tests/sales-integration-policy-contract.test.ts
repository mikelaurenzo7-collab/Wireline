import { describe, expect, it } from "vitest";
import { requiresSalesApprovalForIntegration } from "../src/lib/sales-integration-policy";

describe("sales integration policy", () => {
  it("requires approval for sales agent calendar writebacks unless autonomy is auto", () => {
    expect(
      requiresSalesApprovalForIntegration({
        agentRole: "sales_sdr",
        autonomyLevel: "draft",
        actionType: "schedule_calendar",
      }),
    ).toBe(true);
    expect(
      requiresSalesApprovalForIntegration({
        agentRole: "sales_sdr",
        autonomyLevel: "auto",
        actionType: "schedule_calendar",
      }),
    ).toBe(false);
    expect(
      requiresSalesApprovalForIntegration({
        agentRole: "support",
        autonomyLevel: "draft",
        actionType: "schedule_calendar",
      }),
    ).toBe(false);
  });
});
