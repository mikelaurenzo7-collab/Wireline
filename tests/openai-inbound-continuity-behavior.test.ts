import { beforeEach, describe, expect, it, vi } from "vitest";

const HANGUP_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';
const CONTINUITY_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response><Play>https://botbound.app/sounds/wireline-transfer-chime.wav</Play><Dial>+14155550199</Dial></Response>';

type CapturedResponse = { statusCode: number; body: unknown };

function fakeResponse() {
  const captured: CapturedResponse = { statusCode: 200, body: undefined };
  const response: any = {
    setHeader: vi.fn(() => response),
    status: vi.fn((statusCode: number) => {
      captured.statusCode = statusCode;
      return response;
    }),
    send: vi.fn((body: unknown) => {
      captured.body = body;
      return response;
    }),
  };
  return { response, captured };
}

function routeHandler(router: any, path: string) {
  const layer = router.stack.find((candidate: any) => candidate.route?.path === path);
  if (!layer) throw new Error(`Route not found: ${path}`);
  return layer.route.stack[0].handle as (
    request: any,
    response: any,
    next: (error?: unknown) => void,
  ) => Promise<unknown>;
}

function selectChain(rows: unknown[], lookupError?: Error) {
  const chain: any = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(async () => {
    if (lookupError) throw lookupError;
    return rows;
  });
  return chain;
}

async function loadRouter(
  input: {
    auth?: boolean;
    configured?: boolean;
    ownerRows?: unknown[];
    lookupError?: Error;
    environmentAllowed?: boolean;
    buildError?: Error;
    channels?: string[];
  } = {},
) {
  // Several assertions load the route with different infrastructure outcomes
  // in one test. Re-evaluate the module so each mock set owns its router.
  vi.resetModules();
  const fallback = vi.fn(async (_request: unknown, response: any) =>
    response.status(200).send(CONTINUITY_TWIML),
  );
  const select = vi.fn(() =>
    selectChain(input.ownerRows ?? [{ userId: "tenant-1", agentId: "bot-1" }], input.lookupError),
  );
  const environment = vi.fn(async () => ({
    allowed: input.environmentAllowed ?? true,
    environment: input.environmentAllowed === false ? "demo" : "production",
  }));

  vi.doMock("../src/routes/twilio-webhook-base", () => ({
    handleTwilioVoiceFallback: fallback,
  }));
  vi.doMock("../src/lib/server-context", () => ({
    drizzle: { select },
    log: { error: vi.fn(), warn: vi.fn() },
  }));
  vi.doMock("../src/lib/twilio-webhook-auth", () => ({
    evaluateTwilioWebhookAuth: vi.fn(() => ({ ok: input.auth ?? true })),
  }));
  vi.doMock("../src/lib/account-environment-policy", () => ({
    liveExternalActionPolicyForUser: environment,
  }));
  vi.doMock("../src/lib/channel-entitlements", () => ({
    getTenantChannelEntitlements: async () => ({ channels: input.channels ?? ["voice"] }),
  }));
  vi.doMock("../src/lib/founder-fleet-seed", () => ({
    resolveFounderUserId: vi.fn(async () => "founder-1"),
  }));
  vi.doMock("../src/lib/voice/openai-sip-config", () => ({
    normalizeOpenAIPhoneNumber: vi.fn((value: unknown) =>
      typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value.trim()) ? value.trim() : null,
    ),
    OPENAI_INBOUND_SIP_TOKEN_HEADER: "X-BB-Inbound",
    OPENAI_OUTBOUND_SIP_TOKEN_HEADER: "X-BotBound-Token",
    buildOpenAIOutboundSipUri: vi.fn(),
    openAISipConfigured: vi.fn(() => input.configured ?? true),
    resolveOpenAISipSessionMaxSeconds: vi.fn(() => 300),
    buildOpenAIInboundSipUri: vi.fn(() => {
      if (input.buildError) throw input.buildError;
      return "sip:+12025550140@sip.api.openai.com;transport=tls";
    }),
  }));

  const module = await import("../src/routes/openai-inbound-twilio-routes");
  return { router: module.default, fallback, select, environment };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv(
    "INTERNAL_JWT_SECRET",
    "botbound-test-secret-that-is-longer-than-thirty-two-characters",
  );
});

describe("OpenAI inbound carrier continuity", () => {
  const primaryPath = "/api/twilio-webhook/openai-inbound";
  const dialCompletePath = "/api/twilio-webhook/openai-inbound-dial-complete";

  async function invokePrimary(input: Parameters<typeof loadRouter>[0], to = "+12025550140") {
    const loaded = await loadRouter(input);
    const { response, captured } = fakeResponse();
    await routeHandler(loaded.router, primaryPath)(
      {
        path: primaryPath,
        body: {
          To: to,
          From: "+12025550141",
          CallSid: "CA0123456789abcdef0123456789abcdef",
        },
      },
      response,
      vi.fn(),
    );
    await vi.waitFor(() => expect(captured.body).not.toBeUndefined());
    return { ...loaded, captured };
  }

  it("returns non-2xx when OpenAI SIP readiness is transiently unavailable", async () => {
    const result = await invokePrimary({ configured: false });
    expect(result.captured).toEqual({ statusCode: 503, body: HANGUP_TWIML });
    expect(result.select).not.toHaveBeenCalled();
  });

  it("returns non-2xx when an otherwise valid primary route throws", async () => {
    const lookup = await invokePrimary({ lookupError: new Error("database unavailable") });
    expect(lookup.captured).toEqual({ statusCode: 503, body: HANGUP_TWIML });

    const build = await invokePrimary({ buildError: new Error("SIP config unavailable") });
    expect(build.captured).toEqual({ statusCode: 503, body: HANGUP_TWIML });
  });

  it("keeps intentional invalid, unassigned, and suspended refusals as 200 Hangup", async () => {
    const invalid = await invokePrimary({}, "not-a-phone-number");
    expect(invalid.captured).toEqual({ statusCode: 200, body: HANGUP_TWIML });
    expect(invalid.select).not.toHaveBeenCalled();

    const unassigned = await invokePrimary({ ownerRows: [] });
    expect(unassigned.captured.statusCode).toBe(200);
    expect(String(unassigned.captured.body)).toContain("This number is not ready yet");
    expect(String(unassigned.captured.body)).toContain("<Hangup/>");

    const suspended = await invokePrimary({ environmentAllowed: false });
    expect(suspended.captured).toEqual({ statusCode: 200, body: HANGUP_TWIML });
  });

  it("answers the parent before SIP with bounded setup and the carrier Dial duration cap", async () => {
    const result = await invokePrimary({});
    expect(result.captured.statusCode).toBe(200);
    expect(String(result.captured.body)).toContain(
      '<Dial answerOnBridge="false" timeout="30" action="/api/twilio-webhook/openai-inbound-dial-complete" method="POST" timeLimit="300">',
    );
    expect(String(result.captured.body)).toContain(
      "<Sip>sip:+12025550140@sip.api.openai.com;transport=tls</Sip></Dial><Hangup/>",
    );
  });

  it.each([["email"], ["sms"], []])(
    "does not open a SIP leg without Calls (%s)",
    async (...channels) => {
      const result = await invokePrimary({ channels: channels.flat() as string[] });
      expect(result.captured.statusCode).toBe(200);
      expect(result.captured.body).toBe(HANGUP_TWIML);
    },
  );

  it.each(["failed", "busy", "no-answer"])(
    "routes %s Dial outcomes into shared continuity",
    async (dialStatus) => {
      const loaded = await loadRouter();
      const { response, captured } = fakeResponse();
      const request = {
        path: dialCompletePath,
        body: { To: "+12025550140", From: "+12025550141", DialCallStatus: dialStatus },
      };
      await routeHandler(loaded.router, dialCompletePath)(request, response, vi.fn());
      expect(loaded.fallback).toHaveBeenCalledWith(request, response);
      expect(captured).toEqual({ statusCode: 200, body: CONTINUITY_TWIML });
    },
  );

  it.each(["completed", "canceled", "unknown"])(
    "hangs up without continuity for %s Dial outcomes",
    async (dialStatus) => {
      const loaded = await loadRouter();
      const { response, captured } = fakeResponse();
      await routeHandler(loaded.router, dialCompletePath)(
        { path: dialCompletePath, body: { DialCallStatus: dialStatus } },
        response,
        vi.fn(),
      );
      expect(loaded.fallback).not.toHaveBeenCalled();
      expect(captured).toEqual({ statusCode: 200, body: HANGUP_TWIML });
    },
  );

  it("authenticates the Dial action before continuity", async () => {
    const loaded = await loadRouter({ auth: false });
    const { response, captured } = fakeResponse();
    await routeHandler(loaded.router, dialCompletePath)(
      { path: dialCompletePath, body: { DialCallStatus: "failed" } },
      response,
      vi.fn(),
    );
    expect(loaded.fallback).not.toHaveBeenCalled();
    expect(captured).toEqual({ statusCode: 403, body: HANGUP_TWIML });
  });
});
