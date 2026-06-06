import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./google-stitch-config", () => ({
  isGoogleStitchConfigured: vi.fn(() => false),
  getGoogleStitchApiKey: vi.fn(() => ""),
  getGoogleStitchProjectId: vi.fn(() => ""),
}));

vi.mock("./director-stitch-session", () => ({
  loadLatestStitchSession: vi.fn().mockResolvedValue(null),
}));

vi.mock("./director-stitch-brief", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./director-stitch-brief")>();
  return {
    ...actual,
    loadStitchTenantBranding: vi.fn().mockResolvedValue({
      brandName: null,
      brandLogoUrl: null,
      primaryColor: null,
      businessName: null,
      businessType: null,
      primaryProduct: null,
    }),
  };
});

import { isGoogleStitchConfigured } from "./google-stitch-config";
import { prepareStitchDirectorTurn, tryDirectorStitchTurn } from "./director-stitch-service";

describe("director stitch clarify gate", () => {
  beforeEach(() => {
    vi.mocked(isGoogleStitchConfigured).mockReturnValue(false);
  });

  it("returns clarifying questions before checking Stitch configuration", async () => {
    const prepared = await prepareStitchDirectorTurn({
      userId: "user-1",
      operatorMessage: "Design a landing page",
      history: [],
    });
    expect(prepared.phase).toBe("clarify");
    if (prepared.phase === "clarify") {
      expect(prepared.turn.clarifyingQuestions?.length).toBeGreaterThan(0);
      expect(prepared.turn.artifacts[0]).toMatchObject({ name: "design.md" });
    }
  });

  it("tryDirectorStitchTurn returns clarify instead of null when Stitch is off", async () => {
    const turn = await tryDirectorStitchTurn({
      userId: "user-1",
      operatorMessage: "Design a landing page",
      history: [],
    });
    expect(turn).not.toBeNull();
    expect(turn?.clarifyingQuestions?.length).toBeGreaterThan(0);
  });
});
