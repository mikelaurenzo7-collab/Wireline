import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// Loaded at collection time (outside every test's timeout) with the mocked
// provider boundary below.
import twilioWebhookRouter from "../src/routes/twilio-webhook-base";

const CALL_SID = `CA${"4".repeat(32)}`;
const RECORDING_URL = `https://api.twilio.com/2010-04-01/Accounts/AC${"1".repeat(32)}/Recordings/RE${"3".repeat(32)}`;

type UpdateRecord = { table: unknown; values: Record<string, unknown>; where: unknown };
type SelectRecord = { table: unknown; where: unknown };

const h = vi.hoisted(() => ({
  state: {
    updateResponses: [] as unknown[][],
    selectResponses: [] as unknown[][],
    updates: [] as UpdateRecord[],
    selects: [] as SelectRecord[],
  },
  auth: { ok: true as boolean },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../src/lib/server-context", () => {
  const updateChain = (table: unknown) => {
    const record: UpdateRecord = { table, values: {}, where: null };
    h.state.updates.push(record);
    const chain: any = {};
    chain.set = (values: Record<string, unknown>) => {
      record.values = values;
      return chain;
    };
    chain.where = (condition: unknown) => {
      record.where = condition;
      return chain;
    };
    chain.returning = async () => h.state.updateResponses.shift() ?? [];
    return chain;
  };
  const selectChain = () => {
    const record: SelectRecord = { table: null, where: null };
    h.state.selects.push(record);
    const chain: any = {};
    chain.from = (table: unknown) => {
      record.table = table;
      return chain;
    };
    chain.leftJoin = () => chain;
    chain.where = (condition: unknown) => {
      record.where = condition;
      return chain;
    };
    chain.orderBy = () => chain;
    chain.limit = async () => h.state.selectResponses.shift() ?? [];
    return chain;
  };
  return {
    drizzle: { update: updateChain, select: selectChain },
    log: h.log,
    tenantStore: { run: (_userId: string, operation: () => unknown) => operation() },
    fetchWithTimeout: vi.fn(),
  };
});

vi.mock("../src/lib/twilio-webhook-auth", () => ({
  evaluateTwilioWebhookAuth: () => h.auth,
}));

function fakeResponse() {
  const captured = { statusCode: 200, body: undefined as unknown };
  const response: any = {
    setHeader: vi.fn(() => response),
    set: vi.fn(() => response),
    status: vi.fn((statusCode: number) => {
      captured.statusCode = statusCode;
      return response;
    }),
    send: vi.fn((body: unknown) => {
      captured.body = body;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      captured.body = body;
      return response;
    }),
    end: vi.fn(() => response),
  };
  return { response, captured };
}

function routeHandler(router: any, path: string) {
  const layer = router.stack.find((candidate: any) => candidate.route?.path === path);
  if (!layer) throw new Error(`Route not found: ${path}`);
  return layer.route.stack[0].handle as (
    request: any,
    response: any,
    next: () => void,
  ) => Promise<unknown>;
}

function loadRecordingRoute() {
  return routeHandler(twilioWebhookRouter, "/api/twilio-webhook/live-recording-complete");
}

function completedBody(overrides: Record<string, unknown> = {}) {
  return {
    path: "/api/twilio-webhook/live-recording-complete",
    body: {
      RecordingStatus: "completed",
      RecordingUrl: RECORDING_URL,
      CallSid: CALL_SID,
      AccountSid: `AC${"1".repeat(32)}`,
      ...overrides,
    },
  };
}

function whereSql(record: { where: unknown }): { sql: string; params: unknown[] } {
  return new PgDialect().sqlToQuery(record.where as never) as {
    sql: string;
    params: unknown[];
  };
}

beforeEach(() => {
  h.auth.ok = true;
  h.state.updateResponses = [];
  h.state.selectResponses = [];
  h.state.updates = [];
  h.state.selects = [];
  h.log.info.mockClear();
  h.log.warn.mockClear();
  h.log.error.mockClear();
});

describe("live-call recording completion callback", () => {
  it("stores the recording on the call row keyed by the exact Twilio parent SID", async () => {
    h.state.updateResponses = [[{ id: 7n }]];
    const handler = loadRecordingRoute();
    const { response, captured } = fakeResponse();

    await handler(completedBody(), response, vi.fn());

    expect(captured.statusCode).toBe(204);
    expect(h.state.updates).toHaveLength(1);
    const [update] = h.state.updates;
    // The one and only row touched is the call log, selected by the immutable
    // parent-SID column. No lead row is read or written for attribution.
    expect(getTableName(update.table as never)).toBe("wireline_call_logs");
    expect(update.values).toEqual({ recordingUrl: RECORDING_URL });
    const where = whereSql(update);
    expect(where.sql).toContain("twilio_parent_call_sid");
    expect(where.sql).toContain("recording_url");
    expect(where.sql).toMatch(/is null/i);
    expect(where.params).toContain(CALL_SID);
    expect(h.state.selects).toEqual([]);
  });

  it("does not re-attribute or overwrite a recording that is already stored", async () => {
    h.state.updateResponses = [[]];
    h.state.selectResponses = [[{ id: 7n }]];
    const handler = loadRecordingRoute();
    const { response, captured } = fakeResponse();

    await handler(completedBody(), response, vi.fn());

    expect(captured.statusCode).toBe(204);
    expect(h.state.updates).toHaveLength(1);
    expect(h.state.selects).toHaveLength(1);
    expect(getTableName(h.state.selects[0].table as never)).toBe("wireline_call_logs");
    expect(h.log.warn).not.toHaveBeenCalled();
  });

  it("ignores an unmatched callback without falling back to placement metadata", async () => {
    h.state.updateResponses = [[]];
    h.state.selectResponses = [[]];
    const handler = loadRecordingRoute();
    const { response, captured } = fakeResponse();

    await handler(completedBody(), response, vi.fn());

    expect(captured.statusCode).toBe(204);
    expect(h.state.updates).toHaveLength(1);
    expect(h.log.warn).toHaveBeenCalledWith(
      "Live recording callback matched no call",
      expect.objectContaining({ call_sid_suffix: expect.any(String) }),
    );
  });

  it("never stores an incomplete or malformed recording callback", async () => {
    const handler = loadRecordingRoute();

    for (const body of [
      completedBody({ RecordingStatus: "in-progress" }),
      completedBody({ RecordingStatus: "" }),
      completedBody({ RecordingUrl: "" }),
      completedBody({ CallSid: "not-a-call-sid" }),
    ]) {
      const { response, captured } = fakeResponse();
      await handler(body, response, vi.fn());
      expect(captured.statusCode).toBe(204);
    }
    expect(h.state.updates).toEqual([]);
  });

  it("rejects an unsigned callback before touching any call row", async () => {
    h.auth.ok = false;
    const handler = loadRecordingRoute();
    const { response, captured } = fakeResponse();

    await handler(completedBody(), response, vi.fn());

    expect(captured.statusCode).toBe(403);
    expect(h.state.updates).toEqual([]);
    expect(h.state.selects).toEqual([]);
  });
});

describe("outbound recording decision snapshot", () => {
  it("pins the owner's choice into each new carrier placement", async () => {
    const { resetNativeOutboundPlacementMetadata } =
      await import("../src/lib/voice/openai-outbound-placement");
    const base = {
      callPurpose: "service_or_requested" as const,
      outboundLineNumber: "+13125550100",
      placementId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      claimedAt: new Date("2026-10-24T12:00:00.000Z"),
      created: true,
    };

    const recorded = resetNativeOutboundPlacementMetadata(
      {},
      { ...base, callRecordingEnabled: true },
    );
    expect((recorded.native_voice as Record<string, unknown>).call_recording_enabled).toBe(true);

    // A redial starts a fresh placement whose snapshot is the then-current
    // owner choice; the previous placement never leaks into the next call.
    const redialed = resetNativeOutboundPlacementMetadata(recorded, {
      ...base,
      created: false,
      callRecordingEnabled: false,
    });
    expect((redialed.native_voice as Record<string, unknown>).call_recording_enabled).toBe(false);
  });
});
