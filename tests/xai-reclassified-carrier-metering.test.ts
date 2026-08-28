import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const CALL_SID = `CA${"a".repeat(32)}`;

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("reclassified xAI outbound carrier accounting", () => {
  it("hard-hangups with zero xAI bridge while replay counts one minimum carrier minute", async () => {
    const countedProviderCalls = new Set<string>();
    let billedMinutes = 0;
    const trackVoiceMinutes = vi.fn(
      async (opts: { userId: string; durationSeconds: number; vapiCallId: string }) => {
        if (countedProviderCalls.has(`${opts.userId}:${opts.vapiCallId}`)) return;
        countedProviderCalls.add(`${opts.userId}:${opts.vapiCallId}`);
        billedMinutes += Math.max(1, Math.ceil(opts.durationSeconds / 60));
      },
    );
    const buildXAIOutboundSipUri = vi.fn();
    const limit = vi.fn(async () =>
      limit.mock.calls.length % 2 === 1
        ? [
            {
              id: 1n,
              userId: "tenant-demo",
              callId: CALL_SID,
              metadata: { native_voice: { placement_id: "placement-1" } },
            },
          ]
        : [{ accountEnvironment: "demo" }],
    );
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit })),
        })),
      })),
    };
    const drizzle = {
      transaction: vi.fn(async (operation: (transaction: typeof tx) => Promise<unknown>) =>
        operation(tx),
      ),
    };

    vi.doMock("../src/lib/server-context", () => ({
      drizzle,
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));
    vi.doMock("../src/lib/twilio-webhook-auth", () => ({
      evaluateTwilioWebhookAuth: vi.fn(() => ({ ok: true })),
    }));
    vi.doMock("../src/lib/voice/xai-outbound-token", () => ({
      verifyXAIOutboundToken: vi.fn(() => ({
        ok: true,
        claims: { leadId: "1", placementId: "placement-1" },
      })),
      xaiOutboundPlacementMatches: vi.fn(() => true),
    }));
    vi.doMock("../src/lib/voice/xai-sip-config", () => ({
      buildXAIOutboundSipUri,
      normalizeXAIPhoneNumber: vi.fn((value: unknown) => value),
      resolveXAISipSessionMaxSeconds: vi.fn(() => 600),
    }));
    vi.doMock("../src/lib/voice-usage", () => ({ trackVoiceMinutes }));

    const { default: router } = await import("../src/routes/xai-outbound-routes");
    type Handler = (req: unknown, res: unknown, next: (error?: unknown) => void) => void;
    const layers = (
      router as unknown as {
        stack: Array<{ route?: { path?: string; stack?: Array<{ handle: Handler }> } }>;
      }
    ).stack;
    const handler = layers.find(
      (layer) => layer.route?.path === "/api/twilio-webhook/xai-outbound-bridge",
    )?.route?.stack?.[0]?.handle;
    expect(handler).toBeTypeOf("function");

    const invoke = async (): Promise<string> => {
      let responseBody = "";
      await new Promise<void>((resolveRequest, rejectRequest) => {
        const response = {
          setHeader: vi.fn(),
          status: vi.fn(),
          send: vi.fn((body: string) => {
            responseBody = body;
            resolveRequest();
            return response;
          }),
        };
        response.status.mockReturnValue(response);
        handler?.(
          {
            query: { token: "signed-placement-token" },
            body: { CallSid: CALL_SID, AnsweredBy: "human" },
          },
          response,
          (error?: unknown) => {
            if (error) rejectRequest(error);
          },
        );
      });
      return responseBody;
    };

    const first = await invoke();
    const replay = await invoke();

    expect(first).toContain("<Hangup/>");
    expect(replay).toBe(first);
    expect(first).not.toMatch(/<Dial|<Sip|<Say/);
    expect(buildXAIOutboundSipUri).not.toHaveBeenCalled();
    expect(trackVoiceMinutes).toHaveBeenCalledTimes(2);
    expect(trackVoiceMinutes).toHaveBeenNthCalledWith(1, {
      userId: "tenant-demo",
      durationSeconds: 0,
      vapiCallId: `twilio:${CALL_SID}`,
    });
    expect(countedProviderCalls).toEqual(new Set([`tenant-demo:twilio:${CALL_SID}`]));
    expect(billedMinutes).toBe(1);
  }, 20_000);

  it("meters before the Hangup response through the durable per-call idempotency contract", () => {
    const route = readFileSync(resolve(process.cwd(), "src/routes/xai-outbound-routes.ts"), "utf8");
    const hangup = route.slice(
      route.indexOf('if (decision.kind === "hangup")'),
      route.indexOf('if (decision.kind === "drop")'),
    );
    expect(
      hangup.indexOf("await meterNativeCarrierAttempt(decision.userId, callSid)"),
    ).toBeGreaterThan(-1);
    expect(
      hangup.indexOf("await meterNativeCarrierAttempt(decision.userId, callSid)"),
    ).toBeLessThan(hangup.indexOf("res.status(200).send(emptyTwiml())"));

    const usage = readFileSync(resolve(process.cwd(), "src/lib/voice-usage.ts"), "utf8");
    const schema = readFileSync(resolve(process.cwd(), "src/db/voice-usage-schema.ts"), "utf8");
    expect(usage).toContain("return Math.max(1, Math.ceil(safeSeconds / 60))");
    expect(usage).toContain("onConflictDoNothing({");
    expect(usage).toContain("target: [voiceUsageEvents.userId, voiceUsageEvents.providerCallId]");
    expect(schema).toContain("primaryKey({ columns: [table.userId, table.providerCallId] })");
  });
});
