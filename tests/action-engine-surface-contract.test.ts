import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ActionTypeSchema } from "../src/lib/action-types";

const source = readFileSync("src/lib/action-engine.ts", "utf8");
const idempotency = readFileSync("src/lib/action-execution-idempotency.ts", "utf8");
const integrations = readFileSync("src/lib/integrations.ts", "utf8");

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

  it("uses canonical provider-aware authorization for autonomous actions", () => {
    expect(source).toContain("resolveAuthorizedAgentTools");
    expect(source).toContain("sanitizePersistedAgentToolSelection");
    expect(source).toContain("loadTenantIntegrationConnections");
    expect(source).toContain('update_crm_lead: "crm_log_call"');
    expect(source).not.toContain('update_crm_lead: "update_lead_status"');
  });

  it("recovers call ownership and downgrades unresolved autonomous work", () => {
    expect(source).toContain("recoverSourceAgentId");
    expect(source).toContain("schema.callLogs.vapiCallId");
    expect(source).toContain("Unscoped autonomous action downgraded to draft");
  });

  it("deduplicates draft and auto phases independently", () => {
    expect(source).toContain("runIdempotentActionExecution");
    expect(idempotency).toContain('type ActionPhase = "draft" | "auto"');
    expect(idempotency).toContain("pg_advisory_xact_lock");
    expect(idempotency).toContain("canonicalJson");
    expect(idempotency).toContain("already processing or awaiting outcome verification");
  });

  it("paginates both calendar providers and validates Graph continuation URLs", () => {
    expect(integrations).toContain("MAX_CALENDAR_PAGES");
    expect(integrations).toContain("nextPageToken");
    expect(integrations).toContain('data["@odata.nextLink"]');
    expect(integrations).toContain('parsed.hostname !== "graph.microsoft.com"');
    expect(integrations).toContain("pagination exceeded the safety limit");
  });
});
