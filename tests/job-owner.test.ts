import { describe, expect, it } from "vitest";
import { assertJobPayloadOwner, JobOwnerError, jobOwnerId } from "../src/lib/job-owner";

const owner = "abcdef12-3456-4789-abcd-123456789abc";
const other = "22222222-2222-4222-8222-222222222222";

describe("authoritative queued job ownership", () => {
  it.each([
    { userId: owner },
    { user_id: owner },
    { userId: owner.toUpperCase(), user_id: owner },
    { userId: undefined, user_id: owner },
  ])("normalizes a valid immutable row: %j", (row) => {
    expect(jobOwnerId(row)).toBe(owner);
  });

  it("retains the explicit all-zero system owner", () => {
    expect(jobOwnerId({ userId: "00000000-0000-0000-0000-000000000000" })).toBe(
      "00000000-0000-0000-0000-000000000000",
    );
  });

  it.each([
    null,
    [],
    {},
    { payload: { userId: owner } },
    { userId: null },
    { userId: "" },
    { userId: 123 },
    { userId: ` ${owner}` },
    { userId: "tenant-one" },
    { userId: owner, user_id: other },
    { userId: owner, user_id: null },
    { userId: owner, user_id: "bad" },
    Object.create({ userId: owner }) as unknown,
  ])("rejects missing, conflicting, malformed, or inherited row identity: %j", (row) => {
    expect(() => jobOwnerId(row)).toThrow(JobOwnerError);
  });

  it.each([{}, { userId: owner }, { user_id: owner }, { userId: owner.toUpperCase() }])(
    "permits legacy payload omission or an agreeing payload: %j",
    (payload) => expect(assertJobPayloadOwner({ userId: owner }, payload)).toBe(owner),
  );

  it.each([null, [], { userId: other }, { userId: null }, { user_id: "" }])(
    "rejects invalid or mismatched supplied payload ownership: %j",
    (payload) =>
      expect(() => assertJobPayloadOwner({ userId: owner }, payload)).toThrow(JobOwnerError),
  );

  it("never adopts a payload owner when the row owner is absent", () => {
    expect(() => assertJobPayloadOwner({}, { userId: owner })).toThrow(JobOwnerError);
  });
});
