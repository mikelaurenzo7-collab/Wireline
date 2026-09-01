import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { liveExternalActionPolicy } from "../src/lib/account-environment-policy";
import { resolveTwilioInboundEnvironment } from "../src/lib/twilio-inbound-environment";

const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';
const HANGUP_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';

type CapturedResponse = {
  statusCode: number;
  body: unknown;
};

function fakeResponse() {
  const captured: CapturedResponse = { statusCode: 200, body: undefined };
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

function selectChain(rows: unknown[]) {
  const chain: any = {};
  chain.from = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(async () => rows);
  return chain;
}

function insertChain(recordedValues: unknown[]) {
  const chain: any = {};
  let values: any = null;
  chain.values = vi.fn((nextValues: unknown) => {
    values = nextValues;
    recordedValues.push(nextValues);
    return chain;
  });
  chain.onConflictDoNothing = vi.fn(() => chain);
  chain.returning = vi.fn(async () => {
    if (values && "unreadCount" in values) return [{ id: 1n }];
    if (values && values.direction === "in") return [{ id: 2n }];
    return [];
  });
  return chain;
}

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("signed Twilio inbound account-environment decision", () => {
  it("allows only explicit production and fails every other classification closed", async () => {
    await expect(
      resolveTwilioInboundEnvironment(TENANT_ID, {
        policyForUser: vi.fn(async () => liveExternalActionPolicy("production")),
      }),
    ).resolves.toEqual({ allowed: true, environment: "production", code: null });

    for (const environment of ["demo", "test", null, undefined, "unknown"] as const) {
      await expect(
        resolveTwilioInboundEnvironment(TENANT_ID, {
          policyForUser: vi.fn(async () => liveExternalActionPolicy(environment)),
        }),
      ).resolves.toMatchObject({ allowed: false });
    }
  });

  it("fails closed when classification lookup throws", async () => {
    await expect(
      resolveTwilioInboundEnvironment(TENANT_ID, {
        policyForUser: vi.fn(async () => {
          throw new Error("database unavailable");
        }),
      }),
    ).resolves.toMatchObject({ allowed: false, environment: null });
  });
});

describe("signed Twilio voice reclassification fence", () => {
  async function loadVoiceRouter(input: {
    allowed: boolean;
    selectRows?: unknown[][];
    lookupError?: Error;
  }) {
    vi.doUnmock("../src/routes/twilio-webhook-base");
    const rows = input.selectRows ? [...input.selectRows] : null;
    const select = vi.fn(() => {
      if (input.lookupError) throw input.lookupError;
      return selectChain(
        rows ? (rows.length ? (rows.shift() as unknown[]) : []) : [{ userId: TENANT_ID }],
      );
    });
    const environment = vi.fn(async () =>
      input.allowed
        ? { allowed: true as const, environment: "production" as const, code: null }
        : {
            allowed: false as const,
            environment: "demo" as const,
            code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
          },
    );
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: { select },
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      tenantStore: { run: vi.fn(async (_userId: string, operation: () => unknown) => operation()) },
    }));
    vi.doMock("../src/lib/twilio-webhook-auth", () => ({
      evaluateTwilioWebhookAuth: vi.fn(() => ({ ok: true })),
    }));
    vi.doMock("../src/lib/twilio-inbound-environment", () => ({
      resolveTwilioInboundEnvironment: environment,
    }));
    vi.doMock("../src/lib/app-url", () => ({
      resolveCanonicalAppUrl: vi.fn(() => ({ url: "https://botbound.me" })),
    }));
    const module = await import("../src/routes/twilio-webhook-base");
    return { router: module.default, select, environment };
  }

  it("returns Hangup-only from both independently signed failover routes for demo tenants", async () => {
    const { router, select, environment } = await loadVoiceRouter({ allowed: false });

    for (const path of [
      "/api/twilio-webhook/voice-fallback",
      "/api/twilio-webhook/voice-fallback-complete",
    ]) {
      const { response, captured } = fakeResponse();
      await routeHandler(router, path)(
        {
          path,
          body: {
            To: "+12025550140",
            From: "+12025550141",
            DialCallStatus: "busy",
          },
        },
        response,
        vi.fn(),
      );
      expect(captured).toEqual({ statusCode: 200, body: HANGUP_TWIML });
      expect(String(captured.body)).not.toMatch(/<(?:Say|Play|Dial|Record)\b/);
    }

    expect(environment).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("preserves the production transfer response after the environment gate", async () => {
    const { router } = await loadVoiceRouter({
      allowed: true,
      selectRows: [[{ userId: TENANT_ID }], [{ humanFallbackNumber: "+14155550199" }]],
    });
    const path = "/api/twilio-webhook/voice-fallback";
    const { response, captured } = fakeResponse();

    await routeHandler(router, path)(
      { path, body: { To: "+12025550140", From: "+12025550141" } },
      response,
      vi.fn(),
    );

    expect(captured.statusCode).toBe(200);
    expect(String(captured.body)).toContain("<Play>");
    expect(String(captured.body)).not.toContain("<Say");
    expect(String(captured.body)).toContain("<Dial");
  });

  it("hangs up without speech or recording when transfer is unavailable or fails", async () => {
    const { router } = await loadVoiceRouter({
      allowed: true,
      selectRows: [[{ userId: TENANT_ID }], [{}], [{ userId: TENANT_ID }]],
    });

    for (const [path, body] of [
      ["/api/twilio-webhook/voice-fallback", { To: "+12025550140", From: "+12025550141" }],
      [
        "/api/twilio-webhook/voice-fallback-complete",
        { To: "+12025550140", From: "+12025550141", DialCallStatus: "busy" },
      ],
    ] as const) {
      const { response, captured } = fakeResponse();
      await routeHandler(router, path)({ path, body }, response, vi.fn());
      expect(captured).toEqual({ statusCode: 200, body: HANGUP_TWIML });
      expect(String(captured.body)).not.toMatch(/<(?:Say|Play|Dial|Record)\b/);
    }
  });

  it.each([
    ["an unknown destination", { allowed: true, selectRows: [[]] }],
    ["a tenant lookup failure", { allowed: true, lookupError: new Error("database unavailable") }],
  ])("returns Hangup-only when classification starts with %s", async (_label, input) => {
    const { router, environment } = await loadVoiceRouter(input);
    const path = "/api/twilio-webhook/voice-fallback";
    const { response, captured } = fakeResponse();

    await routeHandler(router, path)(
      { path, body: { To: "+12025550140", From: "+12025550141" } },
      response,
      vi.fn(),
    );

    expect(captured).toEqual({ statusCode: 200, body: HANGUP_TWIML });
    expect(String(captured.body)).not.toMatch(/<(?:Say|Play|Dial|Record)\b/);
    expect(environment).not.toHaveBeenCalled();
  });
});

describe("signed Twilio SMS reclassification fence", () => {
  it("preserves operator ownership and clears a stale Bot when the exact line is unassigned", async () => {
    vi.doUnmock("../src/routes/twilio-webhook-base");
    vi.doMock("../src/lib/server-context", () => ({
      drizzle: {},
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      tenantStore: { run: vi.fn(async (_userId: string, operation: () => unknown) => operation()) },
    }));
    vi.doMock("../src/lib/twilio-webhook-auth", () => ({
      evaluateTwilioWebhookAuth: vi.fn(() => ({ ok: true })),
    }));

    const threadInsert: any = {};
    threadInsert.values = vi.fn(() => threadInsert);
    threadInsert.onConflictDoNothing = vi.fn(() => threadInsert);
    threadInsert.returning = vi.fn(async () => []);
    const messageInsert: any = {};
    messageInsert.values = vi.fn(() => messageInsert);
    messageInsert.onConflictDoNothing = vi.fn(() => messageInsert);
    messageInsert.returning = vi.fn(async () => [{ id: 2n }]);
    const set = vi.fn(() => ({ where: vi.fn(async () => []) }));
    let insertCall = 0;
    const tx: any = {
      insert: vi.fn(() => (insertCall++ === 0 ? threadInsert : messageInsert)),
      select: vi.fn(() => selectChain([{ id: "thread-1", status: "escalated" }])),
      update: vi.fn(() => ({ set })),
    };

    const { persistInboundSmsEvidence } = await import("../src/routes/twilio-webhook-base");
    await persistInboundSmsEvidence(tx, {
      userId: TENANT_ID,
      agentId: null,
      destinationNumber: "+12025550140",
      customerNumber: "+12025550141",
      body: "I still need help",
      messageSid: "SM00000000000000000000000000000999",
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "escalated",
        agentId: null,
      }),
    );
  });

  async function loadBaseSmsRouter() {
    vi.doUnmock("../src/routes/twilio-webhook-base");
    const values: unknown[] = [];
    const tx: any = {
      insert: vi.fn(() => insertChain(values)),
      select: vi.fn(() => selectChain([])),
      update: vi.fn(() => {
        const chain: any = {};
        chain.set = vi.fn(() => chain);
        chain.where = vi.fn(async () => []);
        return chain;
      }),
    };
    const drizzle: any = {
      select: vi.fn(() => selectChain([{ userId: TENANT_ID }])),
      insert: vi.fn(() => insertChain(values)),
      transaction: vi.fn(async (operation: (transaction: any) => unknown) => operation(tx)),
    };
    vi.doMock("../src/lib/server-context", () => ({
      drizzle,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      tenantStore: { run: vi.fn(async (_userId: string, operation: () => unknown) => operation()) },
    }));
    vi.doMock("../src/lib/twilio-webhook-auth", () => ({
      evaluateTwilioWebhookAuth: vi.fn(() => ({ ok: true })),
    }));
    vi.doMock("../src/lib/twilio-inbound-environment", () => ({
      resolveTwilioInboundEnvironment: vi.fn(async () => ({
        allowed: false,
        environment: "demo",
        code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
      })),
    }));
    const module = await import("../src/routes/twilio-webhook-base");
    return { router: module.default, values };
  }

  it("persists base-route STOP evidence but emits no Message for a demo tenant", async () => {
    const { router, values } = await loadBaseSmsRouter();
    const path = "/api/twilio-webhook/sms";
    const { response, captured } = fakeResponse();

    await routeHandler(router, path)(
      {
        path,
        body: {
          To: "+12025550140",
          From: "+12025550141",
          Body: "STOP",
          MessageSid: "SM00000000000000000000000000000001",
        },
      },
      response,
      vi.fn(),
    );

    expect(captured).toEqual({ statusCode: 200, body: EMPTY_TWIML });
    expect(values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "opt-out", source: "sms_opt_out" }),
        expect.objectContaining({ event: "sms_opt_out", state: "opted_out" }),
        expect.objectContaining({ direction: "in", body: "STOP" }),
      ]),
    );
  });

  async function loadWrapperSmsRouter(allowed: boolean) {
    const values: unknown[] = [];
    const persistInboundSmsEvidence = vi.fn(async () => undefined);
    const lookupMessagingDestination = vi.fn(async (toNumber: string) => ({
      userId: TENANT_ID,
      agentId: null,
      destinationNumber: toNumber,
    }));
    vi.doMock("../src/routes/twilio-webhook-base", async () => {
      const express = await vi.importActual<typeof import("express")>("express");
      return {
        default: express.Router(),
        lookupMessagingDestination,
        persistInboundSmsEvidence,
      };
    });
    const tx: any = {
      execute: vi.fn(async () => undefined),
      select: vi.fn(() => selectChain([])),
      insert: vi.fn(() => insertChain(values)),
      delete: vi.fn(() => ({ where: vi.fn(async () => []) })),
    };
    const drizzle: any = {
      select: vi.fn(() => selectChain([{ userId: TENANT_ID }])),
      transaction: vi.fn(async (operation: (transaction: any) => unknown) => operation(tx)),
    };
    vi.doMock("../src/lib/server-context", () => ({
      drizzle,
      log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      tenantStore: { run: vi.fn(async (_userId: string, operation: () => unknown) => operation()) },
    }));
    vi.doMock("../src/lib/twilio-webhook-auth", () => ({
      evaluateTwilioWebhookAuth: vi.fn(() => ({ ok: true })),
    }));
    vi.doMock("../src/lib/twilio-inbound-environment", () => ({
      resolveTwilioInboundEnvironment: vi.fn(async () =>
        allowed
          ? { allowed: true, environment: "production", code: null }
          : {
              allowed: false,
              environment: "demo",
              code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
            },
      ),
    }));
    vi.doMock("../src/lib/dnc-failsafe", () => ({
      clearDncFailsafe: vi.fn(async () => true),
      recordDncFailsafe: vi.fn(async () => true),
    }));
    vi.doMock("../src/lib/error-reporter", () => ({ reportError: vi.fn() }));
    vi.doMock("../src/lib/twilio-usage-alert-idempotency", () => ({
      claimTwilioUsageAlert: vi.fn(async () => true),
    }));
    const module = await import("../src/routes/twilio-webhook");
    return { router: module.default, values, persistInboundSmsEvidence, tx };
  }

  it("persists STOP, START, and HELP controls but suppresses every wrapper Message in demo", async () => {
    const { router, values, persistInboundSmsEvidence, tx } = await loadWrapperSmsRouter(false);
    const path = "/api/twilio-webhook/sms";

    for (const [index, body] of ["STOP", "START", "HELP"].entries()) {
      const { response, captured } = fakeResponse();
      await routeHandler(router, path)(
        {
          path,
          body: {
            To: "+12025550140",
            From: "+12025550141",
            Body: body,
            MessageSid: `SM${String(index + 1).padStart(32, "0")}`,
          },
        },
        response,
        vi.fn(),
      );
      expect(captured).toEqual({ statusCode: 200, body: EMPTY_TWIML });
    }

    expect(persistInboundSmsEvidence).toHaveBeenCalledTimes(3);
    expect(values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "opt-out", source: "sms_opt_out" }),
        expect.objectContaining({ event: "sms_opt_out" }),
        expect.objectContaining({ event: "sms_opt_in" }),
        expect.objectContaining({ event: "sms_help" }),
      ]),
    );
    expect(tx.delete).toHaveBeenCalledTimes(1);
  });

  it("preserves every production legacy control confirmation", async () => {
    const { router } = await loadWrapperSmsRouter(true);
    const path = "/api/twilio-webhook/sms";
    const controls = [
      ["STOP", "You have been unsubscribed."],
      ["START", "You have been resubscribed. Welcome back."],
      ["HELP", "BotBound SMS help:"],
    ] as const;

    for (const [index, [body, confirmation]] of controls.entries()) {
      const { response, captured } = fakeResponse();
      await routeHandler(router, path)(
        {
          path,
          body: {
            To: "+12025550140",
            From: "+12025550141",
            Body: body,
            MessageSid: `SM${String(index + 90).padStart(32, "9")}`,
          },
        },
        response,
        vi.fn(),
      );

      expect(captured.statusCode).toBe(200);
      expect(String(captured.body)).toContain(`<Message>${confirmation}`);
    }
  });
});

describe("signed Twilio inbound reclassification contracts", () => {
  it("gates both signed failover routes before media while preserving evidence callbacks", () => {
    const base = source("src/routes/twilio-webhook-base.ts");
    expect(base.match(/resolveProductionInboundTenant\(to, req\.path\)/g)).toHaveLength(2);

    const fallback = base.slice(
      base.indexOf("export async function handleTwilioVoiceFallback"),
      base.indexOf('router.post("/api/twilio-webhook/voice-fallback-complete"'),
    );
    const complete = base.slice(
      base.indexOf('router.post("/api/twilio-webhook/voice-fallback-complete"'),
      base.indexOf('router.post("/api/twilio-webhook/voicemail-complete"'),
    );
    const fallbackSignature = fallback.indexOf("verifyTwilioSignature(req)");
    const fallbackEnvironment = fallback.indexOf("resolveProductionInboundTenant(to, req.path)");
    const fallbackHangup = fallback.indexOf("if (!tenantUserId)");
    const transfer = fallback.indexOf("/sounds/wireline-transfer-chime.wav");
    expect(fallbackSignature).toBeGreaterThan(-1);
    expect(fallbackEnvironment).toBeGreaterThan(fallbackSignature);
    expect(fallbackHangup).toBeGreaterThan(fallbackEnvironment);
    expect(transfer).toBeGreaterThan(fallbackHangup);

    const completeSignature = complete.indexOf("verifyTwilioSignature(req)");
    const completeEnvironment = complete.indexOf("resolveProductionInboundTenant(to, req.path)");
    const completeHangup = complete.indexOf("if (!tenantUserId)");
    expect(completeSignature).toBeGreaterThan(-1);
    expect(completeEnvironment).toBeGreaterThan(completeSignature);
    expect(completeHangup).toBeGreaterThan(completeEnvironment);
    expect(complete).toContain("return res.status(200).send(twimlHangup())");
    expect(complete).not.toMatch(/<(?:Play|Dial|Record)\b/);

    const voicemail = base.slice(
      base.indexOf('router.post("/api/twilio-webhook/voicemail-complete"'),
      base.indexOf('router.post("/api/twilio-webhook/voicemail-transcription"'),
    );
    const transcription = base.slice(
      base.indexOf('router.post("/api/twilio-webhook/voicemail-transcription"'),
      base.indexOf('router.post("/api/twilio-webhook/singing-receptionist"'),
    );
    expect(voicemail).toContain("insert(schema.callLogs)");
    expect(transcription).toContain("update(schema.callLogs)");
    for (const evidenceRoute of [voicemail, transcription]) {
      expect(evidenceRoute).not.toContain("resolveProductionInboundTenant");
      expect(evidenceRoute).not.toContain("resolveTwilioInboundEnvironment");
    }
  });

  it("keeps the precedence wrapper environment-gated and evidence-first", () => {
    const wrapper = source("src/routes/twilio-webhook.ts");
    const route = wrapper.slice(
      wrapper.indexOf('router.post("/api/twilio-webhook/sms"'),
      wrapper.indexOf('router.post("/api/twilio-webhook/message-status"'),
    );
    expect(wrapper.indexOf('router.post("/api/twilio-webhook/sms"')).toBeLessThan(
      wrapper.indexOf("router.use(baseRouter)"),
    );
    expect(route).toContain("await persistConsentControl");
    expect(route).toContain("productionReply(optOutRetryTwiml())");
    expect(route).toContain("productionReply(optInRetryTwiml())");
    expect(route).toContain("productionReply(confirmation)");
    expect(wrapper).toContain("await persistInboundSmsEvidence(tx");
    expect(wrapper).toContain(': "sms_help"');
  });

  it("never speaks an internal configuration name on the public singing line", () => {
    const base = source("src/routes/twilio-webhook-base.ts");
    const singing = base.slice(
      base.indexOf('router.post("/api/twilio-webhook/singing-receptionist"'),
    );
    expect(singing).not.toMatch(/<Say[^>]*>[^<]*SINGING_VAPI_SIP_URI/i);
    expect(singing).not.toContain("openai-demo-unavailable.mp3");
    expect(singing).toMatch(/if \(sipUri\)[\s\S]*else \{[\s\S]*<Hangup\/>/);
  });
});
