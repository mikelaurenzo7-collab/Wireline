import { describe, expect, it } from "vitest";
import { WIRELINE_DESIGN_TEAM } from "./director-design-team";

describe("WIRELINE_DESIGN_TEAM", () => {
  it("keeps creative consultants separate from the HTML builder", () => {
    const builderId = WIRELINE_DESIGN_TEAM.builder.openRouterModelId;
    for (const consultant of WIRELINE_DESIGN_TEAM.creativeConsultants) {
      expect(consultant.openRouterModelId).not.toBe(builderId);
      expect(consultant.role).toMatch(/market_signals|visual_mood|copy_voice/);
    }
  });

  it("disables image reference by default", () => {
    expect(WIRELINE_DESIGN_TEAM.imageReference.enabled).toBe(false);
  });
});
