import { describe, expect, it } from "vitest";
import { getPostgresErrorCode } from "./pg-errors";

describe("getPostgresErrorCode", () => {
  it("reads code from the top-level error", () => {
    expect(getPostgresErrorCode({ code: "23505", message: "duplicate" })).toBe("23505");
  });

  it("walks Drizzle-style cause chains", () => {
    expect(
      getPostgresErrorCode({
        message: "Failed query",
        cause: { code: "23505", message: "unique_violation" },
      }),
    ).toBe("23505");
  });

  it("returns undefined when no postgres code is present", () => {
    expect(getPostgresErrorCode(new Error("network"))).toBeUndefined();
  });
});
