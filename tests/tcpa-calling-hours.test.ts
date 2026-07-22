import { describe, expect, it } from "vitest";
import { resolveCallingHoursForPhone } from "../src/lib/tcpa-calling-hours";

describe("TCPA calling hours", () => {
  it("allows a California number during Pacific business hours", () => {
    // 2026-07-22 15:00 UTC = 08:00 America/Los_Angeles
    const decision = resolveCallingHoursForPhone("+14155550100", new Date("2026-07-22T15:00:00Z"));
    expect(decision.state).toBe("CA");
    expect(decision.timeZone).toBe("America/Los_Angeles");
    expect(decision.localHour).toBe(8);
    expect(decision.allowed).toBe(true);
  });

  it("blocks a California number before 8am local", () => {
    // 2026-07-22 14:00 UTC = 07:00 America/Los_Angeles
    const decision = resolveCallingHoursForPhone("+14155550100", new Date("2026-07-22T14:00:00Z"));
    expect(decision.localHour).toBe(7);
    expect(decision.allowed).toBe(false);
  });

  it("blocks a New York number at/after 9pm local", () => {
    // 2026-07-23 01:00 UTC = 21:00 America/New_York
    const decision = resolveCallingHoursForPhone("+12125550100", new Date("2026-07-23T01:00:00Z"));
    expect(decision.state).toBe("NY");
    expect(decision.localHour).toBe(21);
    expect(decision.allowed).toBe(false);
  });

  it("uses the continental intersection window when state is unknown", () => {
    const early = resolveCallingHoursForPhone("+19995550100", new Date("2026-07-22T13:00:00Z"));
    // 09:00 ET — before the 11:00 unknown-start
    expect(early.inferred).toBe(false);
    expect(early.localHour).toBe(9);
    expect(early.allowed).toBe(false);

    const ok = resolveCallingHoursForPhone("+19995550100", new Date("2026-07-22T16:00:00Z"));
    // 12:00 ET — inside 11–21
    expect(ok.localHour).toBe(12);
    expect(ok.allowed).toBe(true);
  });
});
