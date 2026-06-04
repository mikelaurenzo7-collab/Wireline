import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    callUserId: "owner-user" as string | null,
    updateCalls: [] as Array<{ table: string; values: Record<string, unknown> }>,
    connectionHandlers: [] as Array<(ws: MockWs, req: IncomingMessage) => void>,
    lastWs: null as MockWs | null,
  };

  const schema = {
    callLogs: {
      __name: "callLogs",
      vapiCallId: "callLogs.vapiCallId",
      userId: "callLogs.userId",
      coachingNote: "callLogs.coachingNote",
    },
    supervisorSubscriptions: {
      __name: "supervisorSubscriptions",
      callId: "supervisorSubscriptions.callId",
      userId: "supervisorSubscriptions.userId",
      note: "supervisorSubscriptions.note",
    },
  };

  const drizzle = {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve(
              state.callUserId ? [{ userId: state.callUserId, vapiCallId: "call-abc" }] : [],
            ),
        }),
      }),
    })),
    update: vi.fn((table: { __name: string }) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          state.updateCalls.push({ table: table.__name, values });
          return Promise.resolve();
        },
      }),
    })),
  };

  return { state, schema, drizzle };
});

type MockWs = EventEmitter & {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

function createMockWs(): MockWs {
  const ws = new EventEmitter() as MockWs;
  ws.readyState = 1;
  ws.send = vi.fn();
  ws.close = vi.fn();
  return ws;
}

vi.mock("ws", () => ({
  WebSocketServer: vi.fn().mockImplementation(() => {
    const server = new EventEmitter();
    (server as EventEmitter & { on: typeof EventEmitter.prototype.on }).on = function on(
      event: string,
      fn: (ws: MockWs, req: IncomingMessage) => void,
    ) {
      if (event === "connection") h.state.connectionHandlers.push(fn);
      return EventEmitter.prototype.on.call(this, event, fn as (...args: unknown[]) => void);
    };
    (server as { handleUpgrade: ReturnType<typeof vi.fn> }).handleUpgrade = vi.fn(
      (_req: IncomingMessage, _socket: unknown, _head: unknown, cb: (ws: MockWs) => void) => {
        const ws = createMockWs();
        h.state.lastWs = ws;
        cb(ws);
        server.emit("connection", ws, _req);
      },
    );
    return server;
  }),
  WebSocket: { OPEN: 1 },
}));

vi.mock("../lib/server-context", () => ({
  drizzle: h.drizzle,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/auth-utils", () => ({
  verifyInternalJwt: vi.fn(async () => ({
    sub: "owner-user",
    email: "owner@example.com",
  })),
}));

vi.mock("../lib/internal-jwt-secret", () => ({
  requireInternalJwtSecret: () => "test-secret-that-is-long-enough-for-jwt",
}));

vi.mock("drizzle-orm", () => ({
  eq: (left: string, right: unknown) => ({ op: "eq", left, right }),
  and: (...conditions: unknown[]) => ({ op: "and", conditions }),
}));

vi.mock("../db/schema", () => h.schema);

describe("supervisor websocket service", () => {
  beforeEach(() => {
    h.state.callUserId = "owner-user";
    h.state.updateCalls = [];
    h.state.connectionHandlers = [];
    h.state.lastWs = null;
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function openWhisper(
    callUserId: string | null,
    reqOverrides?: Partial<IncomingMessage> & { url?: string },
  ): Promise<MockWs> {
    h.state.callUserId = callUserId;
    const prevNodeEnv = process.env.NODE_ENV;
    const prevVercel = process.env.VERCEL;
    const { initSupervisorWebSocketServer } = await import("./supervisor-websocket-service");
    const server = new EventEmitter();
    initSupervisorWebSocketServer(server);

    const req = {
      url: "/api/supervisor/stream?callId=call-abc&mode=whisper",
      headers: { cookie: "wireline_session=tok" },
      ...reqOverrides,
    } as IncomingMessage;

    server.emit("upgrade", req, {}, Buffer.alloc(0));
    await new Promise((r) => setTimeout(r, 30));
    if (!h.state.lastWs) throw new Error("WebSocket connection was not opened");
    process.env.NODE_ENV = prevNodeEnv;
    if (prevVercel !== undefined) process.env.VERCEL = prevVercel;
    return h.state.lastWs;
  }

  it("rejects ?token= query auth in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";
    const ws = await openWhisper("owner-user", {
      url: "/api/supervisor/stream?callId=call-abc&mode=whisper&token=legacy-jwt",
      headers: {},
    });
    expect(ws.close).toHaveBeenCalledWith(4001, expect.stringContaining("Query token"));
    expect(h.state.updateCalls).toEqual([]);
  });

  it("closes whisper connections when the call belongs to another user", async () => {
    const ws = await openWhisper("other-tenant");
    expect(ws.close).toHaveBeenCalledWith(4004, "Call not found");
    expect(h.state.updateCalls).toEqual([]);
  });

  it("updates call logs for the authenticated owner on whisper messages", async () => {
    const ws = await openWhisper("owner-user");
    ws.emit("message", JSON.stringify({ type: "whisper", text: "coach this" }));
    await new Promise((r) => setTimeout(r, 30));

    expect(h.state.updateCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "callLogs",
          values: { coachingNote: "coach this" },
        }),
      ]),
    );
  });
});
