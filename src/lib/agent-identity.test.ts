import { describe, expect, it } from "vitest";

import { normalizeFaceSeed } from "./agent-identity";

describe("agent identity policy", () => {
  it("normalizes seeds", () => {
    expect(normalizeFaceSeed("  Sarah   Connor ")).toBe("Sarah Connor");
  });
});
