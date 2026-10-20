import { describe, expect, it } from "vitest";

import { annualAllowanceSliceReference } from "../src/lib/runtime-allowance-slices";

const PERIOD_START = Date.parse("2026-01-15T00:00:00.000Z") / 1000;
const REFERENCE = `sub_annual:${PERIOD_START}`;

describe("annual runtime allowance slices", () => {
  it("posts the month that contains now, not the whole year", () => {
    const first = annualAllowanceSliceReference(
      REFERENCE,
      new Date("2026-01-20T12:00:00.000Z"),
    );
    const second = annualAllowanceSliceReference(
      REFERENCE,
      new Date("2026-02-16T12:00:00.000Z"),
    );
    expect(first).toBe(`${REFERENCE}:slice:${PERIOD_START}`);
    expect(second).toBe(`${REFERENCE}:slice:${Date.parse("2026-02-15T00:00:00.000Z") / 1000}`);
    expect(first).not.toBe(second);
  });

  it("does not grant before the period or after twelve months", () => {
    expect(
      annualAllowanceSliceReference(REFERENCE, new Date("2026-01-14T23:00:00.000Z")),
    ).toBeNull();
    expect(
      annualAllowanceSliceReference(REFERENCE, new Date("2027-01-15T00:00:00.000Z")),
    ).toBeNull();
  });
});
