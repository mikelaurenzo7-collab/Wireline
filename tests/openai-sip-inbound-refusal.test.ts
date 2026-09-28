import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RestException from "twilio/lib/base/RestException";

const h = vi.hoisted(() => ({
  admit: vi.fn(),
  build: vi.fn(),
  apply: vi.fn(),
  reserve: vi.fn(),
  claim: vi.fn(),
  acquire: vi.fn(),
  release: vi.fn(),
  provider: vi.fn(),
  carrierLimit: vi.fn(),
}));
vi.mock("../src/lib/voice/funded-carrier-call", () => ({
  enforceFundedCarrierCallLimit: h.carrierLimit,
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({
          where: () => ({
            limit: async () => [{ userId: "tenant", agentId: "bot", businessName: "Example" }],
          }),
        }),
      }),
    }),
  },
  tenantStore: { run: (_id: string, fn: () => unknown) => fn() },
  fetchWithTimeout: h.provider,
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("../src/middleware/api-rate-limits", () => ({
  createIpRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: async () => ({ allowed: true }),
}));
vi.mock("../src/lib/account-operation-lease", () => ({
  acquireAccountOperationLease: h.acquire,
  releaseAccountOperationLease: h.release,
}));
vi.mock("../src/lib/background-work", () => ({ runInBackground: vi.fn() }));
vi.mock("../src/lib/realtime-spend-reservation", () => ({
  reserveRealtimeSessionSpend: h.reserve,
  commitRealtimeSessionSpend: vi.fn(),
  releaseRealtimeSessionSpendAfterFailure: vi.fn(),
}));
vi.mock("../src/lib/standard-webhook-auth", () => ({
  verifyStandardWebhook: () => ({ ok: true }),
}));
vi.mock("../src/lib/voice/native-inbound-admission", () => ({
  resolveNativeInboundCallAdmission: h.admit,
}));
vi.mock("../src/lib/voice/openai-inbound-token", () => ({
  verifyOpenAIInboundToken: () => ({
    ok: true,
    claims: {
      calledNumber: "+13125550101",
      callerNumber: "+13125550102",
      twilioCallSid: "CA00000000000000000000000000000001",
    },
  }),
}));
vi.mock("../src/lib/voice/openai-phone-agent-runtime", () => ({
  buildOpenAIRealtimeAgentRuntime: h.build,
}));
vi.mock("../src/lib/voice/openai-outbound-token", () => ({
  verifyOpenAIOutboundToken: vi.fn(),
  openAIOutboundPlacementMatches: vi.fn(),
}));
vi.mock("../src/lib/voice/openai-sip-config", () => ({
  OPENAI_INBOUND_SIP_TOKEN_HEADER: "x-inbound",
  OPENAI_OUTBOUND_SIP_TOKEN_HEADER: "x-outbound",
  OPENAI_REALTIME_CALLS_URL: "https://api.openai.com/v1/realtime/calls",
  normalizeOpenAIPhoneNumber: (value: unknown) => value,
  resolveOpenAISipSessionMaxSeconds: () => 3600,
}));
vi.mock("../src/lib/voice/openai-sip-worker-dispatch", () => ({
  forwardOpenAISipWebhook: async () => false,
}));
vi.mock("../src/lib/voice/openai-sip-session", () => ({
  applyInboundAdmission: h.apply,
  claimOpenAISipCall: h.claim,
  markOpenAISipCallRunning: vi.fn(),
  releaseOpenAISipClaimForRetry: vi.fn(),
  runOpenAISipCallSession: vi.fn(),
  settleOpenAISipPreSessionFailure: vi.fn(),
}));

import router from "../src/routes/openai-sip-routes";
import { AppError } from "../src/lib/api-error";
import { log } from "../src/lib/server-context";
import { realtimeProviderCallMayExist } from "../src/lib/realtime-provider-outcome";
import {
  settleOpenAISipPreSessionFailure,
  releaseOpenAISipClaimForRetry,
} from "../src/lib/voice/openai-sip-session";

async function deliver() {
  const route = router.stack.find(
    (item) => item.route?.path === "/api/webhooks/openai/realtime",
  )!.route!;
  const handler = route.stack.at(-1)!.handle;
  return new Promise<{ status?: number; body?: Record<string, unknown>; error?: unknown }>(
    (resolve) => {
      let status = 200;
      const res = {
        locals: {},
        status: (value: number) => {
          status = value;
          return res;
        },
        json: (body: Record<string, unknown>) => {
          resolve({ status, body });
          return res;
        },
      };
      const req = {
        body: Buffer.from(
          JSON.stringify({
            type: "realtime.call.incoming",
            data: {
              call_id: "call-test",
              sip_headers: [{ name: "x-inbound", value: "signed-test" }],
            },
          }),
        ),
        get: () => "",
      };
      handler(req as never, res as never, (error?: unknown) => resolve({ error }));
    },
  );
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-only-no-provider-access");
  vi.clearAllMocks();
  h.admit.mockResolvedValue({ mode: "full" });
  h.build.mockResolvedValue({ session: {}, agentName: "Example" });
  h.apply.mockImplementation((runtime: unknown) => runtime);
  h.acquire.mockResolvedValue(null);
  h.provider.mockResolvedValue({ ok: true, status: 200 });
  h.carrierLimit.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("terminal inbound coverage refusal before paid AI", () => {
  it.each(["carrier_limit", "realtime_spend_reservation"] as const)(
    "records the original safe %s failure before cleanup without admitting provider work",
    async (stage) => {
      const funding = { maxSeconds: 2400, deadlineAtMs: Date.now() + 2400000 };
      const original =
        stage === "carrier_limit"
          ? new RestException({
              statusCode: 400,
              body: { code: 21220, message: "private carrier request and credentials" },
            })
          : new Error("private reservation configuration and credentials");
      h.acquire.mockResolvedValue({ id: "lease", expiresAt: new Date() });
      h.claim.mockResolvedValue({ callLogId: 1n, ownerToken: "owner", resumed: false, funding });
      h.reserve.mockResolvedValue({ id: "reserve" });
      vi.mocked(settleOpenAISipPreSessionFailure).mockResolvedValue(true);
      if (stage === "carrier_limit") h.carrierLimit.mockRejectedValueOnce(original);
      else h.reserve.mockRejectedValueOnce(original);
      const result = await deliver();
      expect(result.error).toBe(original);
      expect(log.error).toHaveBeenCalledWith("OpenAI SIP funding admission failed", {
        stage,
        ...(stage === "carrier_limit"
          ? { error_class: "RestException", http_status: 400, error_code: 21220 }
          : { error_class: "Error", http_status: 503 }),
      });
      expect(vi.mocked(log.error).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(settleOpenAISipPreSessionFailure).mock.invocationCallOrder[0],
      );
      expect(settleOpenAISipPreSessionFailure).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "spend_reservation_failed" }),
      );
      expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain("private");
      expect(h.provider).toHaveBeenCalledOnce();
      expect(h.provider.mock.calls[0][0]).toMatch(/\/reject$/);
      expect(h.reserve).toHaveBeenCalledTimes(stage === "carrier_limit" ? 0 : 1);
    },
  );
  it.each([400, 503])(
    "logs safe provider acceptance diagnostics for HTTP %s without changing outcome semantics",
    async (status) => {
      h.acquire.mockResolvedValue({ id: "lease", expiresAt: new Date() });
      h.claim.mockResolvedValue({ callLogId: 1n, ownerToken: "owner", resumed: false });
      h.reserve.mockResolvedValue({ id: "reserve" });
      vi.mocked(settleOpenAISipPreSessionFailure).mockResolvedValue(true);
      h.provider.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "unknown_parameter",
              type: "invalid_request_error",
              param: "session.audio.output.voice",
              message: "sk-private-test-secret prompt and phone number",
              session: { instructions: "private prompt" },
            },
          }),
          { status, headers: { "x-request-id": "req_test12345678" } },
        ),
      );
      const result = await deliver();
      expect(result.error).toMatchObject({ status });
      expect(realtimeProviderCallMayExist(result.error)).toBe(status >= 500);
      expect(log.error).toHaveBeenCalledWith("OpenAI SIP provider acceptance rejected", {
        http_status: status,
        provider_request_id: "req_test12345678",
        provider_error_body: "parsed",
        provider_error_code: "unknown_parameter",
        provider_error_type: "invalid_request_error",
        provider_error_param: "session.audio.output.voice",
      });
      expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain("sk-private");
      expect(JSON.stringify(vi.mocked(log.error).mock.calls)).not.toContain("private prompt");
      if (status < 500) {
        expect(settleOpenAISipPreSessionFailure).toHaveBeenCalledWith(
          expect.objectContaining({ reason: "provider_accept_failed" }),
        );
        expect(releaseOpenAISipClaimForRetry).not.toHaveBeenCalled();
      } else {
        expect(releaseOpenAISipClaimForRetry).toHaveBeenCalledOnce();
        expect(settleOpenAISipPreSessionFailure).not.toHaveBeenCalled();
      }
    },
  );
  it("waits for the funded carrier limit to be confirmed before reserving AI or accepting", async () => {
    const funding = { maxSeconds: 2400, deadlineAtMs: Date.now() + 2400000 };
    h.acquire.mockResolvedValue({ id: "lease", expiresAt: new Date() });
    h.claim.mockResolvedValue({ callLogId: 1n, ownerToken: "owner", resumed: false, funding });
    h.reserve.mockResolvedValue({ id: "reserve" });
    let confirmCarrier!: () => void;
    h.carrierLimit.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          confirmCarrier = resolve;
        }),
    );
    const pending = deliver();
    await vi.waitFor(() => expect(h.carrierLimit).toHaveBeenCalledOnce());
    expect(h.reserve).not.toHaveBeenCalled();
    expect(h.provider).not.toHaveBeenCalled();
    confirmCarrier();
    await expect(pending).resolves.toEqual({
      status: 202,
      body: { received: true, handled: true },
    });
    expect(h.carrierLimit).toHaveBeenCalledWith("tenant", "openai:call-test", funding);
    expect(h.carrierLimit.mock.invocationCallOrder[0]).toBeLessThan(
      h.reserve.mock.invocationCallOrder[0],
    );
    expect(h.reserve.mock.invocationCallOrder[0]).toBeLessThan(
      h.provider.mock.invocationCallOrder[0],
    );
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.provider.mock.calls[0][0]).toMatch(/\/accept$/);
  });
  it.each(["VOICE_FUNDING_IN_USE", "VOICE_FUNDING_REQUIRED", "VOICE_PLAN_REQUIRED"])(
    "rejects known %s before AI spend and acceptance",
    async (code) => {
      h.acquire.mockResolvedValue({ id: "lease", expiresAt: new Date() });
      h.claim.mockRejectedValue(new AppError(402, code, "Call funding unavailable."));
      await expect(deliver()).resolves.toEqual({
        status: 202,
        body: { received: true, handled: false, reason: "call_coverage" },
      });
      expect(h.reserve).not.toHaveBeenCalled();
      expect(h.carrierLimit).not.toHaveBeenCalled();
    },
  );
  it("refuses a fresh call when atomic capacity fills after the early admission read", async () => {
    h.acquire.mockResolvedValue({ id: "lease", expiresAt: new Date() });
    h.claim.mockRejectedValue(new AppError(429, "VOICE_CONCURRENCY_EXCEEDED", "Line is full."));
    await expect(deliver()).resolves.toEqual({
      status: 202,
      body: { received: true, handled: false, reason: "concurrency" },
    });
    expect(h.release).toHaveBeenCalledWith({ id: "lease", userId: "tenant" });
    expect(h.provider).toHaveBeenCalledOnce();
    expect(h.provider.mock.calls[0][0]).toMatch(/\/call-test\/reject$/);
    expect(h.reserve).not.toHaveBeenCalled();
  });

  it.each(["subscription", "coverage", "completion_grace", "daily_minutes", "concurrency"])(
    "rejects known %s once with no runtime, claim or AI reserve",
    async (reason) => {
      h.admit.mockResolvedValue({ mode: "suspended", reason });
      await expect(deliver()).resolves.toEqual({
        status: 202,
        body: { received: true, handled: false, reason },
      });
      expect(h.provider).toHaveBeenCalledOnce();
      expect(h.provider.mock.calls[0][0]).toMatch(/\/call-test\/reject$/);
      expect(JSON.parse(h.provider.mock.calls[0][1].body)).toEqual({ status_code: 603 });
      expect(h.build).not.toHaveBeenCalled();
      expect(h.apply).not.toHaveBeenCalled();
      expect(h.acquire).not.toHaveBeenCalled();
      expect(h.claim).not.toHaveBeenCalled();
      expect(h.reserve).not.toHaveBeenCalled();
    },
  );

  it("leaves unknown accounting retryable without accepting provider work", async () => {
    h.admit.mockRejectedValue(AppError.serviceUnavailable("Voice coverage could not be verified."));
    const result = await deliver();
    expect(result.error).toMatchObject({ status: 503 });
    expect(h.provider).not.toHaveBeenCalled();
    expect(h.build).not.toHaveBeenCalled();
    expect(h.claim).not.toHaveBeenCalled();
    expect(h.reserve).not.toHaveBeenCalled();
  });

  it("still builds covered after-hours message-taking before the ordinary lease gate", async () => {
    h.admit.mockResolvedValue({ mode: "take_message", reason: "after_hours" });
    await deliver();
    expect(h.build).toHaveBeenCalledOnce();
    expect(h.apply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        direction: "inbound",
        admission: { mode: "take_message", reason: "after_hours" },
      }),
    );
    expect(h.acquire).toHaveBeenCalledOnce();
  });
});
