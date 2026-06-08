import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDesignChatGuidance,
  resolveDesignDirectorPath,
} from "./director-design-path";

vi.mock("./director-design-orchestrator", () => ({
  runDirectorDesignStudio: vi.fn(),
}));

vi.mock("./director-design-turn", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./director-design-turn")>();
  return {
    ...actual,
    prepareDirectorDesignTurn: vi.fn(),
  };
});

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

import { runDirectorDesignStudio } from "./director-design-orchestrator";
import { prepareDirectorDesignTurn } from "./director-design-turn";

describe("director design path", () => {
  beforeEach(() => {
    vi.mocked(prepareDirectorDesignTurn).mockReset();
    vi.mocked(runDirectorDesignStudio).mockReset();
  });

  const input = {
    userId: "user-1",
    operatorMessage: "Design a landing page for homeowners who need emergency plumbing",
    history: [] as Array<{ role: "operator" | "director"; content: string }>,
    stitchOptions: { designMode: true as const },
  };

  it("builds chat design guidance with design.md and html prototype instructions", () => {
    const md = "# Design brief — Acme";
    const guidance = buildDesignChatGuidance(input.operatorMessage, md);
    expect(guidance).toContain("Wireline Design (chat mode");
    expect(guidance).toContain("```html");
    expect(guidance).toContain(md);
  });

  it("routes design mode to Spectrum Desk", async () => {
    vi.mocked(prepareDirectorDesignTurn).mockResolvedValueOnce({
      phase: "render",
      input: {
        ...input,
        designBriefMarkdown: "# brief",
      },
    });
    vi.mocked(runDirectorDesignStudio).mockResolvedValueOnce({
      reply: "Your page is ready.",
      previews: [{ conceptId: "d1", title: "Page", rationale: "", previewDataUrl: "" }],
      artifacts: [],
      thinkingSummary: "Build",
      durationMs: 100,
    });

    const result = await resolveDesignDirectorPath(input);
    expect(result.kind).toBe("design");
    expect(runDirectorDesignStudio).toHaveBeenCalled();
  });

  it("returns clarify turns without running the studio", async () => {
    vi.mocked(prepareDirectorDesignTurn).mockResolvedValueOnce({
      phase: "clarify",
      turn: {
        reply: "Before I generate screens, I need a bit more context.",
        previews: [],
        artifacts: [{ name: "design.md" }],
        clarifyingQuestions: ["Who is the primary audience?"],
        thinkingSummary: "Gathering design requirements",
        durationMs: 5,
      },
    });

    const result = await resolveDesignDirectorPath({
      ...input,
      operatorMessage: "Design a landing page",
    });
    expect(result.kind).toBe("design");
    expect(runDirectorDesignStudio).not.toHaveBeenCalled();
  });

  it("falls back to chat design when Spectrum Desk throws", async () => {
    vi.mocked(prepareDirectorDesignTurn).mockResolvedValueOnce({
      phase: "render",
      input: {
        ...input,
        designBriefMarkdown: "# brief",
      },
    });
    vi.mocked(runDirectorDesignStudio).mockRejectedValueOnce(new Error("OpenRouter timeout"));

    const result = await resolveDesignDirectorPath(input);
    expect(result.kind).toBe("llm-fallback");
    if (result.kind === "llm-fallback") {
      expect(result.fallback.deliverableGuidance).toContain("design.md");
      expect(result.fallback.artifacts[0]).toMatchObject({
        artifactType: "stitch-design-brief",
        name: "design.md",
      });
    }
  });

  it("ignores non-design operator messages", async () => {
    const result = await resolveDesignDirectorPath({
      ...input,
      operatorMessage: "How is my fleet doing this week?",
      stitchOptions: undefined,
    });
    expect(result.kind).toBe("none");
    expect(runDirectorDesignStudio).not.toHaveBeenCalled();
  });
});
