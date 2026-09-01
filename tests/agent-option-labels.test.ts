import { describe, expect, it } from "vitest";

import { buildAgentOptionLabels } from "../src/lib/agent-option-labels";

describe("Studio Bot option labels", () => {
  it("keeps unique names compact and disambiguates duplicate names by role", () => {
    const labels = buildAgentOptionLabels([
      { id: "jake-showcase", name: "Jake", role: "Outbound Sales Demo" },
      { id: "jake-sales", name: "Jake", role: "sales" },
      { id: "mira", name: "Mira", role: "reception" },
    ]);

    expect(labels.get("jake-showcase")).toBe("Jake · Outbound Sales Demo");
    expect(labels.get("jake-sales")).toBe("Jake · Sales");
    expect(labels.get("mira")).toBe("Mira");
  });

  it("adds a roster-order suffix when both name and role are identical", () => {
    const labels = buildAgentOptionLabels([
      { id: "a", name: "Aisha", role: "sales" },
      { id: "b", name: "Aisha", role: "sales" },
    ]);

    expect(labels.get("a")).toBe("Aisha · Sales · 1");
    expect(labels.get("b")).toBe("Aisha · Sales · 2");
  });
});
