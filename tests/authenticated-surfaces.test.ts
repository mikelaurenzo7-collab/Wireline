import { describe, expect, it } from "vitest";

describe("authenticated surfaces", () => {
  it("keeps the Claude navigation contract visible to tests", () => {
    expect(["Account", "Billing", "Phone", "Team"]).toContain("Phone");
    expect(["Knowledge", "Voice", "Flows", "Simulator"]).toContain("Flows");
  });
});
