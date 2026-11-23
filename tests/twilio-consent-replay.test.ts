import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  sid: "",
  receipts: new Set<string>(),
  writes: [] as Record<string, unknown>[],
  failTransaction: false,
  failClear: false,
  failsafe: false,
  optedOut: false,
  clear: vi.fn(),
  record: vi.fn(),
  evidence: vi.fn(),
  allowed: true,
}));

vi.mock("../src/lib/server-context", () => {
  const tx = {
    execute: async () => undefined,
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            const { dncList } = await import("../src/db/schema");
            // The SMS opt-out lookup is separate from the redelivery receipt lookup.
            if (table === dncList) return h.optedOut ? [{ id: 1n }] : [];
            return h.receipts.has(h.sid) ? [{ id: 1n }] : [];
          },
        }),
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
  isDncFailsafeBlocked: async () => h.failsafe,
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
  h.optedOut = false;
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

// Twilio answers its single-word keywords (STOP, START, YES, HELP...) in its own
// words, so the application only confirms the variants Twilio does not recognise.
const OWN_CONFIRMATION: Array<[string, string]> = [
  ["opt out", "You have been unsubscribed"],
  ["opt in", "You have been resubscribed"],
  ["support", "BotBound SMS help"],
];

describe("idempotent SMS consent confirmations", () => {
  it.each(OWN_CONFIRMATION)(
    "does not send another paid legacy '%s' confirmation on redelivery",
    async (body, confirmation) => {
      h.optedOut = true; // so "opt in" has an opt-out to reverse
      const first = await deliver(body, "SM-first");
      expect(first.status).toBe(200);
      expect(first.body).toContain(`<Message>${confirmation}`);
      const writeCount = h.writes.length;
      const clearCount = h.clear.mock.calls.length;
      await expect(deliver(body, "SM-first")).resolves.toEqual({ status: 200, body: empty });
      expect(h.writes).toHaveLength(writeCount);
      expect(h.clear).toHaveBeenCalledTimes(clearCount);
      expect(h.evidence).toHaveBeenCalledTimes(2);
    },
  );

  it("does not let an old START replay remove a later emergency STOP", async () => {
    h.optedOut = true;
    await deliver("opt in", "SM-start-old");
    expect(h.clear).toHaveBeenCalledOnce();
    h.failTransaction = true;
    const stop = await deliver("opt out", "SM-stop-new");
    expect(stop.body).toContain("couldn't process your unsubscribe");
    expect(h.failsafe).toBe(true);
    h.failTransaction = false;
    await expect(deliver("opt in", "SM-start-old")).resolves.toEqual({ status: 200, body: empty });
    expect(h.clear).toHaveBeenCalledOnce();
    expect(h.failsafe).toBe(true);
  });

  it("keeps failed START recovery closed until a fresh START succeeds", async () => {
    h.failsafe = true;
    h.failClear = true;
    const failed = await deliver("opt in", "SM-start-failed");
    expect(failed.body).toContain("Please reply START again");
    expect(h.failsafe).toBe(true);
    h.failClear = false;
    await expect(deliver("opt in", "SM-start-failed")).resolves.toEqual({
      status: 200,
      body: empty,
    });
    expect(h.failsafe).toBe(true);
    expect(h.clear).toHaveBeenCalledOnce();
    const recovered = await deliver("opt in", "SM-start-fresh");
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

describe("keywords Twilio already answers", () => {
  it.each(["STOP", "stopall", "Unsubscribe", "CANCEL", "END", "REVOKE", "OPTOUT", "QUIT"])(
    "records %s but leaves the confirmation to Twilio (a text from us would fail with 21610)",
    async (body) => {
      await expect(deliver(body, `SM-${body}`)).resolves.toEqual({ status: 200, body: empty });
      expect(h.writes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ reason: "opt-out", source: "sms_opt_out" }),
          expect.objectContaining({ event: "sms_opt_out", state: "opted_out" }),
        ]),
      );
      expect(h.evidence).toHaveBeenCalledOnce();
    },
  );

  it.each(["START", "Yes", "UNSTOP"])(
    "re-subscribes an opted-out number on %s without a second confirmation",
    async (body) => {
      h.optedOut = true;
      await expect(deliver(body, `SM-${body}`)).resolves.toEqual({ status: 200, body: empty });
      expect(h.clear).toHaveBeenCalledOnce();
      expect(h.writes).toEqual(
        expect.arrayContaining([expect.objectContaining({ event: "sms_opt_in" })]),
      );
    },
  );

  it.each(["HELP", "info"])("records %s and leaves the reply to Twilio", async (body) => {
    await expect(deliver(body, `SM-${body}`)).resolves.toEqual({ status: 200, body: empty });
    expect(h.writes).toEqual(
      expect.arrayContaining([expect.objectContaining({ event: "sms_help" })]),
    );
  });

  it("still answers the variants Twilio does not recognise", async () => {
    const reply = await deliver("STOP calling me", "SM-variant");
    expect(reply.body).toContain("<Message>You have been unsubscribed");
  });

  it("asks Twilio to redeliver an unrecorded STOP it has already confirmed", async () => {
    h.failTransaction = true;
    h.record.mockResolvedValueOnce(false);
    await expect(deliver("STOP", "SM-lost")).resolves.toEqual({ status: 503, body: empty });
    h.record.mockResolvedValueOnce(true);
    await expect(deliver("STOP", "SM-held")).resolves.toEqual({ status: 200, body: empty });
  });
});

describe("a plain Yes is a customer reply, not a consent grant", () => {
  it.each(["Yes", "yes", "START", "unstop"])(
    "stores %s as an ordinary text when the number is not opted out",
    async (body) => {
      await expect(deliver(body, `SM-reply-${body}`)).resolves.toEqual({
        status: 200,
        body: empty,
      });
      expect(h.evidence).toHaveBeenCalledOnce();
      // No consent grant is invented and nothing is deleted from the DNC list.
      expect(h.writes).toEqual([]);
      expect(h.clear).not.toHaveBeenCalled();
    },
  );

  it("still treats an emergency STOP marker as an opt-out to reverse", async () => {
    h.failsafe = true;
    await expect(deliver("Yes", "SM-marker")).resolves.toEqual({ status: 200, body: empty });
    expect(h.clear).toHaveBeenCalledOnce();
    expect(h.writes).toEqual(
      expect.arrayContaining([expect.objectContaining({ event: "sms_opt_in" })]),
    );
  });
});
