import { describe, expect, it } from "vitest";

import {
  markRealtimeProviderCallOutcome,
  realtimeProviderCallMayExist,
  shouldRetainRealtimeReservation,
} from "./realtime-provider-outcome";

describe("realtime provider outcome accounting", () => {
  it("releases a marked pre-call failure even when its HTTP status is 502", () => {
    const error = markRealtimeProviderCallOutcome(
      Object.assign(new Error("mint failed"), { status: 502 }),
      false,
    );
    expect(realtimeProviderCallMayExist(error)).toBe(false);
    expect(shouldRetainRealtimeReservation(error)).toBe(false);
  });

  it("retains an ambiguous provider call regardless of its response status", () => {
    const error = markRealtimeProviderCallOutcome(
      Object.assign(new Error("hangup unknown"), { status: 503 }),
      true,
    );
    expect(realtimeProviderCallMayExist(error)).toBe(true);
    expect(shouldRetainRealtimeReservation(error)).toBe(true);
  });

  it("keeps conservative legacy handling for unmarked provider 502s", () => {
    expect(shouldRetainRealtimeReservation({ status: 502 })).toBe(true);
    expect(shouldRetainRealtimeReservation({ status: 503 })).toBe(false);
  });
});
