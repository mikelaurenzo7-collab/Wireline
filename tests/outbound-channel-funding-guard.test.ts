import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
const h = vi.hoisted(() => ({
  channel: vi.fn(),
  create: vi.fn(),
  claim: vi.fn(),
  permission: vi.fn(),
  prepare: vi.fn(),
  dispatch: vi.fn(),
  bind: vi.fn(),
  fail: vi.fn(),
  end: vi.fn(),
  reserveSpend: vi.fn(),
  commitSpend: vi.fn(),
  releaseSpend: vi.fn(),
  ambiguousSpend: vi.fn(),
  accepted: vi.fn(),
  failed: vi.fn(),
  order: [] as string[],
  agent: { id: "bot", role: "receptionist", isBusinessAgent: true } as {
    id: string;
    role?: string;
    isBusinessAgent?: boolean;
  },
}));
vi.mock("../src/lib/channel-entitlements", () => ({ requireTenantChannel: h.channel }));
vi.mock("../src/lib/account-environment-policy", () => ({
  assertExternalEntityActionAllowed: vi.fn(),
  assertLiveExternalActionAllowed: vi.fn(),
}));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: async ({ perform }: any) => ({
    performed: true,
    result: await perform(),
  }),
}));
vi.mock("../src/lib/compliance", () => ({ isDncBlocked: async () => false }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => {
      let table = "";
      const q: any = {
        from: (t: any) => {
          table = getTableName(t);
          return q;
        },
        where: () => q,
        orderBy: () => q,
        limit: async () =>
          table === "wireline_settings"
            ? [{ subscriptionStatus: "active" }]
            : table === "wireline_agents"
              ? [h.agent]
              : [{ phoneNumber: "+13125550102", carrierNumberId: `PN${"2".repeat(32)}` }],
      };
      return q;
    },
  },
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/twilio-service", () => ({
  getTwilioClient: () => ({ calls: { create: h.create } }),
}));
vi.mock("../src/lib/voice/openai-outbound-placement", () => ({
  claimNativeOutboundPlacement: h.claim,
  markNativeOutboundPlacementAccepted: h.accepted,
  markNativeOutboundPlacementFailure: h.failed,
}));
vi.mock("../src/lib/recipient-voice-permission-store", () => ({
  inspectOutboundRecipientPermission: h.permission,
}));
vi.mock("../src/lib/voice/outbound-placement-funding", () => ({
  prepareOutboundPlacementFunding: h.prepare,
  markOutboundProviderAttempted: h.dispatch,
  bindOutboundCarrierCall: h.bind,
  failOutboundBeforeAcceptance: h.fail,
  endCancelledOutboundPlacement: h.end,
}));
vi.mock("../src/lib/voice/openai-outbound-token", () => ({
  openAIOutboundTokenReady: () => true,
  issueOpenAIOutboundToken: () => ({ token: "test" }),
}));
vi.mock("../src/lib/voice/openai-sip-config", () => ({
  openAISipConfigured: () => true,
  normalizeOpenAIPhoneNumber: (phone: string) => phone,
  twilioOpenAIOutboundBridgeUrl: () => "https://app.example/bridge",
  twilioOpenAIOutboundFallbackUrl: () => "https://app.example/fallback",
  twilioOpenAIOutboundStatusUrl: () => "https://app.example/status",
}));
vi.mock("../src/middleware/audit-middleware", () => ({
  reservePlatformCostRecord: h.reserveSpend,
  commitPlatformCostReservation: h.commitSpend,
  releasePlatformCostReservation: h.releaseSpend,
  markPlatformCostReservationAmbiguous: h.ambiguousSpend,
}));
import { placeOutboundCall } from "../src/lib/voice/outbound-call-service";
const sid = `CA${"1".repeat(32)}`,
  placementId = "12345678-1234-4234-8234-123456789012";
const input = {
  userId: "tenant",
  agentId: "bot",
  customerNumber: "+13125550101",
  callPurpose: "service_or_requested" as const,
};
beforeEach(() => {
  vi.stubEnv("BOTBOUND_GENERAL_OUTBOUND_ENABLED", "true");
  vi.stubEnv("BOTBOUND_NON_MARKETING_OUTBOUND_ENABLED", "false");
  h.agent = { id: "bot", role: "receptionist", isBusinessAgent: true };
  vi.clearAllMocks();
  h.order.length = 0;
  h.channel.mockResolvedValue({ planId: "voice", channels: ["voice"] });
  h.claim.mockResolvedValue({
    ok: true,
    lead: { id: 7n, metadata: {} },
    created: true,
    placementId,
  });
  h.permission.mockImplementation(async ({ callPurpose }) => {
    h.order.push("permission");
    return { effectiveCallPurpose: callPurpose };
  });
  h.prepare.mockImplementation(async () => {
    h.order.push("fund");
    return {
      canonicalCallId: `outbound:${placementId}`,
      maxSeconds: 120,
      deadlineAtMs: Date.now() + 120000,
    };
  });
  h.reserveSpend.mockImplementation(async () => {
    h.order.push("spend");
    return { reserved: true, reservation: {} };
  });
  h.dispatch.mockImplementation(async () => {
    h.order.push("dispatch");
  });
  h.create.mockImplementation(async () => {
    h.order.push("create");
    return { sid };
  });
  h.bind.mockResolvedValue(true);
  h.accepted.mockResolvedValue({ accepted: true, callId: sid });
  h.failed.mockResolvedValue({ accepted: false, callId: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("ordinary outbound pre-SIP funding", () => {
  it.each([
    { role: "personal_assistant", isBusinessAgent: false, callPurpose: "service_or_requested" },
    { role: "receptionist", isBusinessAgent: true, callPurpose: "callback" },
    { role: "scheduler", isBusinessAgent: undefined, callPurpose: "service_or_requested" },
  ] as const)(
    "places non-marketing calls for any Bot through the same funding path: %j",
    async ({ callPurpose, ...agent }) => {
      vi.stubEnv("BOTBOUND_GENERAL_OUTBOUND_ENABLED", "false");
      vi.stubEnv("BOTBOUND_NON_MARKETING_OUTBOUND_ENABLED", "true");
      h.agent = { id: "bot", ...agent };
      await expect(placeOutboundCall({ ...input, callPurpose })).resolves.toMatchObject({
        ok: true,
        callId: sid,
      });
      expect(h.order).toEqual(["fund", "spend", "dispatch", "create"]);
      expect(h.channel).toHaveBeenCalledWith("tenant", "voice");
    },
  );
  it.each([
    { role: "receptionist", isBusinessAgent: true, callPurpose: "marketing_or_sales" },
    { role: "personal_assistant", isBusinessAgent: false, callPurpose: "marketing_or_sales" },
  ] as const)(
    "places a screened call for every Bot audience without a separate activation flag: %j",
    async ({ callPurpose, ...agent }) => {
      vi.stubEnv("BOTBOUND_GENERAL_OUTBOUND_ENABLED", "false");
      vi.stubEnv("BOTBOUND_NON_MARKETING_OUTBOUND_ENABLED", "false");
      h.agent = { id: "bot", ...agent };
      await expect(placeOutboundCall({ ...input, callPurpose })).resolves.toMatchObject({
        ok: true,
        callId: sid,
      });
      expect(h.permission).not.toHaveBeenCalled();
      expect(h.order).toEqual(["fund", "spend", "dispatch", "create"]);
    },
  );
  it("does not treat the free personal plan as a paid voice entitlement", async () => {
    vi.stubEnv("BOTBOUND_GENERAL_OUTBOUND_ENABLED", "false");
    vi.stubEnv("BOTBOUND_NON_MARKETING_OUTBOUND_ENABLED", "true");
    h.agent = { id: "bot", role: "personal_assistant", isBusinessAgent: false };
    h.channel.mockRejectedValueOnce(new Error("Voice channel requires a paid Calls plan"));
    await expect(placeOutboundCall(input)).rejects.toThrow("paid Calls plan");
    expect(h.create).not.toHaveBeenCalled();
  });
  it.each([
    "+19075550101",
    "+18085550101",
    "+12425550101",
    "+17875550101",
    "+14165550101",
    "+19005550101",
  ])("rejects unsupported tariff prefix %s before funding or dispatch", async (customerNumber) => {
    await expect(placeOutboundCall({ ...input, customerNumber })).resolves.toMatchObject({
      ok: false,
      status: 422,
      code: "OUTBOUND_DESTINATION_UNSUPPORTED",
    });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.claim).not.toHaveBeenCalled();
    expect(h.prepare).not.toHaveBeenCalled();
  });
  it("places a connected-line call when the general activation flag is unset", async () => {
    vi.stubEnv("BOTBOUND_GENERAL_OUTBOUND_ENABLED", "false");
    vi.stubEnv("BOTBOUND_NON_MARKETING_OUTBOUND_ENABLED", "false");
    await expect(placeOutboundCall(input)).resolves.toMatchObject({
      ok: true,
      callId: sid,
    });
    expect(h.permission).not.toHaveBeenCalled();
    expect(h.create).toHaveBeenCalled();
  });
  it.each(["voice", "voice-email", "voice-sms", "omnichannel"])(
    "funds %s before bounded carrier creation",
    async (planId) => {
      h.channel.mockResolvedValue({ planId, channels: ["voice"] });
      await expect(placeOutboundCall(input)).resolves.toMatchObject({ ok: true, callId: sid });
      expect(h.order).toEqual(["fund", "spend", "dispatch", "create"]);
      expect(h.create.mock.calls[0][0]).toMatchObject({ timeout: 30 });
      expect(h.create.mock.calls[0][0].timeLimit).toBeLessThanOrEqual(90);
    },
  );
  it("does not create after funding or budget refusal", async () => {
    h.prepare.mockRejectedValueOnce(new Error("no funds"));
    await placeOutboundCall(input);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.fail).toHaveBeenCalled();
    h.reserveSpend.mockResolvedValueOnce({ reserved: false });
    await placeOutboundCall(input);
    expect(h.create).not.toHaveBeenCalled();
  });
  it("preserves a returned SID through a later accounting failure", async () => {
    h.commitSpend.mockRejectedValueOnce(new Error("database down"));
    h.failed.mockResolvedValueOnce({ accepted: true, callId: sid });
    await expect(placeOutboundCall(input)).resolves.toMatchObject({ ok: true, callId: sid });
    expect(h.bind).toHaveBeenCalledTimes(2);
    expect(h.fail).not.toHaveBeenCalled();
    expect(h.releaseSpend).not.toHaveBeenCalled();
    expect(h.ambiguousSpend).toHaveBeenCalled();
  });
  it("retains ambiguous create but releases definite carrier rejection", async () => {
    h.create.mockRejectedValueOnce(Object.assign(new Error("timeout"), { status: 504 }));
    await expect(placeOutboundCall(input)).resolves.toMatchObject({
      providerOutcomeAmbiguous: true,
      doNotRetry: true,
    });
    expect(h.fail).not.toHaveBeenCalled();
    h.create.mockRejectedValueOnce(Object.assign(new Error("invalid"), { status: 400 }));
    await expect(placeOutboundCall(input)).resolves.toMatchObject({ ok: false, status: 400 });
    expect(h.fail).toHaveBeenCalled();
  });
  it("replays without another permission claim, hold or carrier create", async () => {
    h.claim.mockResolvedValueOnce({
      ok: true,
      lead: { id: 7n, callId: sid },
      placementId,
      created: false,
      replayed: true,
    });
    await expect(placeOutboundCall(input)).resolves.toMatchObject({ ok: true, callId: sid });
    expect(h.prepare).not.toHaveBeenCalled();
    expect(h.permission).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
  });
});
