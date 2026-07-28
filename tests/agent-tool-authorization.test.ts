import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_AGENT_TOOL_NAMES,
  isSystemRuntimeTool,
  NO_TENANT_INTEGRATIONS,
  resolveAuthorizedAgentTools,
  sanitizePersistedAgentToolSelection,
} from "../src/lib/agent-tool-authorization";
import { UNSCOPED_PLATFORM_LIVE_TOOL_NAMES } from "../src/lib/tenant-integration-connections";

describe("agent tool execution authorization", () => {
  it("preserves known selections while dropping stale legacy values", () => {
    expect(
      sanitizePersistedAgentToolSelection([
        "search_knowledge_base",
        "create_fleet_task",
        "send_email",
        "send_email",
      ]),
    ).toEqual(["search_knowledge_base", "send_email"]);
  });

  it("reserves null for intentional legacy full-catalog compatibility", () => {
    expect(sanitizePersistedAgentToolSelection(null)).toBeNull();
    expect(sanitizePersistedAgentToolSelection(undefined)).toBeNull();
  });

  it("fails closed for malformed persisted JSON shapes", () => {
    expect(sanitizePersistedAgentToolSelection({ send_email: true })).toEqual([]);
    expect(sanitizePersistedAgentToolSelection("send_email")).toEqual([]);
    expect(sanitizePersistedAgentToolSelection([42, false, {}])).toEqual([]);
  });

  it("never activates disconnected, feature-disabled, or unscoped platform tools", () => {
    const active = resolveAuthorizedAgentTools(
      [
        "send_email",
        "send_text_message",
        "lookup_phone_number",
        "book_appointment",
        "send_slack_notification",
        "shopify_cancel_order",
        "list_x_ad_campaigns",
        "get_x_ad_campaign_stats",
        "send_contract",
        "meta_submit_lead",
      ],
      { twilioMessaging: false, twilioLookup: false },
      NO_TENANT_INTEGRATIONS,
    );

    expect(active).toEqual(["send_email"]);
  });

  it("keeps platform-owned accounts out of arbitrary live tenant execution", () => {
    expect([...UNSCOPED_PLATFORM_LIVE_TOOL_NAMES].sort()).toEqual(
      [
        "get_x_ad_campaign_stats",
        "list_x_ad_campaigns",
        "meta_submit_lead",
        "send_contract",
      ].sort(),
    );
  });

  it("keeps explicit empty selections empty instead of expanding the catalog", () => {
    expect(
      resolveAuthorizedAgentTools(
        [],
        { twilioMessaging: true, twilioLookup: true },
        NO_TENANT_INTEGRATIONS,
      ),
    ).toEqual([]);
  });

  it("keeps only compliance and durable fallback tools system-callable", () => {
    expect(isSystemRuntimeTool("add_to_dnc")).toBe(true);
    expect(isSystemRuntimeTool("create_followup_task")).toBe(true);
    expect(isSystemRuntimeTool("send_email")).toBe(false);
    expect(isSystemRuntimeTool("book_appointment")).toBe(false);
    expect(isSystemRuntimeTool("create_fleet_task")).toBe(false);
  });

  it("keeps compliance exceptions independent of integration health after identity verification", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/agent-tool-authorization.ts"),
      "utf8",
    );
    const identityCheck = source.indexOf("if (!agentRow) return false");
    const systemException = source.indexOf("if (isSystemRuntimeTool(name)) return true");
    const integrationLookup = source.indexOf("loadTenantIntegrationConnections(userId)");
    expect(identityCheck).toBeGreaterThan(-1);
    expect(systemException).toBeGreaterThan(identityCheck);
    expect(integrationLookup).toBeGreaterThan(systemException);
    expect(source).toContain("return NO_TENANT_INTEGRATIONS");
  });

  it("keeps the authorization catalog tied to the canonical tool registry", () => {
    expect(CANONICAL_AGENT_TOOL_NAMES).toContain("search_knowledge_base");
    expect(CANONICAL_AGENT_TOOL_NAMES).toContain("trigger_enterprise_webhook");
    expect(CANONICAL_AGENT_TOOL_NAMES).not.toContain("create_fleet_task");
  });

  it("checks authorization before the idempotency ledger and handlers", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/agent-tool-dispatch.ts"),
      "utf8",
    );
    const authorization = source.indexOf("await isAgentToolExecutionAuthorized");
    const idempotency = source.indexOf("return runIdempotentAgentToolCall");
    expect(authorization).toBeGreaterThan(-1);
    expect(idempotency).toBeGreaterThan(authorization);
    expect(source).toContain("Blocked inactive or disconnected agent tool");
  });

  it("journals both verified live-tool data cleanups", () => {
    const legacyMigration = readFileSync(
      resolve(process.cwd(), "drizzle/migrations/0110_remove_legacy_agent_tool_token.sql"),
      "utf8",
    );
    const platformMigration = readFileSync(
      resolve(process.cwd(), "drizzle/migrations/0111_remove_unscoped_platform_live_tools.sql"),
      "utf8",
    );
    const journal = readFileSync(
      resolve(process.cwd(), "drizzle/migrations/meta/_journal.json"),
      "utf8",
    );
    expect(legacyMigration).toContain("create_fleet_task");
    expect(legacyMigration).toContain("WITH ORDINALITY");
    expect(platformMigration).toContain("list_x_ad_campaigns");
    expect(platformMigration).toContain("send_contract");
    expect(platformMigration).toContain("meta_submit_lead");
    expect(journal).toContain('"tag": "0110_remove_legacy_agent_tool_token"');
    expect(journal).toContain('"tag": "0111_remove_unscoped_platform_live_tools"');
  });
});
