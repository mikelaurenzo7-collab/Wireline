import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  lookup: vi.fn(),
  createMessage: vi.fn(),
  reserve: vi.fn(),
  commit: vi.fn(),
  ambiguous: vi.fn(),
  environment: vi.fn(),
  entity: vi.fn(),
  entitlement: vi.fn(),
  launchBlocked: vi.fn(),
  fence: vi.fn(),
  settings: {
    twilioLookupEnabled: true,
    twilioMessagingEnabled: true,
    twilioManagerAlertsEnabled: true,
    twilioManagerAlertNumber: "+13125550123",
    twilioSmsFromNumber: "+13125550124",
  },
}));

vi.mock("twilio", () => ({
  default: () => ({
    lookups: { v2: { phoneNumbers: () => ({ fetch: h.lookup }) } },
    messages: { create: h.createMessage },
  }),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [h.settings] }) }) }),
    insert: () => ({ values: () => ({ onConflictDoNothing: async () => undefined }) }),
  },
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  tenantStore: { run: <T>(_userId: string, work: () => T) => work() },
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: h.environment,
  externalEntityActionPolicyForUser: h.entity,
}));
vi.mock("../src/lib/trial-gate", () => ({ assertLiveWorkEntitlementForUser: h.entitlement }));
vi.mock("../src/lib/launch-readiness", () => ({ isLaunchHardBlocked: h.launchBlocked }));
vi.mock("../src/lib/tenant-provider-deletion-fence", () => ({
  runTenantProviderWorkWithDeletionFence: h.fence,
}));
vi.mock("../src/middleware/audit-middleware", () => ({
  reservePlatformCostRecord: h.reserve,
  commitPlatformCostReservation: h.commit,
  markPlatformCostReservationAmbiguous: h.ambiguous,
}));
vi.mock("../src/lib/twilio-message-reliability", () => ({
  withTwilioMessageReliability: <T>(payload: T) => payload,
  createTwilioMessageWithRateLimitRetry: <T>(work: () => Promise<T>) => work(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("TWILIO_ACCOUNT_SID", "AC-test");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "test-only");
  vi.stubEnv("PLATFORM_SMS_FROM", "+13125550124");
  h.settings.twilioLookupEnabled = true;
  h.launchBlocked.mockReturnValue(false);
  h.environment.mockResolvedValue({ allowed: true, environment: "production" });
  h.entity.mockResolvedValue({ allowed: true });
  h.entitlement.mockResolvedValue({ ok: true, status: "active" });
  h.fence.mockImplementation(async ({ perform }) => ({ performed: true, result: await perform() }));
  h.reserve.mockImplementation(async (input) => ({
    reserved: true,
    reservation: {
      userId: input.userId,
      auditId: 1n,
      costUsd: input.costUsd,
      adopted: false,
      meter: "managed_ai",
    },
  }));
  h.commit.mockResolvedValue(undefined);
  h.ambiguous.mockResolvedValue(undefined);
  h.lookup.mockResolvedValue({
    phoneNumber: "+13125550123",
    valid: true,
    lineTypeIntelligence: { type: "mobile" },
    countryCode: "US",
  });
  h.createMessage.mockResolvedValue({ sid: "SM-test", status: "queued" });
});

afterEach(() => vi.unstubAllEnvs());

describe("funded Twilio phone validation", () => {
  it.each(["cap_reached", "unavailable"])(
    "does not query Twilio when the allowance is %s",
    async (reason) => {
      h.reserve.mockResolvedValue({ reserved: false, reason });
      const { lookupTenantPhoneNumber } = await import("../src/lib/twilio-service-base");
      expect(await lookupTenantPhoneNumber("tenant-1", "+13125550123")).toMatchObject({
        ok: false,
        code: reason === "cap_reached" ? "SPEND_CAP_REACHED" : "SPEND_GUARD_UNAVAILABLE",
      });
      expect(h.lookup).not.toHaveBeenCalled();
      expect(h.commit).not.toHaveBeenCalled();
    },
  );

  it.each(["ownerless", "free", "demo", "showcase", "launch", "deletion", "unknown"])(
    "keeps %s work away from paid Lookup",
    async (blocked) => {
      if (blocked === "free")
        h.entitlement.mockResolvedValue({
          ok: false,
          code: "ACTIVATION_REQUIRED",
          error: "Activate live work",
        });
      if (blocked === "demo")
        h.environment.mockResolvedValue({
          allowed: false,
          code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
          message: "Demo",
        });
      if (blocked === "showcase")
        h.entity.mockResolvedValue({
          allowed: false,
          code: "SHOWCASE_ENTITY_BLOCKED",
          message: "Showcase",
        });
      if (blocked === "launch") h.launchBlocked.mockReturnValue(true);
      if (blocked === "deletion")
        h.fence.mockResolvedValue({
          performed: false,
          reason: "account_erased_or_terminal_deletion",
        });
      if (blocked === "unknown") h.environment.mockRejectedValue(new Error("DB unavailable"));
      const { lookupTenantPhoneNumber } = await import("../src/lib/twilio-service-base");
      expect(
        await lookupTenantPhoneNumber(blocked === "ownerless" ? "" : "tenant-1", "+13125550123"),
      ).toMatchObject({ ok: false });
      expect(h.reserve).not.toHaveBeenCalled();
      expect(h.lookup).not.toHaveBeenCalled();
    },
  );

  it.each([{ valid: false }, { valid: true, lineTypeIntelligence: { type: "landline" } }])(
    "retains the funded query cost even when the result cannot send SMS: %j",
    async (response) => {
      h.lookup.mockResolvedValue(response);
      const { lookupTenantPhoneNumber, TWILIO_LOOKUP_RESERVE_USD } =
        await import("../src/lib/twilio-service-base");
      expect(await lookupTenantPhoneNumber("tenant-1", "+13125550123")).toMatchObject({
        ok: true,
        valid: response.valid,
      });
      expect(h.reserve).toHaveBeenCalledWith({
        userId: "tenant-1",
        action: "platform.enrichment.phone_lookup",
        provider: "twilio",
        model: "line_type_intelligence",
        costUsd: TWILIO_LOOKUP_RESERVE_USD,
        requestMeta: { destination_suffix: "0123" },
      });
      expect(h.reserve.mock.invocationCallOrder[0]).toBeLessThan(
        h.lookup.mock.invocationCallOrder[0],
      );
      expect(h.commit).toHaveBeenCalledTimes(1);
      expect(h.ambiguous).not.toHaveBeenCalled();
    },
  );

  it.each([400, 500, undefined])(
    "retains attempted-query cost after provider error %s",
    async (status) => {
      h.lookup.mockRejectedValue(Object.assign(new Error("provider failure"), { status }));
      const { lookupTenantPhoneNumber } = await import("../src/lib/twilio-service-base");
      expect(await lookupTenantPhoneNumber("tenant-1", "+13125550123")).toMatchObject({
        ok: false,
      });
      expect(h.ambiguous).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "tenant-1", costUsd: 0.01 }),
      );
      expect(h.commit).not.toHaveBeenCalled();
    },
  );

  it("requires a separate atomic allowance reservation for concurrent queries", async () => {
    let remaining = 0.01;
    h.reserve.mockImplementation(async (input) => {
      if (input.costUsd > remaining) return { reserved: false, reason: "cap_reached" };
      remaining -= input.costUsd;
      return {
        reserved: true,
        reservation: { userId: input.userId, auditId: 1n, costUsd: input.costUsd, adopted: false },
      };
    });
    const { lookupTenantPhoneNumber } = await import("../src/lib/twilio-service-base");
    const results = await Promise.all([
      lookupTenantPhoneNumber("tenant-1", "+13125550123"),
      lookupTenantPhoneNumber("tenant-1", "+13125550123"),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(h.reserve.mock.calls.length, JSON.stringify(results)).toBe(2);
    expect(h.lookup).toHaveBeenCalledTimes(1);
    for (const [input] of h.reserve.mock.calls) expect(input).not.toHaveProperty("idempotencyKey");
  });

  it.each(["manager", "direct"])(
    "applies the same funding refusal to %s alert validation",
    async (kind) => {
      h.reserve.mockResolvedValue({ reserved: false, reason: "cap_reached" });
      const { sendManagerAlert, sendDirectAlert } = await import("../src/lib/twilio-service-base");
      const message = { title: "Test alert", message: "Synthetic fixture" };
      const result =
        kind === "manager"
          ? await sendManagerAlert("tenant-1", message)
          : await sendDirectAlert("tenant-1", "+13125550123", message);
      expect(result).toMatchObject({ ok: false });
      expect(h.lookup).not.toHaveBeenCalled();
      expect(h.createMessage).not.toHaveBeenCalled();
    },
  );

  it("leaves explicit ownerless platform alerts outside tenant Lookup without inventing a tenant budget", async () => {
    const { sendPlatformOperationalAlert } = await import("../src/lib/twilio-service-base");
    expect(
      await sendPlatformOperationalAlert(null, "+13125550123", "Synthetic platform alert"),
    ).toMatchObject({ ok: true });
    expect(h.lookup).not.toHaveBeenCalled();
    expect(h.reserve).not.toHaveBeenCalled();
    expect(h.createMessage).toHaveBeenCalledTimes(1);
  });
});
