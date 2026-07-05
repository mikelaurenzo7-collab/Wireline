import { describe, expect, it } from "vitest";
import { isUuid, normalizeUuid } from "./uuid";

describe("uuid guards", () => {
  it("accepts valid UUID strings and trims them", () => {
    expect(isUuid("237d05cb-0d27-438f-980a-be5cb6e78024")).toBe(true);
    expect(normalizeUuid(" 237d05cb-0d27-438f-980a-be5cb6e78024 ")).toBe(
      "237d05cb-0d27-438f-980a-be5cb6e78024",
    );
  });

  it("rejects non-UUID identifiers where Postgres UUID columns are expected", () => {
    expect(isUuid("e2e-gold@trywireline.com")).toBe(false);
    expect(normalizeUuid("e2e-gold@trywireline.com")).toBeUndefined();
    expect(normalizeUuid("")).toBeUndefined();
  });
});
