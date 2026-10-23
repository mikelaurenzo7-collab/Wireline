import { describe, expect, it } from "vitest";

import { ownerWorkAge } from "../src/lib/owner-work-age";

const now = Date.parse("2026-10-23T12:00:00Z");

describe("owner work creation age", () => {
  it("keeps the exact timestamp and actual day count for old work", () => {
    expect(ownerWorkAge("2026-09-20T12:00:00Z", now)).toEqual({
      dateTime: "2026-09-20T12:00:00.000Z",
      ageLabel: "33 days ago",
    });
  });

  it.each([
    ["2026-10-22T12:00:00Z", "1 day ago"],
    ["2026-10-23T10:00:00Z", "2 hours ago"],
    ["2026-10-23T11:59:00Z", "1 minute ago"],
    ["2026-10-23T11:59:59Z", "Less than a minute ago"],
    ["2026-10-23T12:00:00Z", "Less than a minute ago"],
  ])("reports elapsed creation age for %s without expiry", (timestamp, ageLabel) => {
    expect(ownerWorkAge(timestamp, now)?.ageLabel).toBe(ageLabel);
  });

  it("uses the explicit offset rather than interpreting the viewer's local timezone", () => {
    expect(ownerWorkAge("2026-10-22T07:00:00-05:00", now)).toEqual({
      dateTime: "2026-10-22T12:00:00.000Z",
      ageLabel: "1 day ago",
    });
  });

  it("identifies a future recorded timestamp without a negative or fresh age", () => {
    expect(ownerWorkAge("2026-10-24T12:00:00Z", now)).toEqual({
      dateTime: "2026-10-24T12:00:00.000Z",
      ageLabel: "Future timestamp",
    });
  });

  it.each([
    undefined,
    null,
    "",
    "not a date",
    "1",
    0,
    {},
    "2026-02-30T12:00:00Z",
    "2026-10-23",
    "2026-10-23T12:00:00",
  ])("leaves unavailable or ambiguous creation metadata unknown: %j", (timestamp) => {
    expect(ownerWorkAge(timestamp, now)).toBeNull();
  });
});
