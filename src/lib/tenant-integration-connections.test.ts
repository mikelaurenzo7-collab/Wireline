import { describe, it, expect } from "vitest";
import { filterToolsByTenantConnections } from "./tenant-integration-connections";
import type { AgentToolName } from "./agent-capabilities";

describe("filterToolsByTenantConnections", () => {
  const allConn = {
    shopify: true,
    square: true,
    slack: true,
    microsoft_teams: true,
    microsoft_excel: true,
    salesforce: true,
    hubspot: true,
    zoom: true,
  };

  const noneConn = {
    shopify: false,
    square: false,
    slack: false,
    microsoft_teams: false,
    microsoft_excel: false,
    salesforce: false,
    hubspot: false,
    zoom: false,
  };

  it("keeps core tools when no integrations connected", () => {
    const tools: AgentToolName[] = ["escalate_to_human", "send_email", "search_leads"];
    expect(filterToolsByTenantConnections(tools, noneConn)).toEqual(tools);
  });

  it("drops Shopify tools when store not connected", () => {
    const tools: AgentToolName[] = ["shopify_lookup_order", "send_email"];
    expect(filterToolsByTenantConnections(tools, noneConn)).toEqual(["send_email"]);
  });

  it("allows CRM tools when either CRM is connected", () => {
    const tools: AgentToolName[] = ["crm_log_call"];
    expect(filterToolsByTenantConnections(tools, { ...noneConn, hubspot: true })).toEqual([
      "crm_log_call",
    ]);
    expect(filterToolsByTenantConnections(tools, noneConn)).toEqual([]);
  });

  it("passes all ecommerce tools when both stores connected", () => {
    const tools: AgentToolName[] = ["shopify_lookup_order", "square_lookup_order"];
    expect(filterToolsByTenantConnections(tools, allConn)).toEqual(tools);
  });

  it("gates platform tools on env flags", () => {
    const tools: AgentToolName[] = ["enrich_lead", "send_contract", "gemini_ground", "send_email"];
    expect(
      filterToolsByTenantConnections(tools, noneConn, {
        apollo: false,
        docusign: false,
        gemini: false,
      }),
    ).toEqual(["send_email"]);
    expect(
      filterToolsByTenantConnections(tools, noneConn, {
        apollo: true,
        docusign: true,
        gemini: true,
      }),
    ).toEqual(tools);
  });
});
