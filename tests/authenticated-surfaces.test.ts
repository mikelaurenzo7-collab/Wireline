import { describe, expect, it } from "vitest";
import { AUTHENTICATED_SURFACE_CONTRACT } from "../src/lib/authenticated-surface-contract";

describe("authenticated surfaces", () => {
  it("keeps settings and knowledge tabs on the Claude layout", () => {
    expect(AUTHENTICATED_SURFACE_CONTRACT.settings.tabs).toEqual([
      "Account",
      "Billing",
      "Phone",
      "Team",
    ]);
    expect(AUTHENTICATED_SURFACE_CONTRACT.training.tabs).toEqual([
      "Knowledge",
      "Voice",
      "Flows",
      "Simulator",
    ]);
  });

  it("uses overview as the assistant roster and studio as the canvas", () => {
    expect(AUTHENTICATED_SURFACE_CONTRACT.hierarchy.overview).toMatch(
      /agent roster|health summary|next-action home/i,
    );
    expect(AUTHENTICATED_SURFACE_CONTRACT.hierarchy.studio).toMatch(/canvas|studio|chat/i);
    expect(AUTHENTICATED_SURFACE_CONTRACT.hierarchy.agentsRoute).toMatch(
      /defensive redirect to overview/i,
    );
  });
});
