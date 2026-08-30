import { describe, expect, it, vi } from "vitest";

import {
  isCarrierAlreadyReleasedError,
  releaseCarrierAllocations,
  type CarrierReleaseAdapters,
} from "../src/lib/carrier-release";

function adapters(overrides: Partial<CarrierReleaseAdapters> = {}): CarrierReleaseAdapters {
  return {
    twilioAvailable: true,
    releaseTwilioBySid: vi.fn().mockResolvedValue(undefined),
    releaseTwilioByE164: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("Twilio-only carrier release integrity", () => {
  it("releases a canonical Twilio SID directly", async () => {
    const deps = adapters();
    await expect(
      releaseCarrierAllocations(
        { kind: "twilio_sid", carrierId: "PN123", phoneNumber: "+13125550100" },
        deps,
      ),
    ).resolves.toEqual({ ok: true });
    expect(deps.releaseTwilioBySid).toHaveBeenCalledWith("PN123");
    expect(deps.releaseTwilioByE164).not.toHaveBeenCalled();
  });

  it("releases a legacy E.164 row through Twilio discovery", async () => {
    const deps = adapters();
    await expect(
      releaseCarrierAllocations({ kind: "e164", phoneNumber: "+13125550100" }, deps),
    ).resolves.toEqual({ ok: true });
    expect(deps.releaseTwilioByE164).toHaveBeenCalledWith("+13125550100");
  });

  it("treats Twilio-confirmed absence as retry-safe success", async () => {
    const deps = adapters({
      releaseTwilioBySid: vi.fn().mockRejectedValue({ statusCode: 404, code: 20404 }),
    });
    await expect(
      releaseCarrierAllocations(
        { kind: "twilio_sid", carrierId: "PN123", phoneNumber: "+13125550100" },
        deps,
      ),
    ).resolves.toEqual({ ok: true });
    expect(isCarrierAlreadyReleasedError({ statusCode: 404, code: 20404 })).toBe(true);
    expect(isCarrierAlreadyReleasedError(new Error("Twilio 500: failed"))).toBe(false);
  });

  it("fails closed when Twilio is unavailable or ownership is incomplete", async () => {
    await expect(
      releaseCarrierAllocations(
        { kind: "e164", phoneNumber: "+13125550100" },
        adapters({ twilioAvailable: false }),
      ),
    ).resolves.toEqual({
      ok: false,
      error: "Twilio cleanup could not run because the client is unavailable.",
    });
    await expect(
      releaseCarrierAllocations(
        { kind: "twilio_sid", phoneNumber: "+13125550100" },
        adapters(),
      ),
    ).resolves.toEqual({ ok: false, error: "Twilio number SID is missing." });
  });

  it("preserves retry evidence on an ambiguous carrier failure", async () => {
    const deps = adapters({
      releaseTwilioByE164: vi.fn().mockRejectedValue(new Error("carrier timeout")),
    });
    await expect(
      releaseCarrierAllocations({ kind: "e164", phoneNumber: "+13125550100" }, deps),
    ).resolves.toEqual({ ok: false, error: "Twilio E.164 release: carrier timeout" });
  });
});
