import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const environmentPolicy = vi.hoisted(() => ({
  assertExternalEntityActionAllowed: vi.fn(),
  assertLiveExternalActionAllowed: vi.fn(),
}));

vi.mock("../src/lib/account-environment-policy", () => environmentPolicy);

import { hangupXAISipCall, referXAISipCall } from "../src/lib/voice/xai-sip-session";

describe("xAI call-control idempotency", () => {
  const priorApiKey = process.env.XAI_API_KEY;

  beforeEach(() => {
    process.env.XAI_API_KEY = "test-xai-key";
    environmentPolicy.assertExternalEntityActionAllowed.mockReset().mockResolvedValue(undefined);
    environmentPolicy.assertLiveExternalActionAllowed.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (priorApiKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = priorApiKey;
  });

  it.each([404, 409])("treats hangup HTTP %i as the desired terminal state", async (status) => {
    const provider = vi.fn().mockResolvedValue(new Response(null, { status }));
    vi.stubGlobal("fetch", provider);

    await expect(hangupXAISipCall("call/already-ended")).resolves.toBeUndefined();
    expect(environmentPolicy.assertLiveExternalActionAllowed).not.toHaveBeenCalled();
    expect(environmentPolicy.assertExternalEntityActionAllowed).not.toHaveBeenCalled();
    expect(provider).toHaveBeenCalledWith(
      expect.stringContaining("call%2Falready-ended/hangup"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("still surfaces an actionable hangup provider failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(hangupXAISipCall("call-live")).rejects.toThrow("xAI hangup returned HTTP 500.");
  });

  it("does not weaken REFER semantics for missing calls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(
      referXAISipCall("user-production", "call-missing", "+14155551234"),
    ).rejects.toThrow("xAI refer returned HTTP 404.");
  });

  it.each(["demo", "missing"])(
    "blocks a %s tenant before any REFER provider request",
    async (environment) => {
      const provider = vi.fn();
      vi.stubGlobal("fetch", provider);
      environmentPolicy.assertLiveExternalActionAllowed.mockRejectedValueOnce(
        new Error(`blocked ${environment}`),
      );

      await expect(
        referXAISipCall("user-nonproduction", "call-live", "+14155551234"),
      ).rejects.toThrow(`blocked ${environment}`);

      expect(environmentPolicy.assertExternalEntityActionAllowed).toHaveBeenCalledWith(
        "user-nonproduction",
        "xai_sip_call_refer",
        { phone: "+14155551234" },
      );
      expect(environmentPolicy.assertLiveExternalActionAllowed).toHaveBeenCalledWith(
        "user-nonproduction",
        "xai_sip_call_refer",
      );
      expect(provider).not.toHaveBeenCalled();
    },
  );

  it("blocks a reserved fixture transfer before the final environment check and REFER", async () => {
    const provider = vi.fn();
    vi.stubGlobal("fetch", provider);
    environmentPolicy.assertExternalEntityActionAllowed.mockRejectedValueOnce(
      new Error("blocked fixture"),
    );

    await expect(referXAISipCall("user-production", "call-live", "+14155550100")).rejects.toThrow(
      "blocked fixture",
    );

    expect(environmentPolicy.assertLiveExternalActionAllowed).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });
});
