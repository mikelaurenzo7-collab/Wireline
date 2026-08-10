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
import {
  filterToolsByTenantConnections,
  UNSCOPED_PLATFORM_LIVE_TOOL_NAMES,
} from "../src/lib/tenant-integration-connections";
import {
  AGENT_TOOL_CATALOG,
  AGENT_TOOL_NAME_VALUES,
  ROLE_TOOL_SETS,
} from "../src/lib/agent-capabilities";
import { resolveCreateEnabledTools } from "../src/lib/agent-create-defaults";

/*
 * The tool name union, the UI/create-path catalog, and the per-role defaults
 * are three hand-maintained lists that must agree. `search_knowledge_base` sat
 * in the union but in neither of the other two for the life of the feature: the
 * handler was live, the Vapi tool def existed, and the realtime voice path
 * exposed it — but `resolveCreateEnabledTools` never granted it, so every agent
 * created through the web or mobile app persisted an `enabled_tools` without
 * it, the execution boundary denied it, and the Actions editor (which renders
 * from the catalog) had no checkbox to turn it on. Agents fell back to the 18
 * newest knowledge rows the system prompt carries; anything older was
 * unreachable on every call.
 */
describe("agent tool lists stay in sync", () => {
  it("gives every tool name a catalog entry and vice versa", () => {
    const names = new Set<string>(AGENT_TOOL_NAME_VALUES);
    const catalog = new Set<string>(AGENT_TOOL_CATALOG.map((tool) => tool.name));

    expect([...names].filter((name) => !catalog.has(name))).toEqual([]);
    expect([...catalog].filter((name) => !names.has(name))).toEqual([]);
    // No duplicate catalog rows — the editor would render the same checkbox twice.
    expect(AGENT_TOOL_CATALOG.length).toBe(catalog.size);
  });

  it("grants knowledge retrieval to every role by default", () => {
    const withoutKnowledge = Object.entries(ROLE_TOOL_SETS)
      .filter(([, tools]) => !tools.includes("search_knowledge_base"))
      .map(([role]) => role);

    expect(withoutKnowledge).toEqual([]);
  });

  it("carries knowledge retrieval through the create path", () => {
    for (const isBusinessAgent of [true, false]) {
      for (const role of Object.keys(ROLE_TOOL_SETS)) {
        expect(
          resolveCreateEnabledTools(role, isBusinessAgent),
          `${role}/${isBusinessAgent}`,
        ).toContain("search_knowledge_base");
      }
    }
  });
});

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
        "log_to_google_sheets",
        "crm_create_contact",
        "crm_update_deal_stage",
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

  it("allows tenant-bound Google Sheets and CRM writes only with the required connections", () => {
    const connected = {
      ...NO_TENANT_INTEGRATIONS,
      google_sheets: true,
      hubspot: true,
    };
    expect(
      resolveAuthorizedAgentTools(
        ["log_to_google_sheets", "crm_create_contact", "crm_update_deal_stage"],
        { twilioMessaging: false, twilioLookup: false },
        connected,
      ),
    ).toEqual(["log_to_google_sheets", "crm_create_contact", "crm_update_deal_stage"]);
  });

  it("keeps platform-owned accounts out even when every connection and platform flag is present", () => {
    const allConnected = Object.fromEntries(
      Object.keys(NO_TENANT_INTEGRATIONS).map((key) => [key, true]),
    ) as typeof NO_TENANT_INTEGRATIONS;
    const filtered = filterToolsByTenantConnections(
      ["list_x_ad_campaigns", "get_x_ad_campaign_stats", "send_contract", "meta_submit_lead"],
      allConnected,
      { apollo: true, docusign: true, gemini: true, perplexity: true, liveResearch: true },
    );
    expect(filtered).toEqual([]);
  });

  it("keeps the platform-owned deny set explicit and reviewable", () => {
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
    const runtime = source.slice(
      source.indexOf("export async function isAgentToolExecutionAuthorized"),
    );
    const systemException = runtime.indexOf("if (isSystemRuntimeTool(name))");
    const identityLookup = runtime.indexOf("hasVerifiedAgentIdentity");
    const fullSnapshot = runtime.indexOf("loadAuthorizationSnapshot");
    expect(systemException).toBeGreaterThan(-1);
    expect(identityLookup).toBeGreaterThan(systemException);
    expect(fullSnapshot).toBeGreaterThan(identityLookup);
    expect(source).toContain("return NO_TENANT_INTEGRATIONS");
  });

  it("shares one in-flight authorization snapshot across a concurrent tool batch", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/agent-tool-authorization.ts"),
      "utf8",
    );
    expect(source).toContain("inFlightAuthorizationSnapshots");
    expect(source).toContain("const existing = inFlightAuthorizationSnapshots.get(key)");
    expect(source).toContain(".leftJoin(schema.settings");
    expect(source).toContain("inFlightAuthorizationSnapshots.delete(key)");
    expect(source).toContain("`tool:${context.toolCallId}`");
    expect(source).not.toContain('return "no-call"');
  });

  it("keeps the authorization catalog tied to the canonical tool registry", () => {
    expect(CANONICAL_AGENT_TOOL_NAMES).toContain("search_knowledge_base");
    expect(CANONICAL_AGENT_TOOL_NAMES).toContain("trigger_enterprise_webhook");
    expect(CANONICAL_AGENT_TOOL_NAMES).not.toContain("create_fleet_task");
  });

  it("checks authorization before the idempotency ledger and handlers", () => {
    const source = readFileSync(resolve(process.cwd(), "src/lib/agent-tool-dispatch.ts"), "utf8");
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

/*
 * `search_knowledge_base` truncated every entry to MAX_KB_RESULT_CHARS BEFORE
 * scoring it, so nothing documented past the first 600 characters — roughly a
 * short paragraph — could ever match. The entry scored zero, was filtered out,
 * and the caller heard NO_VERIFIED_MATCH: the agent said it had no verified
 * answer while the answer sat in its own knowledge base. Enabling this tool
 * fleet-wide made the defect reachable for every agent, so the window is now a
 * presentation concern applied on output, centred on the caller's match.
 */
describe("knowledge search reads the whole entry", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/routes/vapi/tool-handlers-core.ts"),
    "utf8",
  );

  it("never truncates before scoring", () => {
    const build = source.slice(
      source.indexOf("const snippets: Snippet[] = ["),
      source.indexOf("if (snippets.length === 0)"),
    );
    expect(build).not.toContain("MAX_KB_RESULT_CHARS");
    expect(build).toContain('content: (d.content || "").trim(),');
    expect(build).toContain('content: (k.content || "").trim(),');
  });

  it("applies the excerpt window on output, around the match", () => {
    expect(source).toContain("function excerptAroundMatch(");
    expect(source).toContain("excerptAroundMatch(s.content, queryTokens)");
    // The window must be anchored on the caller's token, not the entry start.
    expect(source).toContain("const index = lower.indexOf(token);");
    expect(source).toContain("Math.max(0, hit - Math.floor(MAX_KB_RESULT_CHARS / 3))");
  });
});
