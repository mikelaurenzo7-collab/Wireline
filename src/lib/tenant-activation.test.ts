import { describe, expect, it } from "vitest";
import {
  ACTIVATION_MIN_DURATION_SEC,
  isPhoneProductionCall,
  isUsefulProductionCall,
} from "./tenant-activation";

describe("tenant-activation", () => {
  it("requires phone traffic, not web simulator", () => {
    expect(isPhoneProductionCall({ vapiCallType: "webCall", customerNumber: "" })).toBe(false);
    expect(
      isPhoneProductionCall({ vapiCallType: "inboundPhoneCall", customerNumber: "+15551234567" }),
    ).toBe(true);
  });

  it("accepts useful inbound calls with productive outcomes", () => {
    expect(
      isUsefulProductionCall({
        demo: false,
        vapiCallType: "inboundPhoneCall",
        direction: "inbound",
        customerNumber: "+15551234567",
        durationSeconds: ACTIVATION_MIN_DURATION_SEC,
        outcomeTag: "booked",
        summary: "Caller booked an appointment for Tuesday.",
      }),
    ).toBe(true);
  });

  it("rejects demo, unreachable, and short browser tests", () => {
    expect(
      isUsefulProductionCall({
        demo: true,
        vapiCallType: "inboundPhoneCall",
        customerNumber: "+15551234567",
        durationSeconds: 120,
        outcomeTag: "booked",
      }),
    ).toBe(false);

    expect(
      isUsefulProductionCall({
        demo: false,
        vapiCallType: "inboundPhoneCall",
        customerNumber: "+15551234567",
        durationSeconds: 120,
        outcomeTag: "unreachable",
        endedReason: "voicemail",
      }),
    ).toBe(false);

    expect(
      isUsefulProductionCall({
        demo: false,
        vapiCallType: "webCall",
        durationSeconds: 90,
        transcript: "x".repeat(200),
        outcomeTag: "info",
      }),
    ).toBe(false);
  });

  it("accepts substantive conversations without a crisp outcome tag", () => {
    expect(
      isUsefulProductionCall({
        demo: false,
        vapiCallType: "outboundPhoneCall",
        direction: "outbound",
        customerNumber: "+15559876543",
        durationSeconds: 50,
        transcript: "a".repeat(150),
        summary: "Discussed pricing and next steps.",
        outcomeTag: "other",
      }),
    ).toBe(true);
  });
});
