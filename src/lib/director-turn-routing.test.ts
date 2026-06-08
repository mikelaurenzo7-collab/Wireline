import { describe, expect, it } from "vitest";
import { previewDirectorStreamRouting } from "./director-turn";
import type { DirectorFleetAgent } from "./director-planner";

const FLEET: DirectorFleetAgent[] = [
  { id: "wireline-sales", name: "Casey", role: "wireline sales" },
];

describe("previewDirectorStreamRouting", () => {
  it("routes coach turns to Sonnet without Deep", () => {
    const preview = previewDirectorStreamRouting({
      userId: "user-1",
      operatorMessage: "Make Casey's greeting warmer",
      history: [],
      fleet: FLEET,
      focusAgentId: "wireline-sales",
      focusAgentName: "Casey",
    });
    expect(preview.mode).toBe("coach");
    expect(preview.model).toBe("sonnet");
    expect(preview.deep).toBe(false);
    expect(preview.focusAgentName).toBe("Casey");
  });

  it("keeps fleet audits on Sonnet unless Deep is forced", () => {
    const preview = previewDirectorStreamRouting({
      userId: "user-1",
      operatorMessage: "Audit my fleet — what should I fix first?",
      history: [],
      fleet: FLEET,
    });
    expect(preview.mode).toBe("fleet");
    expect(preview.model).toBe("sonnet");
    expect(preview.deep).toBe(false);
  });
});
