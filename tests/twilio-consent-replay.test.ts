import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sid: "",
  receipts: new Set<string>(),
  writes: [] as Record<string, unknown>[],
  failTransaction: false,
  failClear: false,
  failsafe: false,
  clear: vi.fn(),
  record: vi.fn(),
  evidence: vi.fn(),
  allowed: true,
}));

vi.mock("../src/lib/server-context", () => {
  const tx = {
    execute: async () => undefined,
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => (h.receipts.has(h.sid) ? [{ id: 1n }] : []) }),
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => {
        h.writes.push(row);
        if (row.metadata && typeof row.metadata === "object") {
          const sid = (row.metadata as Record<string, unknown>).twilio_message_sid;
          if (typeof sid === "string") h.receipts.add(sid);
        }
        return { onConflictDoNothing: async () => [] };
      },
    }),
    delete: () => ({ where: async () => [] }),
  };
  return {
    drizzle: {
      transaction: async (operation: (db: typeof tx) => Promise<unknown>) => {
        if (h.failTransaction) throw new Error("database unavailable");
        return operation(tx);
      },
    },
    tenantStore: { run: async (_id: string, operation: () => Promise<unknown>) => operation() },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});
vi.mock("../src/routes/twilio-webhook-base", async () => {
  const { Router } = await vi.importActual<typeof import("express")>("express");
  return {
    default: Router(),
    lookupMessagingDestination: async () => ({
      userId: "tenant",
      agentId: null,
      destinationNumber: "+13125550101",
    }),
    persistInboundSmsEvidence: h.evidence,
  };
});
vi.mock("../src/lib/dnc-failsafe", () => ({
  clearDncFailsafe: h.clear,
  recordDncFailsafe: h.record,
}));
vi.mock("../src/lib/twilio-webhook-auth", () => ({
  evaluateTwilioWebhookAuth: () => ({ ok: true }),
}));
vi.mock("../src/lib/twilio-inbound-environment", () => ({
  resolveTwilioInboundEnvironment: async () => ({
    allowed: h.allowed,
    environment: h.allowed ? "production" : "demo",
  }),
}));
vi.mock("../src/lib/error-reporter", () => ({ reportError: vi.fn() }));
vi.mock("../src/lib/twilio-usage-alert-idempotency", () => ({ claimTwilioUsageAlert: vi.fn() }));

import router from "../src/routes/twilio-webhook";

const layer = router.stack.find((item) => item.route?.path === "/api/twilio-webhook/sms");
const handler = layer!.route!.stack[0].handle;
const empty = '<?xml version="1.0" encoding="UTF-8"?><Response/>';
async function deliver(body: string, sid: string, advanced = false) {
  h.sid = sid;
  const result = { status: 200, body: "" };
  const response = {
    setHeader: vi.fn(),
    status: (status: number) => {
      result.status = status;
      return response;
    },
    send: (text: string) => {
      result.body = text;
      return response;
    },
  };
  await handler(
    {
      body: {
        Body: body,
        MessageSid: sid,
        From: "+13125550102",
        To: "+13125550101",
        ...(advanced ? { OptOutType: body } : {}),
      },
    } as never,
    response as never,
    vi.fn(),
  );
  return result;
}

beforeEach(() => {
  h.sid = "";
  h.receipts.clear();
  h.writes = [];
  h.failTransaction = false;
  h.failClear = false;
  h.failsafe = false;
  h.allowed = true;
  vi.clearAllMocks();
  h.evidence.mockResolvedValue(undefined);
  h.clear.mockImplementation(async () => {
    if (h.failClear) return false;
    h.failsafe = false;
    return true;
  });
  h.record.mockImplementation(async () => {
    h.failsafe = true;
    return true;
  });
});

describe("idempotent SMS consent confirmations", () => {
  it.each(["STOP", "START", "HELP"])(
    "does not send another paid legacy %s confirmation on redelivery",
    async (body) => {
      const first = await deliver(body, "SM-first");
      expect(first.status).toBe(200);
      expect(first.body).toContain("<Message>");
      const writeCount = h.writes.length;
      const clearCount = h.clear.mock.calls.length;
      await expect(deliver(body, "SM-first")).resolves.toEqual({ status: 200, body: empty });
      expect(h.writes).toHaveLength(writeCount);
      expect(h.clear).toHaveBeenCalledTimes(clearCount);
      expect(h.evidence).toHaveBeenCalledTimes(2);
    },
  );

  it("does not let an old START replay remove a later emergency STOP", async () => {
    await deliver("START", "SM-start-old");
    expect(h.clear).toHaveBeenCalledOnce();
    h.failTransaction = true;
    const stop = await deliver("STOP", "SM-stop-new");
    expect(stop.body).toContain("couldn't process your unsubscribe");
    expect(h.failsafe).toBe(true);
    h.failTransaction = false;
    await expect(deliver("START", "SM-start-old")).resolves.toEqual({ status: 200, body: empty });
    expect(h.clear).toHaveBeenCalledOnce();
    expect(h.failsafe).toBe(true);
  });

  it("keeps failed START recovery closed until a fresh START succeeds", async () => {
    h.failsafe = true;
    h.failClear = true;
    const failed = await deliver("START", "SM-start-failed");
    expect(failed.body).toContain("Please reply START again");
    expect(h.failsafe).toBe(true);
    h.failClear = false;
    await expect(deliver("START", "SM-start-failed")).resolves.toEqual({
      status: 200,
      body: empty,
    });
    expect(h.failsafe).toBe(true);
    expect(h.clear).toHaveBeenCalledOnce();
    const recovered = await deliver("START", "SM-start-fresh");
    expect(recovered.body).toContain("You have been resubscribed");
    expect(h.clear).toHaveBeenCalledTimes(2);
    expect(h.failsafe).toBe(false);
  });

  it.each(["STOP", "START", "HELP"])(
    "preserves carrier-owned Advanced Opt-Out %s confirmations",
    async (body) => {
      await expect(deliver(body, "SM-advanced", true)).resolves.toEqual({
        status: 200,
        body: empty,
      });
      await expect(deliver(body, "SM-advanced", true)).resolves.toEqual({
        status: 200,
        body: empty,
      });
      expect(h.receipts.size).toBe(1);
    },
  );

  it("still suppresses new application replies for non-production tenants", async () => {
    h.allowed = false;
    await expect(deliver("HELP", "SM-demo")).resolves.toEqual({ status: 200, body: empty });
    expect(h.receipts.size).toBe(1);
  });
});
