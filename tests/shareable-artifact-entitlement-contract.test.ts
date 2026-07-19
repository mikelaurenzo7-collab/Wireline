import { describe, expect, it } from "vitest";

import {
  canWhiteLabelProposals,
  isBrandedArtifactEntitled,
} from "../src/lib/shareable-artifact/entitlement";
import { planById } from "../src/lib/plan-catalog";

describe("shareable-artifact entitlement gate", () => {
  it("blocks Free Builder and Starter from publishing artifacts", () => {
    expect(isBrandedArtifactEntitled(planById("personal"))).toBe(false);
    expect(isBrandedArtifactEntitled(planById("starter"))).toBe(false);
    expect(isBrandedArtifactEntitled(null)).toBe(false);
    expect(isBrandedArtifactEntitled(undefined)).toBe(false);
  });

  it("allows Starter Plus, Pro, and Business per the plan-catalog promise", () => {
    expect(isBrandedArtifactEntitled(planById("team"))).toBe(true);
    expect(isBrandedArtifactEntitled(planById("business"))).toBe(true);
    expect(isBrandedArtifactEntitled(planById("enterprise"))).toBe(true);
  });

  it("only Pro and Business can hide the Wireline credit on proposals", () => {
    expect(canWhiteLabelProposals(planById("team"))).toBe(false);
    expect(canWhiteLabelProposals(planById("business"))).toBe(true);
    expect(canWhiteLabelProposals(planById("enterprise"))).toBe(true);
    expect(canWhiteLabelProposals(planById("personal"))).toBe(false);
    expect(canWhiteLabelProposals(null)).toBe(false);
  });
});
