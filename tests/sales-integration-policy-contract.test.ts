import { describe, expect, it } from "vitest";
import { requiresSalesApprovalForIntegration } from "../src/lib/sales-integration-policy";

describe("sales integration policy", () => {
  it("requires approval for sales agent CRM writebacks unless autonomy is auto", () => {
    expect(
      requiresSalesApprovalForIntegration({
        agentRole: "sales_sdr",
        autonomyLevel: "draft",
        actionType: "update_crm_lead",
      }),
    ).toBe(true);
    expect(
      requiresSalesApprovalForIntegration({
        agentRole: "sales_sdr",
        autonomyLevel: "auto",
        actionType: "update_crm_lead",
      }),
    ).toBe(false);
    expect(
      requiresSalesApprovalForIntegration({
        agentRole: "support",
        autonomyLevel: "draft",
        actionType: "update_crm_lead",
      }),
    ).toBe(false);
  });
});
