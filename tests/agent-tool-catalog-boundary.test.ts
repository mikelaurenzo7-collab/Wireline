import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../src/lib/agent-tool-idempotency", () => ({ runIdempotentAgentToolCall: h.execute }));
vi.mock("../src/lib/tenant-integration-connections", async (original) => ({
  ...(await original<typeof import("../src/lib/tenant-integration-connections")>()),
  loadTenantIntegrationConnections: async () => ({}),
}));
vi.mock("../src/lib/channel-entitlements", () => ({
  getTenantChannelEntitlements: async () => ({ channels: [] }),
}));

import { AGENT_TOOL_NAME_VALUES } from "../src/lib/agent-capabilities";
import { dispatchAgentToolCall } from "../src/lib/agent-tool-dispatch";
import type { ToolCallContext } from "../src/lib/agent-tool-types";

describe("live tool ownership across the catalog", () => {
  it.each(AGENT_TOOL_NAME_VALUES)("%s cannot run for a Bot outside the caller's workspace", async (name) => {
    h.execute.mockClear();
    const dialect = new PgDialect();
    const row = { id: "foreign-bot", enabledTools: [name] };
    let ownedFilter = false;
    const select = {
      from: () => select,
      leftJoin: () => select,
      where: (condition: SQL) => {
        const { params, sql } = dialect.sqlToQuery(condition);
        ownedFilter = sql.includes('"user_id"') && params.includes("qa-workspace");
        return select;
      },
      limit: async () => (ownedFilter ? [] : [row]),
    };
    const context = {
      toolCallId: name,
      payload: {},
      message: {},
      agent: { id: row.id, user_id: "qa-workspace" },
      webhookAgentId: row.id,
      drizzle: { select: () => select },
      log: { warn: vi.fn(), error: vi.fn() },
    } satisfies ToolCallContext;

    const result = await dispatchAgentToolCall(name, {}, context);
    expect(result.toolCallId).toBe(name);
    expect(result.result).toContain("Do not claim it ran");
    expect(h.execute).not.toHaveBeenCalled();
    expect(context.log.error).not.toHaveBeenCalled();
  });
});
