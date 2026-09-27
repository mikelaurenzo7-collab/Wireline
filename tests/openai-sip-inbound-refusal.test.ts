import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  admit: vi.fn(),
  build: vi.fn(),
  apply: vi.fn(),
  reserve: vi.fn(),
  claim: vi.fn(),
  acquire: vi.fn(),
  provider: vi.fn(),
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
  releaseAccountOperationLease: vi.fn(),
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
});
afterEach(() => vi.unstubAllEnvs());

describe("terminal inbound coverage refusal before paid AI", () => {
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
