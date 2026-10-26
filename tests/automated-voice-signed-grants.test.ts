import { getTableName } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  lead: {} as Record<string, any>,
  writes: [] as Array<Record<string, any>>,
  order: [] as string[],
  inspect: vi.fn(),
  gate: vi.fn(),
  place: vi.fn(),
  controls: vi.fn(),
}));
vi.mock("../src/lib/recipient-voice-permission-store", () => ({
  inspectOutboundRecipientPermission: h.inspect,
}));
vi.mock("../src/lib/outbound-dial-gate", () => ({
  evaluateOutboundDialGate: h.gate,
  mergeLeadMetadata: (current: object, patch: object = {}) => ({ ...current, ...patch }),
}));
vi.mock("../src/lib/voice/outbound-call-service", () => ({ placeOutboundCall: h.place }));
vi.mock("../src/lib/voice-spend-control", () => ({ assertOutboundVoiceAllowed: h.controls }));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: async () => ({ allowed: true }),
  externalEntityActionPolicyForUser: async () => ({ allowed: true }),
}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async (input: { perform: () => Promise<unknown> }) => ({
    performed: true,
    result: await input.perform(),
  }),
}));
vi.mock("../src/lib/server-context", () => {
  function query(operation: string, source?: unknown, projection?: Record<string, unknown>) {
    let table = source ? getTableName(source as never) : "";
    let values: Record<string, any> | undefined;
    let returns = false;
    const chain: any = {
      from(input: unknown) {
        table = getTableName(input as never);
        return chain;
      },
      where: () => chain,
      limit: () => chain,
      orderBy: () => chain,
      set(input: Record<string, any>) {
        values = input;
        return chain;
      },
      values(input: Record<string, any>) {
        values = input;
        return chain;
      },
      returning() {
        returns = true;
        return chain;
      },
      then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve()
          .then(() => {
            if (table !== "wireline_outbound_leads") return [];
            if (operation === "update") {
              if (returns && !h.lead.callbackScheduledAt) return [];
              h.writes.push(values!);
              Object.assign(h.lead, values);
              return returns ? [{ id: h.lead.id }] : [];
            }
            if (projection && "callbackScheduledAt" in projection && !h.lead.callbackScheduledAt)
              return [];
            return [{ ...h.lead }];
          })
          .then(resolve, reject);
      },
    };
    return chain;
  }
  const db: any = {
    select: (projection?: Record<string, unknown>) => query("select", undefined, projection),
    update: (table: unknown) => query("update", table),
    insert: (table: unknown) => query("insert", table),
    execute: async () => [],
    transaction: (work: (tx: unknown) => Promise<unknown>) => work(db),
  };
  return {
    drizzle: db,
    tenantStore: { getStore: () => undefined },
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  };
});

import { processIntakeAutoDialJob } from "../src/lib/intake-auto-dial";
import { tickDueCallbacks } from "../src/lib/callback-engine";

const userId = "11111111-1111-4111-8111-111111111111";
const artifactId = "22222222-2222-4222-8222-222222222222";
const sid = "CA11111111111111111111111111111111";
const payload = { userId, leadId: "1", intakeKeyName: "Contact form" };

beforeEach(() => {
  vi.resetAllMocks();
  h.writes = [];
  h.order = [];
  h.lead = {
    id: 1n,
    userId,
    agentId: "bot",
    customerNumber: "+13125550123",
    customerName: "Example Contact",
    source: "intake",
    status: "Pending",
    callId: null,
    callbackScheduledAt: null,
    lastCalledAt: null,
    metadata: { has_express_written_consent: true },
  };
  h.inspect.mockImplementation(async (input: { callPurpose: string }) => {
    h.order.push("signed-inspection");
    return { artifactId, effectiveCallPurpose: input.callPurpose };
  });
  h.gate.mockImplementation(async () => {
    h.order.push("dial-gate");
    return { allowed: true };
  });
  h.controls.mockImplementation(async () => {
    h.order.push("controls");
  });
  h.place.mockImplementation(async () => {
    h.order.push("placement");
    return { ok: true, status: 200, callId: sid, leadId: "1" };
  });
});

describe("automated intake signed permission admission", () => {
  it("places a returning-contact call and does not throw on a missing consent artifact", async () => {
    await expect(processIntakeAutoDialJob(payload)).resolves.toEqual({
      outcome: "dialing",
      callId: sid,
    });
    expect(h.order).toEqual(["dial-gate", "controls", "placement"]);
    expect(h.inspect).not.toHaveBeenCalled();
    expect(h.gate).toHaveBeenCalledWith(
      expect.objectContaining({
        isMarketingCall: false,
        requireFederalDncScreening: false,
        hasExpressWrittenConsent: false,
      }),
    );
    expect(h.place).toHaveBeenCalledWith(
      expect.objectContaining({ callPurpose: "returning_contact", leadId: 1n }),
    );
    expect(h.place.mock.calls[0][0].consentArtifactId).toBeUndefined();
  });

  it("never treats imported consent flags as a reason to throw", async () => {
    h.inspect.mockRejectedValue(new Error("RECIPIENT_PERMISSION_REQUIRED"));
    await expect(processIntakeAutoDialJob(payload)).resolves.toEqual({
      outcome: "dialing",
      callId: sid,
    });
    expect(h.inspect).not.toHaveBeenCalled();
    expect(h.gate).toHaveBeenCalled();
    expect(h.place).toHaveBeenCalled();
  });

  it("does not overwrite an early terminal carrier outcome after Calls.create returns", async () => {
    h.place.mockImplementation(async () => {
      h.lead.callId = sid;
      h.lead.status = "Max-Attempts";
      h.lead.metadata = { native_voice: { state: "carrier_completed", twilio_call_sid: sid } };
      return { ok: true, status: 200, callId: sid, leadId: "1" };
    });
    await processIntakeAutoDialJob(payload);
    expect(h.lead.status).toBe("Max-Attempts");
    expect(h.writes).toEqual([]);
  });

  it("does not replace accepted carrier evidence with a late worker failure", async () => {
    h.place.mockImplementation(async () => {
      h.lead.callId = sid;
      h.lead.status = "Retrying";
      h.lead.metadata = { native_voice: { twilio_call_sid: sid, carrier_status: "busy" } };
      return { ok: false, status: 503, providerOutcomeAmbiguous: true };
    });
    await expect(processIntakeAutoDialJob(payload)).resolves.toEqual({
      outcome: "terminal_failure",
    });
    expect(h.lead.status).toBe("Retrying");
    expect(h.lead.metadata.native_voice.carrier_status).toBe("busy");
    expect(h.writes).toEqual([]);
  });
});

describe("scheduled callback signed permission admission", () => {
  it.each([true, false])(
    "requires the actual signed purpose when consumerRequested=%s",
    async (consumerRequested) => {
      h.lead.callbackScheduledAt = new Date(Date.now() - 1000);
      h.lead.metadata = consumerRequested
        ? { callback_requested_via: "phone_call" }
        : { has_express_written_consent: true };
      await expect(tickDueCallbacks()).resolves.toMatchObject({ placed: 1 });
      expect(h.order).toEqual(["signed-inspection", "dial-gate", "controls", "placement"]);
      expect(h.inspect).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          leadId: 1n,
          agentId: "bot",
          callPurpose: consumerRequested ? "callback" : "marketing_or_sales",
        }),
      );
      expect(h.gate).toHaveBeenCalledWith(
        expect.objectContaining({
          isRequestedCallback: consumerRequested,
          isMarketingCall: !consumerRequested,
          hasExpressWrittenConsent: !consumerRequested,
          requireFederalDncScreening: !consumerRequested,
        }),
      );
      expect(h.place).toHaveBeenCalledWith(
        expect.objectContaining({
          consentArtifactId: artifactId,
          callPurpose: consumerRequested ? "callback" : "marketing_or_sales",
        }),
      );
    },
  );

  it("never promotes a legacy callback marker into permission when the signed grant is absent", async () => {
    h.lead.callbackScheduledAt = new Date(Date.now() - 1000);
    h.lead.metadata = { callback_requested_via: "phone_call" };
    h.inspect.mockRejectedValue(new Error("No signed callback permission"));
    await expect(tickDueCallbacks()).resolves.toMatchObject({ placed: 0, skipped: 1 });
    expect(h.lead.callbackScheduledAt.getTime()).toBeGreaterThan(Date.now());
    expect(h.lead.metadata.callback_requested_via).toBe("phone_call");
    expect(h.gate).not.toHaveBeenCalled();
    expect(h.controls).not.toHaveBeenCalled();
    expect(h.place).not.toHaveBeenCalled();
  });

  it("leaves exact call identity and early terminal status to the shared placement owner", async () => {
    h.lead.callbackScheduledAt = new Date(Date.now() - 1000);
    h.lead.metadata = { callback_requested_via: "phone_call" };
    h.place.mockImplementation(async () => {
      h.lead.callId = sid;
      h.lead.status = "Max-Attempts";
      h.lead.metadata = { native_voice: { twilio_call_sid: sid, carrier_status: "busy" } };
      return { ok: true, status: 200, callId: sid, leadId: "1" };
    });
    await expect(tickDueCallbacks()).resolves.toMatchObject({ placed: 1 });
    expect(h.lead.callId).toBe(sid);
    expect(h.lead.status).toBe("Max-Attempts");
    expect(h.lead.metadata.native_voice.carrier_status).toBe("busy");
    expect(h.writes.every((patch) => !("callId" in patch) && !("status" in patch))).toBe(true);
  });
});
