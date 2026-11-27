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
  getDefaultAgentTools,
  readStoredAgentTools,
  resolveAgentTools,
} from "../src/lib/agent-capabilities";
import { buildAgentToolDefs } from "../src/lib/agent-runtime-helpers";
import { resolveCreateEnabledTools } from "../src/lib/agent-create-defaults";
import {
  CALLER_LINKED_LIVE_WRITE_TOOL_NAMES,
  PRIVATE_LIVE_READ_TOOL_NAMES,
  UNVERIFIED_LIVE_TOOL_NAMES,
} from "../src/lib/unverified-live-tools";

const privateLiveReads = ["search_leads", "view_recent_interactions"] as const;
const callerLinkedLiveWrites = ["update_lead_status", "schedule_callback"] as const;

/*
 * The tool name union, the UI/create-path catalog, and the per-role defaults
 * are three hand-maintained lists that must agree. `search_knowledge_base` sat
 * in the union but in neither of the other two for the life of the feature: the
 * handler was live, the tool definition existed, and the realtime voice path
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

  it("carries knowledge retrieval through the create path", () => {
    for (const isBusinessAgent of [true, false]) {
      expect(resolveCreateEnabledTools(isBusinessAgent), String(isBusinessAgent)).toContain(
        "search_knowledge_base",
      );
    }
  });
});

describe("agent tool execution authorization", () => {
  it("retains legacy private-read names for data compatibility but never authorizes them", () => {
    const allConnected = Object.fromEntries(
      Object.keys(NO_TENANT_INTEGRATIONS).map((key) => [key, true]),
    ) as typeof NO_TENANT_INTEGRATIONS;
    const selected = sanitizePersistedAgentToolSelection(privateLiveReads);

    expect([...PRIVATE_LIVE_READ_TOOL_NAMES].sort()).toEqual([...privateLiveReads].sort());

    for (const name of privateLiveReads) {
      expect(CANONICAL_AGENT_TOOL_NAMES).toContain(name);
      expect(selected).toContain(name);
    }
    expect(filterToolsByTenantConnections(privateLiveReads, allConnected)).toEqual([]);
    expect(resolveAuthorizedAgentTools(selected, { channels: ["voice"] }, allConnected)).toEqual(
      [],
    );
    const legacyActive = resolveAuthorizedAgentTools(null, { channels: ["voice"] }, allConnected);
    for (const name of privateLiveReads) expect(legacyActive).not.toContain(name);
  });

  it("retains caller-linked write names for compatibility but never authorizes live execution", () => {
    const allConnected = Object.fromEntries(
      Object.keys(NO_TENANT_INTEGRATIONS).map((key) => [key, true]),
    ) as typeof NO_TENANT_INTEGRATIONS;
    const selected = sanitizePersistedAgentToolSelection(callerLinkedLiveWrites);

    expect([...CALLER_LINKED_LIVE_WRITE_TOOL_NAMES].sort()).toEqual(
      [...callerLinkedLiveWrites].sort(),
    );
    expect([...UNVERIFIED_LIVE_TOOL_NAMES].sort()).toEqual(
      [...privateLiveReads, ...callerLinkedLiveWrites].sort(),
    );
    for (const name of callerLinkedLiveWrites) {
      expect(CANONICAL_AGENT_TOOL_NAMES).toContain(name);
      expect(selected).toContain(name);
    }
    expect(filterToolsByTenantConnections(callerLinkedLiveWrites, allConnected)).toEqual([]);
    expect(resolveAuthorizedAgentTools(selected, { channels: ["voice"] }, allConnected)).toEqual(
      [],
    );
    const legacyActive = resolveAuthorizedAgentTools(null, { channels: ["voice"] }, allConnected);
    for (const name of callerLinkedLiveWrites) expect(legacyActive).not.toContain(name);
  });

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
        "log_to_google_sheets",
        "list_x_ad_campaigns",
        "get_x_ad_campaign_stats",
        "send_contract",
      ],
      { twilioMessaging: false, twilioLookup: false, channels: ["email"] },
      NO_TENANT_INTEGRATIONS,
    );

    expect(active).toEqual(["send_email"]);
  });

  it("allows tenant-bound Google Sheets writes only with the required connection", () => {
    const connected = {
      ...NO_TENANT_INTEGRATIONS,
      google_sheets: true,
    };
    expect(
      resolveAuthorizedAgentTools(
        ["log_to_google_sheets"],
        { twilioMessaging: false, twilioLookup: false },
        connected,
      ),
    ).toEqual(["log_to_google_sheets"]);
  });

  it("allows selected calendar tools with native booking and no external account or email channel", () => {
    expect(
      resolveAuthorizedAgentTools(
        ["check_calendar_availability", "book_appointment"],
        { twilioMessaging: false, twilioLookup: false },
        { ...NO_TENANT_INTEGRATIONS, native_calendar: true, native_calendar_configured: true },
      ),
    ).toEqual(["check_calendar_availability", "book_appointment"]);
    expect(
      resolveAuthorizedAgentTools(
        [],
        {},
        { ...NO_TENANT_INTEGRATIONS, native_calendar: true, native_calendar_configured: true },
      ),
    ).toEqual([]);
  });

  it("does not bypass a native booking pause through an optional external calendar", () => {
    expect(
      resolveAuthorizedAgentTools(
        ["check_calendar_availability", "book_appointment"],
        {},
        {
          ...NO_TENANT_INTEGRATIONS,
          native_calendar_configured: true,
          native_calendar: false,
          google_calendar: true,
        },
      ),
    ).toEqual([]);
    expect(
      resolveAuthorizedAgentTools(
        ["book_appointment"],
        {},
        { ...NO_TENANT_INTEGRATIONS, google_calendar: true },
      ),
    ).toEqual(["book_appointment"]);
  });

  it("keeps platform-owned accounts out even when every connection and platform flag is present", () => {
    const allConnected = Object.fromEntries(
      Object.keys(NO_TENANT_INTEGRATIONS).map((key) => [key, true]),
    ) as typeof NO_TENANT_INTEGRATIONS;
    const filtered = filterToolsByTenantConnections(
      ["list_x_ad_campaigns", "get_x_ad_campaign_stats", "send_contract"],
      allConnected,
      { docusign: true, gemini: true, perplexity: true, liveResearch: true },
    );
    expect(filtered).toEqual([]);
  });

  it("keeps the platform-owned deny set explicit and reviewable", () => {
    expect([...UNSCOPED_PLATFORM_LIVE_TOOL_NAMES].sort()).toEqual(
      ["get_x_ad_campaign_stats", "list_x_ad_campaigns", "send_contract"].sort(),
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
    const systemException = runtime.indexOf(
      "if (isSystemRuntimeTool(name) || isAlwaysAvailableTool(name))",
    );
    const identityLookup = runtime.indexOf("hasVerifiedAgentIdentity");
    const fullSnapshot = runtime.indexOf("loadAuthorizationSnapshot");
    expect(systemException).toBeGreaterThan(-1);
    expect(identityLookup).toBeGreaterThan(systemException);
    expect(fullSnapshot).toBeGreaterThan(identityLookup);
    expect(source).toContain("return NO_TENANT_INTEGRATIONS");
  });

  it("gives every Bot the three actions it cannot do without, whatever its saved selection", async () => {
    // A call opens with a handful of facts, and a Bot whose selection left the
    // search out could never use the rest: thirty Bots were found that way.
    // Taking a message and honouring a do-not-call request were already
    // allowed to run for every Bot; all three are now offered to every Bot too.
    const { isAlwaysAvailableTool } = await import("../src/lib/agent-tool-authorization");
    expect(isAlwaysAvailableTool("search_knowledge_base")).toBe(true);
    expect(isSystemRuntimeTool("create_followup_task")).toBe(true);
    expect(isSystemRuntimeTool("add_to_dnc")).toBe(true);
    for (const other of ["send_email", "send_text_message", "book_appointment"]) {
      expect(isAlwaysAvailableTool(other) || isSystemRuntimeTool(other), other).toBe(false);
    }
    const always = ["search_knowledge_base", "create_followup_task", "add_to_dnc"];
    // Offered on a narrow selection, and on one that saved nothing at all.
    const names = (selection: unknown) =>
      buildAgentToolDefs(selection).map((tool) => (tool as { name: string }).name);
    expect(names(["book_appointment"])).toEqual(["book_appointment", ...always]);
    expect(names([])).toEqual(always);
    // Not listed twice when it was selected.
    expect(names(["search_knowledge_base", "book_appointment"])).toEqual([
      "search_knowledge_base",
      "book_appointment",
      "create_followup_task",
      "add_to_dnc",
    ]);
    const tenantList = readFileSync(
      resolve(process.cwd(), "src/lib/agent-runtime-helpers.ts"),
      "utf8",
    );
    expect(tenantList).toContain(
      "withAlwaysOnTools(allowed, (name) => isAgentToolChannelAllowed(name, entitlements.channels));",
    );
  });

  it("reads a saved selection the same way when offering tools and when running them", () => {
    // A name this code no longer knows used to switch the whole catalogue on
    // in the list offered to the model, while the run check refused the rest.
    expect(resolveAgentTools(["book_appointment", "retired_tool"])).toEqual(["book_appointment"]);
    expect(resolveAgentTools("book_appointment")).toEqual([]);
    expect(resolveAgentTools({})).toEqual([]);
    expect(resolveAgentTools(["book_appointment", "book_appointment"])).toEqual([
      "book_appointment",
    ]);
    // Never selected is still the full catalogue.
    expect(resolveAgentTools(null)).toEqual(getDefaultAgentTools());
    expect(resolveAgentTools(undefined)).toEqual(getDefaultAgentTools());
    for (const value of [["book_appointment", "retired_tool"], "x", {}, null, []]) {
      const sanitized = sanitizePersistedAgentToolSelection(value);
      expect(resolveAgentTools(value), JSON.stringify(value)).toEqual(
        sanitized === null ? getDefaultAgentTools() : [...sanitized],
      );
    }
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
  const source = readFileSync(resolve(process.cwd(), "src/lib/bot-tools/core.ts"), "utf8");
  const search = readFileSync(resolve(process.cwd(), "src/lib/agent-knowledge-search.ts"), "utf8");

  it("never truncates before scoring", () => {
    const rank = search.slice(
      search.indexOf("function ranked("),
      search.indexOf("/**", search.indexOf("function ranked(")),
    );
    expect(rank).not.toContain("maxChars");
    expect(rank).toContain(".map((row) => ({ ...row, content: row.content.trim() }))");
    expect(rank).toContain("knowledgeMatchScore(row.content, words, phrase)");
  });

  it("applies the excerpt window on output, around the match", () => {
    expect(search).toContain("export function excerptAroundMatch(");
    expect(source).toContain("excerptAroundMatch(match.content, words, MAX_KB_RESULT_CHARS)");
    // The window is anchored on the caller's words, not the entry start, and
    // of every place they occur it is the one that holds the most of them.
    expect(search).toContain("let index = lower.indexOf(word);");
    expect(search).toContain("Math.max(0, hit - Math.floor(maxChars / 3))");
    expect(search).toContain("if (held > best) {");
  });
});

/**
 * In production 93 of 94 Bots hold at least one retired tool name (the old
 * Shopify, Square and CRM actions). The screens that show a Bot's actions read
 * such a list as "nobody chose", ticked every action, and saved that back when
 * the owner pressed Save or switched one action in chat.
 */
describe("a saved selection that holds a retired name", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  const saved = [
    "send_email",
    "shopify_lookup_order",
    "book_appointment",
    "send_email",
    "crm_log_call",
  ];

  it("is read as what the Bot has, never as no selection", () => {
    expect(readStoredAgentTools(saved)).toEqual(["send_email", "book_appointment"]);
    expect(resolveAgentTools(saved)).toEqual(["send_email", "book_appointment"]);
    expect(readStoredAgentTools(["shopify_lookup_order"])).toEqual([]);
    expect(readStoredAgentTools([])).toEqual([]);
    expect(readStoredAgentTools("send_email")).toEqual([]);
    expect(readStoredAgentTools({})).toEqual([]);
    // Only a Bot nobody chose for keeps the full catalogue.
    expect(readStoredAgentTools(null)).toBeNull();
    expect(readStoredAgentTools(undefined)).toBeNull();
    // The check that runs before a tool is used reads it the same way.
    expect(sanitizePersistedAgentToolSelection(saved)).toEqual(readStoredAgentTools(saved));
    expect(sanitizePersistedAgentToolSelection(null)).toBeNull();
  });

  it("is shown that way by the screens that save it back", () => {
    for (const path of ["src/routes/agent-routes-v2.ts", "src/routes/mobile-routes.ts"]) {
      const source = read(path);
      expect(source, path).toContain("enabledTools: readStoredAgentTools(record?.enabledTools),");
      expect(source, path).not.toContain(
        "enabledTools: normalizeEnabledTools(record?.enabledTools)",
      );
    }
    // Set Up ticks what the server sent, and chat's one-action switch starts
    // from the same reading.
    expect(read("src/components/AgentToolPermissions.tsx")).toContain(
      "setEnabled(resolveAgentTools(config.enabledTools));",
    );
    expect(read("src/routes/agent-workspace-routes.ts")).toContain(
      "const current = resolveAgentTools(agent.enabledTools);",
    );
  });
});
