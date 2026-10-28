import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { AppError } from "../src/lib/api-error";
import { requestedMcpScopes } from "../src/lib/chatgpt-mcp";

const h = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  agent: { role: "personal_assistant", isBusinessAgent: false },
  status: vi.fn(),
  channel: vi.fn(),
}));
vi.mock("../src/lib/channel-entitlements", () => ({ requireTenantChannel: h.channel }));
vi.mock("../src/lib/voice/openai-outbound-placement", () => ({
  readNativeOutboundRequestStatus: h.status,
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => {
      let table = "";
      let params: unknown[] = [];
      const query = {
        from: (value: Parameters<typeof getTableName>[0]) => {
          table = getTableName(value);
          return query;
        },
        where: (value: SQL) => {
          params = new PgDialect().sqlToQuery(value).params;
          return query;
        },
        limit: async () => {
          if (table === "wireline_agents") return params[0] === "owner" ? [h.agent] : [];
          const row = h.rows.get(`${params[0]}:${params[3]}`);
          return row ? [{ metadata: row.metadata }] : [];
        },
      };
      return query;
    },
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            const key = `${row.userId}:${row.idempotencyKey}`;
            if (h.rows.has(key)) return [];
            h.rows.set(key, row);
            return [{ id: 1n }];
          },
        }),
      }),
    }),
  },
}));
import {
  assertPreparedCallMatches,
  prepareCall,
  preparedCallStatus,
  readPreparedCall,
} from "../src/lib/prepared-call";

const input = {
  request_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  agent_id: "bot",
  phone: "+13125550123",
  instruction: "Confirm the time of my requested appointment.",
  call_purpose: "service_or_requested" as const,
};
const placement = {
  userId: "owner",
  preparedRequestId: input.request_key,
  requestKey: input.request_key,
  agentId: input.agent_id,
  customerNumber: input.phone,
  context: input.instruction,
  callPurpose: input.call_purpose,
};
beforeEach(() => {
  h.rows.clear();
  vi.resetAllMocks();
  h.agent = { role: "personal_assistant", isBusinessAgent: false };
  vi.stubEnv("BOTBOUND_NON_MARKETING_OUTBOUND_ENABLED", "true");
  vi.stubEnv("BOTBOUND_GENERAL_OUTBOUND_ENABLED", "false");
  h.status.mockRejectedValue(AppError.notFound());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("call proposal and receipt", () => {
  it("rejects UUID versions that cannot be retained by call recovery before creating a proposal", async () => {
    await expect(
      prepareCall("owner", { ...input, request_key: "aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(h.rows.size).toBe(0);
    expect(h.channel).not.toHaveBeenCalled();
  });
  it("stores one immutable proposal across concurrent retries without dispatching or reading a call", async () => {
    const results = await Promise.all([prepareCall("owner", input), prepareCall("owner", input)]);
    expect(results[0]).toEqual(results[1]);
    expect(h.rows.size).toBe(1);
    expect(h.status).not.toHaveBeenCalled();
    await expect(prepareCall("owner", { ...input, phone: "+13125550999" })).rejects.toThrow(
      "different call",
    );
  });
  it("keeps another tenant from reviewing or reading its status", async () => {
    await prepareCall("owner", input);
    await expect(readPreparedCall("other", input.request_key)).rejects.toMatchObject({
      status: 404,
    });
    await expect(preparedCallStatus("other", input.request_key)).rejects.toMatchObject({
      status: 404,
    });
    expect(h.status).not.toHaveBeenCalled();
  });
  it("requires the exact saved destination, instruction, Bot, purpose, and request key at review", async () => {
    await prepareCall("owner", input);
    await expect(assertPreparedCallMatches(placement)).resolves.toMatchObject(input);
    for (const change of [
      { customerNumber: "+13125550999" },
      { context: "Something else" },
      { agentId: "other" },
      { requestKey: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      { callPurpose: "callback" as const },
      { callPurpose: "marketing_or_sales" as const },
      { callPurpose: "personal" as const },
      { callPurpose: "appointment_service" as const },
    ])
      await expect(assertPreparedCallMatches({ ...placement, ...change })).rejects.toMatchObject({
        status: 409,
      });
  });
  it("expires unplaced proposals but still reports an existing carrier receipt after expiry", async () => {
    const draft = await prepareCall("owner", input);
    expect(await preparedCallStatus("owner", input.request_key)).toMatchObject({
      status: "awaiting_review",
      terminal: false,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.parse(draft.expires_at) + 1));
    await expect(assertPreparedCallMatches(placement)).rejects.toThrow("expired");
    expect(await preparedCallStatus("owner", input.request_key)).toMatchObject({
      status: "expired",
      terminal: true,
    });
    h.status.mockResolvedValue({
      status: "accepted",
      terminal: false,
      requestKey: input.request_key,
    });
    expect(await preparedCallStatus("owner", input.request_key)).toMatchObject({
      status: "accepted",
      terminal: false,
    });
  });
  it("keeps outage status unknown instead of treating it as permission to place again", async () => {
    await prepareCall("owner", input);
    h.status.mockRejectedValue(AppError.serviceUnavailable("Receipt needs reconciliation"));
    await expect(preparedCallStatus("owner", input.request_key)).rejects.toMatchObject({
      status: 503,
    });
  });
  it("rejects marketing and permits a business service call", async () => {
    await expect(
      prepareCall("owner", { ...input, call_purpose: "marketing_or_sales" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(h.rows.size).toBe(0);
    h.agent = { role: "receptionist", isBusinessAgent: true };
    await expect(prepareCall("owner", input)).resolves.toMatchObject(input);
    expect(h.rows.size).toBe(1);
  });
  it("requires explicit new OAuth consent; old default grants cannot read or prepare calls", () => {
    expect(requestedMcpScopes(undefined)).not.toContain("calls.prepare");
    expect(requestedMcpScopes(undefined)).not.toContain("calls.read");
    expect(requestedMcpScopes("agents.read calls.prepare calls.read unknown")).toEqual([
      "agents.read",
      "calls.prepare",
      "calls.read",
    ]);
  });
});
