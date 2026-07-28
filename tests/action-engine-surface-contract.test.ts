import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ActionTypeSchema } from "../src/lib/action-types";

const source = readFileSync("src/lib/action-engine.ts", "utf8");

describe("action-engine surface", () => {
  it("declares only action types with an execution or draft path", () => {
    expect(ActionTypeSchema.options).toEqual([
      "send_email",
      "send_text_message",
      "schedule_calendar",
      "update_crm_lead",
      "create_internal_task",
      "send_contract",
      "prospect_leads",
      "notify_slack",
    ]);
    expect(source).not.toContain("create_payment_link");
    expect(source).not.toContain("send_invoice");
    expect(source).not.toContain("check_inventory");
  });

  it("uses canonical authorization for autonomous actions", () => {
    expect(source).toContain("resolveAuthorizedAgentTools");
    expect(source).toContain("sanitizePersistedAgentToolSelection");
    expect(source).toContain("loadTenantIntegrationConnections");
  });
});
