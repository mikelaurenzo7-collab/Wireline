import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

beforeEach(() => {
  vi.resetModules();
  delete process.env.WIRELINE_SHOWCASE_DAILY_CALL_CEILING;
  delete process.env.WIRELINE_SHOWCASE_CALLER_DAILY_CALL_CEILING;
});

async function loadModule(input: {
  limiterAvailable?: boolean;
  rateLimitImpl?: (key: string, opts: unknown) => Promise<unknown>;
}) {
  const rateLimit = vi.fn(
    input.rateLimitImpl || (async () => ({ allowed: true, remaining: 10, resetMs: 1_000 })),
  );
  vi.doMock("../src/lib/rate-limit", () => ({
    distributedLimiterStatus: vi.fn(() =>
      input.limiterAvailable === false
        ? { ok: false, code: "RATE_LIMITER_UNAVAILABLE", reason: "Redis is unavailable" }
        : { ok: true },
    ),
    rateLimit,
  }));
  vi.doMock("../src/lib/server-context", () => ({
    log: { error: vi.fn(), warn: vi.fn() },
  }));
  const { admitShowcaseDemoCall } = await import("../src/lib/showcase-demo-ceiling");
  return { admitShowcaseDemoCall, rateLimit };
}

describe("public showcase aggregate admission", () => {
  it("admits under both daily ceilings and charges both buckets", async () => {
    const { admitShowcaseDemoCall, rateLimit } = await loadModule({});
    await expect(admitShowcaseDemoCall("+15550001111")).resolves.toEqual({ admitted: true });
    expect(rateLimit.mock.calls.map(([, opts]) => (opts as { bucket: string }).bucket)).toEqual([
      "showcase:demo-daily",
      "showcase:demo-caller-daily",
    ]);
    expect(
      rateLimit.mock.calls.every(
        ([, opts]) => (opts as { failClosedOnError?: boolean }).failClosedOnError,
      ),
    ).toBe(true);
  });

  it("refuses at the global ceiling before charging a caller bucket", async () => {
    const { admitShowcaseDemoCall, rateLimit } = await loadModule({
      rateLimitImpl: async () => ({ allowed: false, remaining: 0, resetMs: 1_000 }),
    });
    await expect(admitShowcaseDemoCall("+15550001111")).resolves.toEqual({
      admitted: false,
      reason: "global_daily_ceiling",
    });
    expect(rateLimit).toHaveBeenCalledTimes(1);
  });

  it("refuses one caller farming the public lines", async () => {
    const { admitShowcaseDemoCall } = await loadModule({
      rateLimitImpl: async (_key, opts) => ({
        allowed: (opts as { bucket: string }).bucket === "showcase:demo-daily",
        remaining: 0,
        resetMs: 1_000,
      }),
    });
    await expect(admitShowcaseDemoCall("+15550001111")).resolves.toEqual({
      admitted: false,
      reason: "caller_daily_ceiling",
    });
  });

  it("keeps the global ceiling when the carrier omits caller identity", async () => {
    const { admitShowcaseDemoCall, rateLimit } = await loadModule({});
    await expect(admitShowcaseDemoCall(null)).resolves.toEqual({ admitted: true });
    expect(rateLimit).toHaveBeenCalledTimes(1);
  });

  it("fails closed when distributed limiting is absent or errors", async () => {
    const unavailable = await loadModule({ limiterAvailable: false });
    await expect(unavailable.admitShowcaseDemoCall("+15550001111")).resolves.toEqual({
      admitted: false,
      reason: "limiter_unavailable",
    });
    expect(unavailable.rateLimit).not.toHaveBeenCalled();

    const failed = await loadModule({
      rateLimitImpl: async () => {
        throw new Error("redis down");
      },
    });
    await expect(failed.admitShowcaseDemoCall("+15550001111")).resolves.toEqual({
      admitted: false,
      reason: "limiter_unavailable",
    });
  });
});

describe("OpenAI showcase admission wiring", () => {
  const routes = read("src/routes/openai-sip-routes.ts");
  const incoming = routes.slice(
    routes.indexOf('"/api/webhooks/openai/realtime"'),
    routes.indexOf("export default router"),
  );

  it("authenticates, admits, and denies before seeding or runtime/provider work", () => {
    const verification = incoming.indexOf("verifyStandardWebhook({");
    const unauthorized = incoming.indexOf("if (!verification.ok)", verification);
    const admission = incoming.indexOf("await admitShowcaseDemoCall(callerNumber)", unauthorized);
    const context = incoming.indexOf("await resolveInboundContext", admission);
    const runtime = incoming.indexOf("await buildOpenAIRealtimeAgentRuntime", context);
    const acceptance = incoming.indexOf("await acceptCall", runtime);
    expect(verification).toBeGreaterThan(-1);
    expect(unauthorized).toBeGreaterThan(verification);
    expect(admission).toBeGreaterThan(unauthorized);
    expect(context).toBeGreaterThan(admission);
    expect(runtime).toBeGreaterThan(context);
    expect(acceptance).toBeGreaterThan(runtime);
    expect(incoming.slice(admission, context)).toContain("await rejectCall(callId, 486)");
    expect(incoming.slice(admission, context)).toContain("handled: false");
  });

  it("keeps the OpenAI SIP session's enforced per-call duration ceiling", () => {
    const session = read("src/lib/voice/openai-sip-session.ts");
    expect(session).toContain("resolveOpenAISipSessionMaxSeconds() * 1_000");
  });
});
