import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStitchChatDesignGuidance,
  resolveStitchDirectorPath,
} from "./director-stitch-fallback";

vi.mock("./director-stitch-service", () => ({
  tryDirectorStitchTurn: vi.fn(),
}));

vi.mock("./google-stitch-config", () => ({
  isGoogleStitchConfigured: vi.fn(() => false),
}));

vi.mock("./director-stitch-brief", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./director-stitch-brief")>();
  return {
    ...actual,
    loadStitchTenantBranding: vi.fn().mockResolvedValue({
      brandName: "Acme",
      brandLogoUrl: null,
      primaryColor: "#C45A11",
      businessName: "Acme Plumbing",
      businessType: "plumbing",
      primaryProduct: "Drain cleaning",
    }),
  };
});

import { tryDirectorStitchTurn } from "./director-stitch-service";
import { isGoogleStitchConfigured } from "./google-stitch-config";
import { WIRELINE_STITCH_UI } from "./wireline-director-design";

describe("director stitch fallback", () => {
  beforeEach(() => {
    vi.mocked(tryDirectorStitchTurn).mockReset();
    vi.mocked(isGoogleStitchConfigured).mockReturnValue(false);
  });

  const input = {
    userId: "user-1",
    operatorMessage: "Design a landing page for homeowners who need emergency plumbing",
    history: [] as Array<{ role: "operator" | "director"; content: string }>,
  };

  it("builds chat design guidance with design.md and html prototype instructions", () => {
    const md = "# Design brief — Acme";
    const guidance = buildStitchChatDesignGuidance(input.operatorMessage, md);
    expect(guidance).toContain("Wireline Design (chat mode");
    expect(guidance).toContain("```html");
    expect(guidance).toContain(md);
  });

  it("returns clarify turns as stitch without LLM fallback", async () => {
    vi.mocked(tryDirectorStitchTurn).mockResolvedValueOnce({
      reply: "Before I generate screens, I need a bit more context.",
      previews: [],
      artifacts: [{ name: "design.md" }],
      clarifyingQuestions: ["Who is the primary audience?"],
      thinkingSummary: "Gathering design requirements",
      durationMs: 5,
    });

    const result = await resolveStitchDirectorPath({
      ...input,
      operatorMessage: "Design a landing page",
    });
    expect(result.kind).toBe("stitch");
  });

  it("returns stitch turn when render succeeds", async () => {
    vi.mocked(tryDirectorStitchTurn).mockResolvedValueOnce({
      reply: "Rendered",
      previews: [{ kind: "stitch" }],
      artifacts: [],
      thinkingSummary: "Done",
      durationMs: 10,
    });

    const result = await resolveStitchDirectorPath(input);
    expect(result.kind).toBe("stitch");
    if (result.kind === "stitch") {
      expect(result.turn.reply).toBe("Rendered");
    }
  });

  it("falls back to LLM design context when stitch returns null and Stitch is off", async () => {
    vi.mocked(tryDirectorStitchTurn).mockResolvedValueOnce(null);

    const result = await resolveStitchDirectorPath(input);
    expect(result.kind).toBe("llm-fallback");
    if (result.kind === "llm-fallback") {
      expect(result.fallback.deliverableGuidance).toContain("design.md");
      expect(result.fallback.artifacts[0]).toMatchObject({
        artifactType: "stitch-design-brief",
        name: "design.md",
      });
    }
  });

  it("returns stitch-failed copy when stitch returns null but Stitch is configured", async () => {
    vi.mocked(isGoogleStitchConfigured).mockReturnValue(true);
    vi.mocked(tryDirectorStitchTurn).mockResolvedValueOnce(null);

    const result = await resolveStitchDirectorPath(input);
    expect(result.kind).toBe("stitch-failed");
    if (result.kind === "stitch-failed") {
      expect(result.turn.reply).toBe(WIRELINE_STITCH_UI.failReply);
    }
  });

  it("ignores non-stitch operator messages", async () => {
    const result = await resolveStitchDirectorPath({
      ...input,
      operatorMessage: "How is my fleet doing this week?",
    });
    expect(result.kind).toBe("none");
    expect(tryDirectorStitchTurn).not.toHaveBeenCalled();
  });
});
