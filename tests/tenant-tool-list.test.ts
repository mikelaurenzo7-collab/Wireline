import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The list of actions a real call is given. In production 93 of 94 Bots hold
 * a retired action name in their saved selection, and one such name used to
 * switch the whole catalogue on here while the check that runs before an
 * action refused everything the owner had not selected. The first fix dropped
 * the retired names and, with them, the message-taking action from every Bot
 * whose saved list had left it out.
 */
const h = vi.hoisted(() => ({
  cached: vi.fn(),
  store: vi.fn(),
  channels: vi.fn(),
  connections: vi.fn(),
}));
vi.mock("../src/lib/tenant-tools-cache", () => ({
  getCachedTenantToolDefs: h.cached,
  setCachedTenantToolDefs: h.store,
}));
vi.mock("../src/lib/channel-entitlements", () => ({ getTenantChannelEntitlements: h.channels }));
vi.mock("../src/lib/tenant-integration-connections", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadTenantIntegrationConnections: h.connections,
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {},
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { ALWAYS_ON_AGENT_TOOL_NAMES, getDefaultAgentTools } from "../src/lib/agent-capabilities";
import { buildAgentToolDefsForTenant } from "../src/lib/agent-runtime-helpers";
import {
  resolveAuthorizedAgentTools,
  sanitizePersistedAgentToolSelection,
} from "../src/lib/agent-tool-authorization";

const connections = {
  slack: false,
  x: false,
  microsoft_teams: false,
  microsoft_excel: false,
  google_sheets: false,
  zoom: false,
  native_calendar: true,
  native_calendar_configured: true,
  google_calendar: false,
  microsoft_calendar: false,
};
const names = (tools: object[]) => tools.map((tool) => String((tool as { name?: unknown }).name));
const offered = async (saved: unknown) =>
  names(
    await buildAgentToolDefsForTenant(saved, "tenant-1", null, {
      twilioMessaging: true,
      twilioLookup: true,
    }),
  );

beforeEach(() => {
  vi.resetAllMocks();
  h.cached.mockResolvedValue(null);
  h.store.mockResolvedValue(undefined);
  h.channels.mockResolvedValue({ channels: ["voice", "sms", "email"] });
  h.connections.mockResolvedValue(connections);
});

describe("the actions a call is given", () => {
  // A real saved list: what the owner ticked, among actions since retired.
  const saved = ["book_appointment", "escalate_to_human", "shopify_lookup_order", "crm_log_call"];

  it("offers what the owner selected, never the whole catalogue for a retired name", async () => {
    const tools = await offered(saved);
    expect(tools).toEqual(expect.arrayContaining(["book_appointment", "escalate_to_human"]));
    for (const unselected of ["send_email", "send_text_message", "post_x_tweet", "play_music"]) {
      expect(tools, unselected).not.toContain(unselected);
    }
    expect(tools.length).toBeLessThan(getDefaultAgentTools().length / 2);
  });

  it("always offers the three every Bot has, whatever was ticked", async () => {
    expect(ALWAYS_ON_AGENT_TOOL_NAMES).toEqual([
      "search_knowledge_base",
      "create_followup_task",
      "add_to_dnc",
    ]);
    for (const selection of [saved, [], ["shopify_lookup_order"], "not a list"]) {
      const tools = await offered(selection);
      for (const always of ALWAYS_ON_AGENT_TOOL_NAMES) {
        expect(tools, `${JSON.stringify(selection)} ${always}`).toContain(always);
      }
      // Once each.
      expect(new Set(tools).size).toBe(tools.length);
    }
    // A Bot with nothing selected has those three and nothing else.
    expect((await offered([])).sort()).toEqual([...ALWAYS_ON_AGENT_TOOL_NAMES].sort());
  });

  it("offers them on a list served from the cache too", async () => {
    h.cached.mockResolvedValue([
      { name: "book_appointment", description: "Book.", parameters: {} },
    ]);
    const tools = await offered(saved);
    expect(tools).toEqual(
      expect.arrayContaining(["book_appointment", ...ALWAYS_ON_AGENT_TOOL_NAMES]),
    );
    expect(h.connections).not.toHaveBeenCalled();
  });

  it("offers nothing a call may not run: the offer never exceeds the check", async () => {
    const flags = {
      aiTier: null,
      twilioMessaging: true,
      twilioLookup: true,
      channels: ["voice", "sms", "email"] as never,
    };
    for (const selection of [saved, [], ["send_email", "send_text_message", "book_appointment"]]) {
      const allowed = new Set<string>([
        ...resolveAuthorizedAgentTools(
          sanitizePersistedAgentToolSelection(selection),
          flags,
          connections as never,
        ),
        // Always allowed by the execution check, whatever the selection.
        ...ALWAYS_ON_AGENT_TOOL_NAMES,
      ]);
      for (const tool of await offered(selection)) {
        expect(allowed.has(tool), `${JSON.stringify(selection)} offers ${tool}`).toBe(true);
      }
    }
  });

  it("keeps the full catalogue only for a Bot nobody chose for", async () => {
    const tools = await offered(null);
    expect(tools).toEqual(
      expect.arrayContaining(["book_appointment", "send_email", "send_text_message"]),
    );
    expect(tools.length).toBeGreaterThan(10);
  });

  it("does not offer a customer send the plan no longer covers", async () => {
    h.channels.mockResolvedValue({ channels: ["voice"] });
    const tools = await offered(["send_email", "send_text_message", "book_appointment"]);
    expect(tools).not.toContain("send_email");
    expect(tools).not.toContain("send_text_message");
    expect(tools).toEqual(
      expect.arrayContaining(["book_appointment", ...ALWAYS_ON_AGENT_TOOL_NAMES]),
    );
  });
});
