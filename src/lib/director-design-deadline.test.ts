import { describe, expect, it } from "vitest";
import {
  createDesignStudioDeadline,
  designStudioRemainingMs,
  shouldSkipOptionalChallenger,
  shouldStartRefinementPass,
} from "./director-design-deadline";

describe("design studio deadline", () => {
  it("skips challenger when time is low", () => {
    const deadline = createDesignStudioDeadline(0);
    expect(shouldSkipOptionalChallenger(deadline, deadline.deadlineAt - 100_000)).toBe(true);
    expect(shouldSkipOptionalChallenger(deadline, 0)).toBe(false);
  });

  it("allows pass 2 with healthy budget and blocks pass 3 when tight", () => {
    const deadline = createDesignStudioDeadline(0);
    expect(shouldStartRefinementPass(deadline, 2, 60_000)).toBe(true);
    expect(shouldStartRefinementPass(deadline, 3, deadline.deadlineAt - 80_000)).toBe(false);
  });

  it("tracks remaining ms", () => {
    const deadline = createDesignStudioDeadline(1_000);
    expect(designStudioRemainingMs(deadline, 1_000)).toBeGreaterThan(500_000);
  });
});
