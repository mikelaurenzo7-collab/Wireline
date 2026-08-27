import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { enforceXAIInboundProductionEnvironment } from "../src/routes/xai-voice-routes";

const input = {
  userId: "tenant-1",
  callId: "call_123456789",
  bindingId: "binding-1",
  calledNumber: "+14155552671",
};

describe("signed xAI inbound account-environment fence", () => {
  it("admits only an explicit production account without hanging up", async () => {
    const hangup = vi.fn();
    await expect(
      enforceXAIInboundProductionEnvironment(input, {
        policyForUser: vi.fn().mockResolvedValue({
          allowed: true,
          environment: "production",
        }),
        hangup,
        warn: vi.fn(),
      }),
    ).resolves.toBe(true);
    expect(hangup).not.toHaveBeenCalled();
  });

  it.each(["demo", "test"] as const)(
    "hard-hangups a signed call for a %s workspace",
    async (environment) => {
      const hangup = vi.fn().mockResolvedValue(undefined);
      const warn = vi.fn();
      await expect(
        enforceXAIInboundProductionEnvironment(input, {
          policyForUser: vi.fn().mockResolvedValue({
            allowed: false,
            environment,
            status: 403,
            code: "NON_PRODUCTION_EXTERNAL_ACTION_BLOCKED",
            message: "Live external actions are disabled.",
          }),
          hangup,
          warn,
        }),
      ).resolves.toBe(false);
      expect(hangup).toHaveBeenCalledOnce();
      expect(hangup).toHaveBeenCalledWith(input.callId);
      expect(warn).toHaveBeenCalled();
    },
  );

  it("fails closed and still attempts cleanup when classification is unavailable", async () => {
    const hangup = vi.fn().mockRejectedValue(new Error("provider timeout"));
    const warn = vi.fn();
    await expect(
      enforceXAIInboundProductionEnvironment(input, {
        policyForUser: vi.fn().mockRejectedValue(new Error("database unavailable")),
        hangup,
        warn,
      }),
    ).resolves.toBe(false);
    expect(hangup).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "xAI signed incoming call hard-hangup could not be confirmed",
      expect.any(Object),
    );
  });

  it("runs after signature verification and before context, session, or lease work", () => {
    const source = readFileSync(resolve(process.cwd(), "src/routes/xai-voice-routes.ts"), "utf8");
    const route = source.slice(source.indexOf('"/api/webhooks/xai/voice"'));
    const signature = route.indexOf("if (!verification.ok)");
    const environment = route.indexOf("enforceXAIInboundProductionEnvironment({");
    const context = route.indexOf("resolveAgentContext(binding)");
    const outboundSession = route.indexOf("resolveOutboundSession({");
    const lease = route.indexOf("acquireAccountOperationLease({");
    const session = route.indexOf("runXAISipCallSession(sessionInput)");

    expect(signature).toBeGreaterThanOrEqual(0);
    expect(environment).toBeGreaterThan(signature);
    expect(context).toBeGreaterThan(environment);
    expect(outboundSession).toBeGreaterThan(environment);
    expect(lease).toBeGreaterThan(environment);
    expect(session).toBeGreaterThan(lease);
  });
});
