import { describe, expect, it, vi } from "vitest";

import {
  isCarrierAlreadyReleasedError,
  releaseCarrierAllocations,
  type CarrierReleaseAdapters,
} from "../src/lib/carrier-release";

function adapters(
  overrides: Partial<CarrierReleaseAdapters> = {},
): CarrierReleaseAdapters & {
  inspectVapiProvider: ReturnType<typeof vi.fn>;
  releaseVapi: ReturnType<typeof vi.fn>;
  releaseTwilioBySid: ReturnType<typeof vi.fn>;
  releaseTwilioByE164: ReturnType<typeof vi.fn>;
} {
  return {
    twilioAvailable: true,
    inspectVapiProvider: vi.fn().mockResolvedValue("twilio"),
    releaseVapi: vi.fn().mockResolvedValue(undefined),
    releaseTwilioBySid: vi.fn().mockResolvedValue(undefined),
    releaseTwilioByE164: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as CarrierReleaseAdapters & {
    inspectVapiProvider: ReturnType<typeof vi.fn>;
    releaseVapi: ReturnType<typeof vi.fn>;
    releaseTwilioBySid: ReturnType<typeof vi.fn>;
    releaseTwilioByE164: ReturnType<typeof vi.fn>;
  };
}

describe("carrier release integrity", () => {
  it("releases both Vapi and the underlying Twilio E.164 allocation", async () => {
    const deps = adapters();
    const result = await releaseCarrierAllocations(
      { kind: "vapi", carrierId: "vapi-number-id", phoneNumber: "+13125550100" },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.releaseVapi).toHaveBeenCalledWith("vapi-number-id");
    expect(deps.releaseTwilioByE164).toHaveBeenCalledWith("+13125550100");
    expect(deps.inspectVapiProvider).not.toHaveBeenCalled();
  });

  it("keeps the release failed when either provider teardown fails", async () => {
    const deps = adapters({
      releaseVapi: vi.fn().mockRejectedValue(new Error("Vapi 503: upstream unavailable")),
      releaseTwilioByE164: vi.fn().mockRejectedValue(new Error("Twilio timeout")),
    });
    const result = await releaseCarrierAllocations(
      { kind: "vapi", carrierId: "vapi-number-id", phoneNumber: "+13125550100" },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Vapi release");
    expect(result.error).toContain("Twilio E.164 release");
    expect(deps.releaseVapi).toHaveBeenCalledOnce();
    expect(deps.releaseTwilioByE164).toHaveBeenCalledOnce();
  });

  it("treats provider already-gone responses as retry-safe success", async () => {
    const deps = adapters({
      releaseVapi: vi.fn().mockRejectedValue(new Error("Vapi 404: phone number not found")),
      releaseTwilioByE164: vi.fn().mockRejectedValue({ statusCode: 404, code: 20404 }),
    });
    const result = await releaseCarrierAllocations(
      { kind: "vapi", carrierId: "vapi-number-id", phoneNumber: "+13125550100" },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(isCarrierAlreadyReleasedError(new Error("Vapi 404: missing"))).toBe(true);
    expect(isCarrierAlreadyReleasedError({ statusCode: 404, code: 20404 })).toBe(true);
    expect(isCarrierAlreadyReleasedError(new Error("Vapi 500: failed"))).toBe(false);
  });

  it("allows a confirmed Vapi-managed number to release without Twilio", async () => {
    const deps = adapters({
      twilioAvailable: false,
      inspectVapiProvider: vi.fn().mockResolvedValue("vapi"),
    });
    const result = await releaseCarrierAllocations(
      { kind: "vapi", carrierId: "vapi-number-id", phoneNumber: "+13125550100" },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.inspectVapiProvider).toHaveBeenCalledWith("vapi-number-id");
    expect(deps.releaseTwilioByE164).not.toHaveBeenCalled();
  });

  it("preserves a Twilio-backed Vapi object until Twilio cleanup can run", async () => {
    const deps = adapters({
      twilioAvailable: false,
      inspectVapiProvider: vi.fn().mockResolvedValue("twilio"),
    });
    const result = await releaseCarrierAllocations(
      { kind: "vapi", carrierId: "vapi-number-id", phoneNumber: "+13125550100" },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Twilio-managed");
    expect(deps.releaseVapi).not.toHaveBeenCalled();
  });

  it("treats an absent Vapi object as a terminal already-released state", async () => {
    const deps = adapters({
      twilioAvailable: false,
      inspectVapiProvider: vi.fn().mockResolvedValue(null),
    });
    const result = await releaseCarrierAllocations(
      { kind: "vapi", carrierId: "vapi-number-id", phoneNumber: "+13125550100" },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.releaseVapi).not.toHaveBeenCalled();
  });

  it("treats an inspection 404 as a terminal already-released state", async () => {
    const deps = adapters({
      twilioAvailable: false,
      inspectVapiProvider: vi.fn().mockRejectedValue({ statusCode: 404 }),
    });
    const result = await releaseCarrierAllocations(
      { kind: "vapi", carrierId: "vapi-number-id", phoneNumber: "+13125550100" },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.releaseVapi).not.toHaveBeenCalled();
  });

  it("keeps provider metadata intact after a transient inspection failure", async () => {
    const deps = adapters({
      twilioAvailable: false,
      inspectVapiProvider: vi.fn().mockRejectedValue(new Error("Vapi 503")),
    });
    const result = await releaseCarrierAllocations(
      { kind: "vapi", carrierId: "vapi-number-id", phoneNumber: "+13125550100" },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Vapi provider inspection");
    expect(deps.releaseVapi).not.toHaveBeenCalled();
  });

  it("releases legacy Twilio SID rows directly", async () => {
    const deps = adapters();
    const result = await releaseCarrierAllocations(
      { kind: "twilio_sid", carrierId: "PN123", phoneNumber: "+13125550100" },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(deps.releaseTwilioBySid).toHaveBeenCalledWith("PN123");
    expect(deps.releaseVapi).not.toHaveBeenCalled();
  });

  it("does not claim success when no carrier release path exists", async () => {
    const deps = adapters({ twilioAvailable: false });
    const result = await releaseCarrierAllocations(
      { kind: "e164", phoneNumber: "+13125550100" },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("No carrier release path");
  });
});
