import { beforeEach, describe, expect, it, vi } from "vitest";
import { runDirectorDesignStudio } from "./director-design-orchestrator";

vi.mock("./openrouter-structured", () => ({
  isOpenRouterConfigured: vi.fn().mockReturnValue(true),
  runOpenRouterCompletion: vi.fn(),
}));

vi.mock("./claude-structured", () => ({
  runCompletion: vi.fn(),
  runStructured: vi.fn(),
}));

vi.mock("./gemini-brain", () => ({
  runGeminiJsonCompletion: vi.fn(),
}));

vi.mock("./director-html-prototype", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./director-html-prototype")>();
  return {
    ...actual,
    packageDirectorHtmlPrototypePreview: vi.fn().mockResolvedValue({
      preview: {
        conceptId: "design-abc",
        title: "Acme Plumbing",
        rationale: "Wireline Design",
        kind: "stitch",
        previewDataUrl: "",
        htmlDownloadUrl: "/api/director/artifacts/signed",
        htmlArtifactId: "art-1",
        deviceType: "MOBILE",
      },
      artifacts: [{ id: "art-1", name: "design.html" }],
    }),
  };
});

import { runCompletion, runStructured } from "./claude-structured";
import { runGeminiJsonCompletion } from "./gemini-brain";
import { runOpenRouterCompletion } from "./openrouter-structured";

describe("runDirectorDesignStudio", () => {
  beforeEach(() => {
    vi.mocked(runOpenRouterCompletion).mockReset();
    vi.mocked(runCompletion).mockReset();
    vi.mocked(runStructured).mockReset();
    vi.mocked(runGeminiJsonCompletion).mockReset();
  });

  const baseInput = {
    userId: "user-1",
    operatorMessage: "Design a landing page for emergency plumbing homeowners",
    designBriefMarkdown: "# Design brief\nAudience: homeowners",
    history: [],
    stitchOptions: { designMode: true as const },
  };

  it("runs consultant, builder, critics, and packages preview", async () => {
    vi.mocked(runOpenRouterCompletion)
      .mockResolvedValueOnce("Market: trust badges, avoid stock wrench clipart.")
      .mockResolvedValueOnce("Mood: warm terracotta + deep navy editorial split hero.")
      .mockResolvedValueOnce(
        "<!doctype html><html><head><title>Acme</title></head><body><h1>Acme Plumbing</h1></body></html>",
      );

    vi.mocked(runStructured)
      .mockResolvedValueOnce({
        overall: 8,
        hierarchy: 8,
        mobile: 8,
        accessibility: 8,
        distinctiveness: 8,
        industry_fit: 8,
        issues: [],
      })
      .mockResolvedValueOnce({
        decision: "approve",
        operatorReply: "Your **Acme Plumbing** page is ready.",
        pageTitle: "Acme Plumbing",
      });

    vi.mocked(runGeminiJsonCompletion).mockResolvedValueOnce({
      overall: 8,
      hierarchy: 8,
      mobile: 8,
      accessibility: 8,
      distinctiveness: 8,
      industry_fit: 8,
      issues: [],
    });

    const turn = await runDirectorDesignStudio(baseInput);

    expect(runOpenRouterCompletion).toHaveBeenCalled();
    expect(turn.previews).toHaveLength(1);
    expect(turn.previews[0]?.htmlArtifactId).toBe("art-1");
    expect(turn.reply).toContain("Acme Plumbing");
    expect(turn.thinkingSummary).toContain("Build");
    expect(runCompletion).not.toHaveBeenCalled();
  });

  it("revises once when final reviewer requests changes", async () => {
    vi.mocked(runOpenRouterCompletion)
      .mockResolvedValueOnce("Market notes")
      .mockResolvedValueOnce("Mood notes")
      .mockResolvedValueOnce("<!doctype html><html><body><h1>v1</h1></body></html>")
      .mockResolvedValueOnce("<!doctype html><html><body><h1>v2</h1></body></html>");

    vi.mocked(runStructured)
      .mockResolvedValueOnce({
        overall: 6,
        hierarchy: 6,
        mobile: 6,
        accessibility: 6,
        distinctiveness: 6,
        industry_fit: 6,
        issues: ["CTA too small"],
      })
      .mockResolvedValueOnce({
        decision: "revise",
        revisionNotes: "Increase CTA size and contrast",
        operatorReply: "Updated your page with a stronger call to action.",
        pageTitle: "Plumbing landing",
      });

    vi.mocked(runGeminiJsonCompletion).mockResolvedValueOnce({
      overall: 6,
      hierarchy: 6,
      mobile: 6,
      accessibility: 6,
      distinctiveness: 6,
      industry_fit: 6,
      issues: [],
    });

    const turn = await runDirectorDesignStudio(baseInput);
    expect(runOpenRouterCompletion).toHaveBeenCalledTimes(4);
    expect(turn.reply).toContain("call to action");
  });
});
